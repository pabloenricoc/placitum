import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { filtrosListagemSchema, type FiltrosListagemInput } from './validation';
import { ValidationError } from './errors';

export interface ListarPublicacoesDeps {
  prisma: Pick<PrismaClient, 'publicacao' | '$transaction'>;
}

export interface ListarPublicacoesContext {
  escritorioId: string;
  deps: ListarPublicacoesDeps;
}

export interface PublicacaoParaFeed {
  id: string;
  dataPublicacao: Date;
  createdAt: Date;
  fonte: string;
  statusAnalise:
    | 'NOVA'
    | 'EM_ANALISE'
    | 'ANALISADA'
    | 'PRAZO_CADASTRADO'
    | 'PECA_GERADA'
    | 'ERRO';
  confiancaIA: 'ALTA' | 'MEDIA' | 'BAIXA' | null;
  textoIntegral: string;
  processo: {
    id: string;
    numeroProcesso: string;
    parteCliente: string;
  } | null;
}

export interface ListagemResultado {
  items: PublicacaoParaFeed[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function dataInicioDoDia(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function dataFimDoDia(iso: string): Date {
  return new Date(`${iso}T23:59:59.999Z`);
}

export async function listarPublicacoes(
  rawFiltros: Partial<FiltrosListagemInput> | Record<string, unknown>,
  ctx: ListarPublicacoesContext,
): Promise<ListagemResultado> {
  const parsed = filtrosListagemSchema.safeParse(rawFiltros ?? {});
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? 'Filtros inválidos.',
    );
  }
  const filtros = parsed.data;

  const where: Prisma.PublicacaoWhereInput = { escritorioId: ctx.escritorioId };

  if (filtros.status) where.statusAnalise = filtros.status;

  if (filtros.tribunal) {
    where.fonte = { startsWith: `DJe-${filtros.tribunal}` };
  }

  if (filtros.de || filtros.ate) {
    const range: Prisma.DateTimeFilter = {};
    if (filtros.de) range.gte = dataInicioDoDia(filtros.de);
    if (filtros.ate) range.lte = dataFimDoDia(filtros.ate);
    where.dataPublicacao = range;
  }

  if (filtros.q) {
    where.processo = {
      is: {
        OR: [
          { numeroProcesso: { contains: filtros.q, mode: 'insensitive' } },
          { parteCliente: { contains: filtros.q, mode: 'insensitive' } },
        ],
      },
    };
  }

  const pageSize = filtros.pageSize;
  const page = filtros.page;
  const skip = (page - 1) * pageSize;

  const [total, itemsRaw] = await ctx.deps.prisma.$transaction([
    ctx.deps.prisma.publicacao.count({ where }),
    ctx.deps.prisma.publicacao.findMany({
      where,
      orderBy: [{ dataPublicacao: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: pageSize,
      include: { processo: true },
    }),
  ]);

  const items: PublicacaoParaFeed[] = itemsRaw.map((row) => ({
    id: row.id,
    dataPublicacao: row.dataPublicacao,
    createdAt: row.createdAt,
    fonte: row.fonte,
    statusAnalise: row.statusAnalise,
    confiancaIA: row.confiancaIA,
    textoIntegral: row.textoIntegral,
    processo: row.processo
      ? {
          id: row.processo.id,
          numeroProcesso: row.processo.numeroProcesso,
          parteCliente: row.processo.parteCliente,
        }
      : null,
  }));

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}
