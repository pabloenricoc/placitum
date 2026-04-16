import { describe, it, expect, vi } from 'vitest';
import {
  criarPublicacaoTexto,
  criarPublicacaoPdf,
  type CriarPublicacaoDeps,
} from '@/lib/publicacoes/create';
import {
  listarPublicacoes,
  type ListarPublicacoesDeps,
} from '@/lib/publicacoes/list';
import { ValidationError } from '@/lib/publicacoes/errors';

function makePrismaMock() {
  const publicacao = {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  };
  const $transaction = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
  return { publicacao, $transaction };
}

type PrismaMock = ReturnType<typeof makePrismaMock>;

function makeCreateDeps(
  overrides: Partial<CriarPublicacaoDeps> = {},
): CriarPublicacaoDeps & { prisma: PrismaMock } {
  const prisma = makePrismaMock();
  prisma.publicacao.create.mockResolvedValue({
    id: 'pub-1',
    escritorioId: 'esc-a',
    statusAnalise: 'NOVA',
    textoIntegral: 'stub',
    fonte: 'DJe-TJCE',
    dataPublicacao: new Date('2026-04-10T12:00:00Z'),
  });
  return {
    prisma: prisma as unknown as CriarPublicacaoDeps['prisma'],
    extractTextFromPdf: vi.fn(),
    ...overrides,
  } as CriarPublicacaoDeps & { prisma: PrismaMock };
}

