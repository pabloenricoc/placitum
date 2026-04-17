import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analisarPublicacao } from '@/lib/analise-ia/orchestrator';
import type { AnalisarDeps } from '@/lib/analise-ia/orchestrator';
import {
  AiParseError,
  AiSchemaError,
  AiUnavailableError,
  ConflictError,
  NotFoundError,
} from '@/lib/analise-ia/errors';
import {
  respostaValida,
  respostaSchemaInvalido,
  respostaConfiancaBaixa,
  respostaSemProcesso,
} from './fixtures/respostas';

interface StoredPublicacao {
  id: string;
  escritorioId: string;
  textoIntegral: string;
  fonte: string;
  dataPublicacao: Date;
  statusAnalise:
    | 'NOVA'
    | 'EM_ANALISE'
    | 'ANALISADA'
    | 'PRAZO_CADASTRADO'
    | 'PECA_GERADA'
    | 'ERRO';
  confiancaIA: 'ALTA' | 'MEDIA' | 'BAIXA' | null;
  dadosExtraidos: unknown;
  processoId: string | null;
}

interface StoredProcesso {
  id: string;
  escritorioId: string;
  numeroProcesso: string;
  vara: string | null;
  comarca: string | null;
  parteCliente: string;
  areaDireito: string;
}

interface StoredPrazo {
  id: string;
  publicacaoId: string;
  tipoProvidencia: string;
  diasPrazo: number;
  tipoContagem: 'UTEIS' | 'CORRIDOS';
  dataLimite: Date;
}

interface StoredConsumo {
  id: string;
  escritorioId: string;
  publicacaoId: string | null;
  modelo: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  custoEstimadoBrl: number;
}

function makeState() {
  const publicacoes: StoredPublicacao[] = [
    {
      id: 'pub-1',
      escritorioId: 'esc-a',
      textoIntegral:
        'Fica a parte intimada para contestar, CPF 123.456.789-00, no prazo de 15 dias úteis. Processo 0001234-56.2024.8.26.0100.',
      fonte: 'DJe-TJSP',
      dataPublicacao: new Date('2026-04-10T12:00:00Z'),
      statusAnalise: 'NOVA',
      confiancaIA: null,
      dadosExtraidos: null,
      processoId: null,
    },
    {
      id: 'pub-analisada',
      escritorioId: 'esc-a',
      textoIntegral: 'x'.repeat(100),
      fonte: 'DJe-TJCE',
      dataPublicacao: new Date('2026-04-05T12:00:00Z'),
      statusAnalise: 'ANALISADA',
      confiancaIA: 'ALTA',
      dadosExtraidos: null,
      processoId: null,
    },
    {
      id: 'pub-b',
      escritorioId: 'esc-b',
      textoIntegral: 'y'.repeat(100),
      fonte: 'DJe-TJSP',
      dataPublicacao: new Date('2026-04-10T12:00:00Z'),
      statusAnalise: 'NOVA',
      confiancaIA: null,
      dadosExtraidos: null,
      processoId: null,
    },
  ];
  const processos: StoredProcesso[] = [];
  const prazos: StoredPrazo[] = [];
  const consumos: StoredConsumo[] = [];
  const feriados: { data: Date; ambito: string; estado: string | null; comarca: string | null }[] = [];
  return { publicacoes, processos, prazos, consumos, feriados };
}

type State = ReturnType<typeof makeState>;

interface QueryWhere {
  id?: string;
  escritorioId?: string;
  statusAnalise?: string;
  numeroProcesso?: string;
}

interface FindFirstArgs {
  where: QueryWhere;
  include?: { processo?: boolean };
}

interface UpdateArgs {
  where: QueryWhere;
  data: Record<string, unknown>;
}

interface CreateArgs {
  data: Record<string, unknown>;
}

