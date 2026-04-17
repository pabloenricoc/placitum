import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { sanitizarParaIA } from './sanitizar';
import { respostaIASchema } from './schema';
import { normalizarResposta } from './normalizar';
import { calcularCustoBrl, cotacaoBrl, MODELO_HAIKU } from './precos';
import {
  AiParseError,
  AiSchemaError,
  AiUnavailableError,
  ConflictError,
  NotFoundError,
} from './errors';
import type { RespostaBrutaIA, UsageTokens } from './claude';
import type { UserPromptInput } from '@/lib/prompts/analisar-publicacao';
import { calcularDataLimite } from '@/lib/prazos/calcular-prazo';
import { listarFeriadosAplicaveis } from '@/lib/prazos/feriados';

export interface AnalisarDeps {
  prisma: Pick<
    PrismaClient,
    'publicacao' | 'processo' | 'prazo' | 'consumoIA' | 'feriado' | '$transaction'
  >;
  chamarClaude: (input: UserPromptInput) => Promise<RespostaBrutaIA>;
  now: () => Date;
}

export interface AnalisarInput {
  publicacaoId: string;
  escritorioId: string;
}

export interface AnalisarResultado {
  publicacaoId: string;
  statusAnalise: 'ANALISADA' | 'PRAZO_CADASTRADO';
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
  prazoId: string;
  dataLimite: string;
}

function formatDataISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function registrarConsumo(
  deps: AnalisarDeps,
  params: {
    escritorioId: string;
    publicacaoId: string | null;
    usage: UsageTokens;
  },
): Promise<void> {
  try {
    await deps.prisma.consumoIA.create({
      data: {
        escritorioId: params.escritorioId,
        publicacaoId: params.publicacaoId,
        modelo: MODELO_HAIKU,
        inputTokens: params.usage.input_tokens,
        outputTokens: params.usage.output_tokens,
        cacheReadTokens: params.usage.cache_read_input_tokens,
        cacheCreationTokens: params.usage.cache_creation_input_tokens,
        custoEstimadoBrl: calcularCustoBrl(
          MODELO_HAIKU,
          params.usage,
          cotacaoBrl(),
        ),
      },
    });
  } catch (err) {
    console.warn('consumoIA_persist_failed', {
      publicacaoId: params.publicacaoId,
      tipoErro: err instanceof Error ? err.name : 'unknown',
    });
  }
}

async function marcarErro(
  deps: AnalisarDeps,
  publicacaoId: string,
): Promise<void> {
  try {
    await deps.prisma.publicacao.update({
      where: { id: publicacaoId },
      data: { statusAnalise: 'ERRO' },
    });
  } catch (err) {
    console.warn('marcar_erro_failed', {
      publicacaoId,
      tipoErro: err instanceof Error ? err.name : 'unknown',
    });
  }
}

export async function analisarPublicacao(
  input: AnalisarInput,
  deps: AnalisarDeps,
): Promise<AnalisarResultado> {
  const pub = await deps.prisma.publicacao.findFirst({
    where: { id: input.publicacaoId, escritorioId: input.escritorioId },
    include: { processo: true },
  });

  if (!pub) throw new NotFoundError();
  if (pub.statusAnalise !== 'NOVA') throw new ConflictError();

  const guard = await deps.prisma.publicacao.updateMany({
    where: { id: input.publicacaoId, statusAnalise: 'NOVA' },
    data: { statusAnalise: 'EM_ANALISE' },
  });
  if (guard.count === 0) throw new ConflictError();

  const textoSanitizado = sanitizarParaIA(pub.textoIntegral);

  let resposta: RespostaBrutaIA;
  try {
    resposta = await deps.chamarClaude({
      textoSanitizado,
      dataPublicacao: formatDataISO(pub.dataPublicacao),
      fonte: pub.fonte,
    });
  } catch (err) {
    await marcarErro(deps, pub.id);
    if (err instanceof AiParseError) {
      if (err.usage) {
        await registrarConsumo(deps, {
          escritorioId: input.escritorioId,
          publicacaoId: pub.id,
          usage: err.usage,
        });
      }
      throw err;
    }
    if (err instanceof AiUnavailableError) throw err;
    throw new AiUnavailableError(
      err instanceof Error ? err.message : 'Falha na análise.',
    );
  }

  const parsed = respostaIASchema.safeParse(resposta.objeto);
  if (!parsed.success) {
    await registrarConsumo(deps, {
      escritorioId: input.escritorioId,
      publicacaoId: pub.id,
      usage: resposta.usage,
    });
    await marcarErro(deps, pub.id);
    throw new AiSchemaError(
      parsed.error.issues[0]?.message ?? 'Resposta da IA inválida.',
      resposta.usage,
    );
  }

  const dados = normalizarResposta(parsed.data);

  const janelaFim = new Date(pub.dataPublicacao.getTime());
  janelaFim.setUTCDate(
    janelaFim.getUTCDate() + Math.max(dados.prazo.dias * 2, 30),
  );

  const feriados = await listarFeriadosAplicaveis(
    {
      de: pub.dataPublicacao,
      ate: janelaFim,
      estado: dados.estado,
      comarca: dados.comarca,
    },
    deps,
  );

  const dataLimite = calcularDataLimite({
    dataInicio: pub.dataPublicacao,
    dias: dados.prazo.dias,
    tipoContagem: dados.prazo.tipoContagem,
    feriados,
  });

  const statusFinal: 'ANALISADA' | 'PRAZO_CADASTRADO' =
    dados.confianca === 'BAIXA' ? 'ANALISADA' : 'PRAZO_CADASTRADO';

  const prazoId = await deps.prisma.$transaction(async (tx) => {
    let processoId: string | null = pub.processoId;

    if (dados.numeroProcesso) {
      const existente = await tx.processo.findFirst({
        where: {
          escritorioId: input.escritorioId,
          numeroProcesso: dados.numeroProcesso,
        },
      });
      if (existente) {
        processoId = existente.id;
      } else {
        const novo = await tx.processo.create({
          data: {
            escritorioId: input.escritorioId,
            numeroProcesso: dados.numeroProcesso,
            vara: dados.vara,
            comarca: dados.comarca,
            parteCliente: dados.parteCliente ?? 'A definir',
            areaDireito: dados.areaDireito,
          } satisfies Prisma.ProcessoUncheckedCreateInput,
        });
        processoId = novo.id;
      }
    }

    await tx.publicacao.update({
      where: { id: pub.id },
      data: {
        statusAnalise: statusFinal,
        confiancaIA: dados.confianca,
        dadosExtraidos: dados as unknown as Prisma.InputJsonValue,
        processoId,
      },
    });

    const prazo = await tx.prazo.create({
      data: {
        publicacaoId: pub.id,
        tipoProvidencia: dados.prazo.tipoProvidencia,
        diasPrazo: dados.prazo.dias,
        tipoContagem: dados.prazo.tipoContagem,
        dataLimite,
        descricaoProvidencia: dados.resumo,
      } satisfies Prisma.PrazoUncheckedCreateInput,
    });

    return prazo.id;
  });

  await registrarConsumo(deps, {
    escritorioId: input.escritorioId,
    publicacaoId: pub.id,
    usage: resposta.usage,
  });

  return {
    publicacaoId: pub.id,
    statusAnalise: statusFinal,
    confianca: dados.confianca,
    prazoId,
    dataLimite: dataLimite.toISOString(),
  };
}