describe('criarPublicacaoTexto (CA-1/2/3/4)', () => {
  it('CA-1: persiste com escritorioId da sessão e statusAnalise NOVA', async () => {
    const deps = makeCreateDeps();
    const texto = 'x'.repeat(80);

    const out = await criarPublicacaoTexto(
      { textoIntegral: texto, fonte: 'DJe-TJCE', dataPublicacao: '2026-04-10' },
      { escritorioId: 'esc-a', deps },
    );

    const prismaMock = deps.prisma as unknown as PrismaMock;
    expect(prismaMock.publicacao.create).toHaveBeenCalledTimes(1);
    const call = prismaMock.publicacao.create.mock.calls[0][0];
    expect(call.data.escritorioId).toBe('esc-a');
    expect(call.data.statusAnalise).toBe('NOVA');
    expect(call.data.textoIntegral).toBe(texto);
    expect(call.data.fonte).toBe('DJe-TJCE');
    expect(call.data.dataPublicacao).toBeInstanceOf(Date);
    expect(out.id).toBe('pub-1');
  });

  it('CA-1: cliente NÃO pode injetar escritorioId pelo payload', async () => {
    const deps = makeCreateDeps();
    const texto = 'x'.repeat(80);

    await criarPublicacaoTexto(
      {
        textoIntegral: texto,
        fonte: 'DJe-TJCE',
        dataPublicacao: '2026-04-10',
        // @ts-expect-error campo proibido deve ser descartado
        escritorioId: 'esc-ATACANTE',
      } as never,
      { escritorioId: 'esc-a', deps },
    );

    const prismaMock = deps.prisma as unknown as PrismaMock;
    const call = prismaMock.publicacao.create.mock.calls[0][0];
    expect(call.data.escritorioId).toBe('esc-a');
  });

  it('CA-2: rejeita texto curto com ValidationError', async () => {
    const deps = makeCreateDeps();
    await expect(
      criarPublicacaoTexto(
        { textoIntegral: 'curto', fonte: 'DJe-TJCE', dataPublicacao: '2026-04-10' },
        { escritorioId: 'esc-a', deps },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    const prismaMock = deps.prisma as unknown as PrismaMock;
    expect(prismaMock.publicacao.create).not.toHaveBeenCalled();
  });

  it('CA-3: rejeita sem fonte', async () => {
    const deps = makeCreateDeps();
    await expect(
      criarPublicacaoTexto(
        { textoIntegral: 'x'.repeat(80), fonte: '', dataPublicacao: '2026-04-10' },
        { escritorioId: 'esc-a', deps },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('CA-4: rejeita data futura', async () => {
    const deps = makeCreateDeps();
    const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await expect(
      criarPublicacaoTexto(
        { textoIntegral: 'x'.repeat(80), fonte: 'DJe-TJCE', dataPublicacao: amanha },
        { escritorioId: 'esc-a', deps },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('criarPublicacaoPdf (CA-5/6/7/8)', () => {
  it('CA-5: extrai texto do PDF e persiste', async () => {
    const extractor = vi.fn().mockResolvedValue('y'.repeat(200));
    const deps = makeCreateDeps({ extractTextFromPdf: extractor });
    const buffer = Buffer.from('%PDF-1.4 fake');

    await criarPublicacaoPdf(
      {
        buffer,
        tipoMime: 'application/pdf',
        tamanhoBytes: buffer.byteLength,
        fonte: 'DJe-TJSP',
        dataPublicacao: '2026-04-10',
      },
      { escritorioId: 'esc-a', deps },
    );

    expect(extractor).toHaveBeenCalledWith(buffer);
    const prismaMock = deps.prisma as unknown as PrismaMock;
    const call = prismaMock.publicacao.create.mock.calls[0][0];
    expect(call.data.textoIntegral).toBe('y'.repeat(200));
    expect(call.data.fonte).toBe('DJe-TJSP');
    expect(call.data.escritorioId).toBe('esc-a');
  });

  it('CA-6: rejeita arquivo > 5MB antes de chamar o extrator', async () => {
    const extractor = vi.fn();
    const deps = makeCreateDeps({ extractTextFromPdf: extractor });

    await expect(
      criarPublicacaoPdf(
        {
          buffer: Buffer.alloc(10),
          tipoMime: 'application/pdf',
          tamanhoBytes: 6 * 1024 * 1024,
          fonte: 'DJe-TJSP',
          dataPublicacao: '2026-04-10',
        },
        { escritorioId: 'esc-a', deps },
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(extractor).not.toHaveBeenCalled();
  });

  it('CA-7: rejeita MIME que não é PDF', async () => {
    const deps = makeCreateDeps();
    await expect(
      criarPublicacaoPdf(
        {
          buffer: Buffer.from('x'),
          tipoMime: 'text/plain',
          tamanhoBytes: 10,
          fonte: 'DJe-TJSP',
          dataPublicacao: '2026-04-10',
        },
        { escritorioId: 'esc-a', deps },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('CA-8: rejeita quando texto extraído < 50 chars', async () => {
    const extractor = vi.fn().mockResolvedValue('abc');
    const deps = makeCreateDeps({ extractTextFromPdf: extractor });
    const buffer = Buffer.from('%PDF-1.4 fake');

    await expect(
      criarPublicacaoPdf(
        {
          buffer,
          tipoMime: 'application/pdf',
          tamanhoBytes: buffer.byteLength,
          fonte: 'DJe-TJSP',
          dataPublicacao: '2026-04-10',
        },
        { escritorioId: 'esc-a', deps },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('preenche fonte default upload-manual quando omitida', async () => {
    const extractor = vi.fn().mockResolvedValue('z'.repeat(100));
    const deps = makeCreateDeps({ extractTextFromPdf: extractor });
    const buffer = Buffer.from('%PDF-1.4');

    await criarPublicacaoPdf(
      {
        buffer,
        tipoMime: 'application/pdf',
        tamanhoBytes: buffer.byteLength,
        dataPublicacao: '2026-04-10',
      },
      { escritorioId: 'esc-a', deps },
    );

    const prismaMock = deps.prisma as unknown as PrismaMock;
    const call = prismaMock.publicacao.create.mock.calls[0][0];
    expect(call.data.fonte).toBe('upload-manual');
  });
});

function makeListDeps(): ListarPublicacoesDeps & { prisma: PrismaMock } {
  const prisma = makePrismaMock();
  prisma.publicacao.count.mockResolvedValue(0);
  prisma.publicacao.findMany.mockResolvedValue([]);
  return { prisma: prisma as unknown as ListarPublicacoesDeps['prisma'] } as ListarPublicacoesDeps & {
    prisma: PrismaMock;
  };
}

describe('listarPublicacoes (CA-9 a CA-17)', () => {
  it('CA-9: where inclui escritorioId da sessão', async () => {
    const deps = makeListDeps();

    await listarPublicacoes({}, { escritorioId: 'esc-a', deps });

    const prismaMock = deps.prisma as unknown as PrismaMock;
    const findCall = prismaMock.publicacao.findMany.mock.calls[0][0];
    expect(findCall.where.escritorioId).toBe('esc-a');
    const countCall = prismaMock.publicacao.count.mock.calls[0][0];
    expect(countCall.where.escritorioId).toBe('esc-a');
  });

  it('CA-10: page 2 usa skip 20 e take 20', async () => {
    const deps = makeListDeps();

    await listarPublicacoes({ page: 2 }, { escritorioId: 'esc-a', deps });

    const prismaMock = deps.prisma as unknown as PrismaMock;
    const call = prismaMock.publicacao.findMany.mock.calls[0][0];
    expect(call.skip).toBe(20);
    expect(call.take).toBe(20);
  });

  it('CA-10: retorna total e totalPages corretos', async () => {
    const deps = makeListDeps();
    const prismaMock = deps.prisma as unknown as PrismaMock;
    prismaMock.publicacao.count.mockResolvedValue(45);
    prismaMock.publicacao.findMany.mockResolvedValue([]);

    const out = await listarPublicacoes(
      { page: 2 },
      { escritorioId: 'esc-a', deps },
    );

    expect(out.page).toBe(2);
    expect(out.pageSize).toBe(20);
    expect(out.total).toBe(45);
    expect(out.totalPages).toBe(3);
  });

  it('CA-11: orderBy é [dataPublicacao desc, createdAt desc]', async () => {
    const deps = makeListDeps();

    await listarPublicacoes({}, { escritorioId: 'esc-a', deps });

    const prismaMock = deps.prisma as unknown as PrismaMock;
    const call = prismaMock.publicacao.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([
      { dataPublicacao: 'desc' },
      { createdAt: 'desc' },
    ]);
  });

  it('CA-12: filtro status é aplicado', async () => {
    const deps = makeListDeps();

    await listarPublicacoes(
      { status: 'NOVA' },
      { escritorioId: 'esc-a', deps },
    );

    const prismaMock = deps.prisma as unknown as PrismaMock;
    const call = prismaMock.publicacao.findMany.mock.calls[0][0];
    expect(call.where.statusAnalise).toBe('NOVA');
  });

  it('CA-13: filtro tribunal vira fonte startsWith DJe-<tribunal>', async () => {
    const deps = makeListDeps();

    await listarPublicacoes(
      { tribunal: 'TJCE' },
      { escritorioId: 'esc-a', deps },
    );

    const prismaMock = deps.prisma as unknown as PrismaMock;
    const call = prismaMock.publicacao.findMany.mock.calls[0][0];
    expect(call.where.fonte).toMatchObject({ startsWith: 'DJe-TJCE' });
  });

  it('CA-14: filtro de período vira gte/lte em dataPublicacao', async () => {
    const deps = makeListDeps();

    await listarPublicacoes(
      { de: '2026-04-01', ate: '2026-04-30' },
      { escritorioId: 'esc-a', deps },
    );

    const prismaMock = deps.prisma as unknown as PrismaMock;
    const call = prismaMock.publicacao.findMany.mock.calls[0][0];
    expect(call.where.dataPublicacao.gte).toBeInstanceOf(Date);
    expect(call.where.dataPublicacao.lte).toBeInstanceOf(Date);
  });

  it('CA-15/16: q vira OR em numeroProcesso/parteCliente dentro de processo.is', async () => {
    const deps = makeListDeps();

    await listarPublicacoes(
      { q: 'mar azul' },
      { escritorioId: 'esc-a', deps },
    );

    const prismaMock = deps.prisma as unknown as PrismaMock;
    const call = prismaMock.publicacao.findMany.mock.calls[0][0];
    const processo = call.where.processo;
    expect(processo.is.OR).toHaveLength(2);
    expect(processo.is.OR[0].numeroProcesso).toMatchObject({
      contains: 'mar azul',
      mode: 'insensitive',
    });
    expect(processo.is.OR[1].parteCliente).toMatchObject({
      contains: 'mar azul',
      mode: 'insensitive',
    });
  });

  it('CA-17: q com menos de 3 chars é ignorado', async () => {
    const deps = makeListDeps();

    await listarPublicacoes({ q: 'ab' }, { escritorioId: 'esc-a', deps });

    const prismaMock = deps.prisma as unknown as PrismaMock;
    const call = prismaMock.publicacao.findMany.mock.calls[0][0];
    expect(call.where.processo).toBeUndefined();
  });

  it('include processo para exibir na tabela', async () => {
    const deps = makeListDeps();

    await listarPublicacoes({}, { escritorioId: 'esc-a', deps });

    const prismaMock = deps.prisma as unknown as PrismaMock;
    const call = prismaMock.publicacao.findMany.mock.calls[0][0];
    expect(call.include?.processo).toBe(true);
  });
});