function makePrismaMock(state: State) {
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}-${++counter}`;

  const publicacao = {
    findFirst: vi.fn(async ({ where, include }: FindFirstArgs) => {
      const row = state.publicacoes.find(
        (p) =>
          p.id === where.id &&
          (where.escritorioId ? p.escritorioId === where.escritorioId : true) &&
          (where.statusAnalise ? p.statusAnalise === where.statusAnalise : true),
      );
      if (!row) return null;
      const processo = row.processoId
        ? state.processos.find((p) => p.id === row.processoId) ?? null
        : null;
      if (include?.processo) return { ...row, processo };
      return { ...row };
    }),
    updateMany: vi.fn(async ({ where, data }: UpdateArgs) => {
      const candidatos = state.publicacoes.filter(
        (p) =>
          p.id === where.id &&
          (where.statusAnalise ? p.statusAnalise === where.statusAnalise : true),
      );
      for (const p of candidatos) Object.assign(p, data);
      return { count: candidatos.length };
    }),
    update: vi.fn(async ({ where, data }: UpdateArgs) => {
      const row = state.publicacoes.find((p) => p.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
  };

  const processo = {
    findFirst: vi.fn(async ({ where }: FindFirstArgs) => {
      return (
        state.processos.find(
          (p) =>
            p.escritorioId === where.escritorioId &&
            p.numeroProcesso === where.numeroProcesso,
        ) ?? null
      );
    }),
    create: vi.fn(async ({ data }: CreateArgs) => {
      const novo = { id: nextId('proc'), ...data } as StoredProcesso;
      state.processos.push(novo);
      return novo;
    }),
  };

  const prazo = {
    create: vi.fn(async ({ data }: CreateArgs) => {
      const novo = { id: nextId('prz'), ...data } as StoredPrazo;
      state.prazos.push(novo);
      return novo;
    }),
  };

  const consumoIA = {
    create: vi.fn(async ({ data }: CreateArgs) => {
      const novo = { id: nextId('cons'), ...data } as StoredConsumo;
      state.consumos.push(novo);
      return novo;
    }),
  };

  const feriado = {
    findMany: vi.fn(async () => state.feriados),
  };

  type TxCallback = (tx: {
    publicacao: typeof publicacao;
    processo: typeof processo;
    prazo: typeof prazo;
    consumoIA: typeof consumoIA;
  }) => Promise<unknown>;

  const $transaction = vi.fn(
    async (fnOrOps: TxCallback | Promise<unknown>[]) => {
      if (typeof fnOrOps === 'function') {
        return fnOrOps({
          publicacao,
          processo,
          prazo,
          consumoIA,
        });
      }
      return Promise.all(fnOrOps);
    },
  );

  return { publicacao, processo, prazo, consumoIA, feriado, $transaction };
}

type ChamarClaudeFn = AnalisarDeps['chamarClaude'];

function makeDeps(state: State, chamar: ChamarClaudeFn): AnalisarDeps {
  const prismaMock = makePrismaMock(state);
  return {
    prisma: prismaMock as unknown as AnalisarDeps['prisma'],
    chamarClaude: chamar,
    now: () => new Date('2026-04-17T10:00:00Z'),
  };
}

describe('analisarPublicacao — happy path (CA-1, CA-14, CA-21)', () => {
  let state: State;
  let chamar: ChamarClaudeFn;

  beforeEach(() => {
    state = makeState();
    chamar = vi.fn(async () => respostaValida) as unknown as ChamarClaudeFn;
  });

  it('CA-1: persiste status PRAZO_CADASTRADO, prazo, processo e consumo', async () => {
    const deps = makeDeps(state, chamar);

    const out = await analisarPublicacao(
      { publicacaoId: 'pub-1', escritorioId: 'esc-a' },
      deps,
    );

    expect(out.statusAnalise).toBe('PRAZO_CADASTRADO');
    expect(out.confianca).toBe('ALTA');

    const pub = state.publicacoes.find((p) => p.id === 'pub-1')!;
    expect(pub.statusAnalise).toBe('PRAZO_CADASTRADO');
    expect(pub.confiancaIA).toBe('ALTA');
    expect(pub.dadosExtraidos).toBeTruthy();

    expect(state.prazos).toHaveLength(1);
    expect(state.prazos[0].tipoProvidencia).toBe('CONTESTACAO');
    expect(state.prazos[0].diasPrazo).toBe(15);

    expect(state.consumos).toHaveLength(1);
    expect(state.consumos[0].modelo).toBe('claude-haiku-4-5-20251001');
    expect(state.consumos[0].inputTokens).toBe(1200);
    expect(state.consumos[0].outputTokens).toBe(300);
  });

  it('CA-14: cria Processo novo quando numeroProcesso não existe', async () => {
    const deps = makeDeps(state, chamar);

    await analisarPublicacao(
      { publicacaoId: 'pub-1', escritorioId: 'esc-a' },
      deps,
    );

    expect(state.processos).toHaveLength(1);
    expect(state.processos[0].numeroProcesso).toBe(
      '0001234-56.2024.8.26.0100',
    );
    expect(state.processos[0].escritorioId).toBe('esc-a');

    const pub = state.publicacoes.find((p) => p.id === 'pub-1')!;
    expect(pub.processoId).toBe(state.processos[0].id);
  });

  it('CA-15: não sobrescreve Processo existente', async () => {
    state.processos.push({
      id: 'proc-existente',
      escritorioId: 'esc-a',
      numeroProcesso: '0001234-56.2024.8.26.0100',
      vara: 'Vara Antiga',
      comarca: 'Comarca Antiga',
      parteCliente: 'Alfa',
      areaDireito: 'OUTRO',
    });

    const deps = makeDeps(state, chamar);

    await analisarPublicacao(
      { publicacaoId: 'pub-1', escritorioId: 'esc-a' },
      deps,
    );

    expect(state.processos).toHaveLength(1);
    expect(state.processos[0].parteCliente).toBe('Alfa');
    const pub = state.publicacoes.find((p) => p.id === 'pub-1')!;
    expect(pub.processoId).toBe('proc-existente');
  });
});

describe('analisarPublicacao — sanitização (CA-4)', () => {
  it('envia texto sanitizado à Claude (CPF mascarado)', async () => {
    const state = makeState();
    const chamar = vi.fn(async () => respostaValida) as unknown as ChamarClaudeFn;
    const deps = makeDeps(state, chamar);

    await analisarPublicacao(
      { publicacaoId: 'pub-1', escritorioId: 'esc-a' },
      deps,
    );

    const spy = chamar as unknown as import('vitest').Mock;
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0];
    expect(arg.textoSanitizado).not.toMatch(/123\.456\.789-00/);
    expect(arg.textoSanitizado).toContain('[CPF]');
  });

  it('textoIntegral no banco permanece com PII original', async () => {
    const state = makeState();
    const chamar = vi.fn(async () => respostaValida) as unknown as ChamarClaudeFn;
    const deps = makeDeps(state, chamar);

    await analisarPublicacao(
      { publicacaoId: 'pub-1', escritorioId: 'esc-a' },
      deps,
    );

    const pub = state.publicacoes.find((p) => p.id === 'pub-1')!;
    expect(pub.textoIntegral).toContain('123.456.789-00');
  });
});

describe('analisarPublicacao — falhas', () => {
  it('CA-2: publicação de outro escritório → NotFoundError', async () => {
    const state = makeState();
    const chamar = vi.fn() as unknown as ChamarClaudeFn;
    const deps = makeDeps(state, chamar);

    await expect(
      analisarPublicacao(
        { publicacaoId: 'pub-b', escritorioId: 'esc-a' },
        deps,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(chamar).not.toHaveBeenCalled();
    expect(state.prazos).toHaveLength(0);
  });

  it('CA-3: publicação já analisada → ConflictError', async () => {
    const state = makeState();
    const chamar = vi.fn() as unknown as ChamarClaudeFn;
    const deps = makeDeps(state, chamar);

    await expect(
      analisarPublicacao(
        { publicacaoId: 'pub-analisada', escritorioId: 'esc-a' },
        deps,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(chamar).not.toHaveBeenCalled();
  });

  it('CA-6: JSON inválido → AiParseError + ERRO + ConsumoIA', async () => {
    const state = makeState();
    const chamar = vi.fn(async () => {
      throw new AiParseError('parse fail', {
        input_tokens: 500,
        output_tokens: 10,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      });
    }) as unknown as ChamarClaudeFn;
    const deps = makeDeps(state, chamar);

    await expect(
      analisarPublicacao(
        { publicacaoId: 'pub-1', escritorioId: 'esc-a' },
        deps,
      ),
    ).rejects.toBeInstanceOf(AiParseError);

    const pub = state.publicacoes.find((p) => p.id === 'pub-1')!;
    expect(pub.statusAnalise).toBe('ERRO');
    expect(state.prazos).toHaveLength(0);
    expect(state.consumos).toHaveLength(1);
  });

  it('CA-7: schema inválido → AiSchemaError + ERRO', async () => {
    const state = makeState();
    const chamar = vi.fn(async () => respostaSchemaInvalido) as unknown as ChamarClaudeFn;
    const deps = makeDeps(state, chamar);

    await expect(
      analisarPublicacao(
        { publicacaoId: 'pub-1', escritorioId: 'esc-a' },
        deps,
      ),
    ).rejects.toBeInstanceOf(AiSchemaError);

    const pub = state.publicacoes.find((p) => p.id === 'pub-1')!;
    expect(pub.statusAnalise).toBe('ERRO');
    expect(state.prazos).toHaveLength(0);
  });

  it('CA-8: SDK rejeita → AiUnavailableError + ERRO', async () => {
    const state = makeState();
    const chamar = vi.fn(async () => {
      throw new AiUnavailableError('timeout');
    }) as unknown as ChamarClaudeFn;
    const deps = makeDeps(state, chamar);

    await expect(
      analisarPublicacao(
        { publicacaoId: 'pub-1', escritorioId: 'esc-a' },
        deps,
      ),
    ).rejects.toBeInstanceOf(AiUnavailableError);

    const pub = state.publicacoes.find((p) => p.id === 'pub-1')!;
    expect(pub.statusAnalise).toBe('ERRO');
  });
});

describe('analisarPublicacao — confiança e prazo', () => {
  it('CA-9: confiança BAIXA → ANALISADA (não PRAZO_CADASTRADO) e Prazo é criado', async () => {
    const state = makeState();
    const chamar = vi.fn(async () => respostaConfiancaBaixa) as unknown as ChamarClaudeFn;
    const deps = makeDeps(state, chamar);

    const out = await analisarPublicacao(
      { publicacaoId: 'pub-1', escritorioId: 'esc-a' },
      deps,
    );

    expect(out.statusAnalise).toBe('ANALISADA');
    expect(out.confianca).toBe('BAIXA');
    expect(state.prazos).toHaveLength(1);
  });

  it('não cria Processo quando IA não retorna numeroProcesso', async () => {
    const state = makeState();
    const chamar = vi.fn(async () => respostaSemProcesso) as unknown as ChamarClaudeFn;
    const deps = makeDeps(state, chamar);

    await analisarPublicacao(
      { publicacaoId: 'pub-1', escritorioId: 'esc-a' },
      deps,
    );

    expect(state.processos).toHaveLength(0);
    const pub = state.publicacoes.find((p) => p.id === 'pub-1')!;
    expect(pub.processoId).toBeNull();
  });
});

describe('analisarPublicacao — concorrência (CA-22)', () => {
  it('apenas uma request ganha; a segunda recebe ConflictError', async () => {
    const state = makeState();
    const chamar = vi.fn(async () => respostaValida) as unknown as ChamarClaudeFn;
    const deps = makeDeps(state, chamar);

    const [r1, r2] = await Promise.allSettled([
      analisarPublicacao(
        { publicacaoId: 'pub-1', escritorioId: 'esc-a' },
        deps,
      ),
      analisarPublicacao(
        { publicacaoId: 'pub-1', escritorioId: 'esc-a' },
        deps,
      ),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual(['fulfilled', 'rejected']);
    const rej = [r1, r2].find((r) => r.status === 'rejected') as
      | PromiseRejectedResult
      | undefined;
    expect(rej?.reason).toBeInstanceOf(ConflictError);
    expect(state.prazos).toHaveLength(1);
  });
});
