import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  criarPorTextoSchema,
  uploadMetadadosSchema,
  TEXTO_MIN_CHARS,
} from './validation';
import { ValidationError } from './errors';

export interface CriarPublicacaoDeps {
  prisma: Pick<PrismaClient, 'publicacao'>;
  extractTextFromPdf: (buffer: Buffer) => Promise<string>;
}

export interface CriarPublicacaoContext {
  escritorioId: string;
  deps: CriarPublicacaoDeps;
}

export interface CriarPorTextoPayload {
  textoIntegral: string;
  fonte: string;
  dataPublicacao: string;
}

export interface CriarPorPdfPayload {
  buffer: Buffer;
  tipoMime: string;
  tamanhoBytes: number;
  fonte?: string;
  dataPublicacao: string;
}

export interface PublicacaoCriada {
  id: string;
  escritorioId: string;
  statusAnalise: 'NOVA';
}

function parseValidation<T>(
  result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } },
): T {
  if (result.success) return result.data;
  const message = result.error.issues[0]?.message ?? 'Entrada inválida.';
  throw new ValidationError(message);
}

function dataPublicacaoParaDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export async function criarPublicacaoTexto(
  payload: CriarPorTextoPayload,
  ctx: CriarPublicacaoContext,
): Promise<PublicacaoCriada> {
  const data = parseValidation(criarPorTextoSchema.safeParse(payload));

  const created = await ctx.deps.prisma.publicacao.create({
    data: {
      escritorioId: ctx.escritorioId,
      textoIntegral: data.textoIntegral,
      fonte: data.fonte,
      dataPublicacao: dataPublicacaoParaDate(data.dataPublicacao),
      statusAnalise: 'NOVA',
    } satisfies Prisma.PublicacaoUncheckedCreateInput,
  });

  return {
    id: created.id,
    escritorioId: created.escritorioId,
    statusAnalise: 'NOVA',
  };
}

export async function criarPublicacaoPdf(
  payload: CriarPorPdfPayload,
  ctx: CriarPublicacaoContext,
): Promise<PublicacaoCriada> {
  const meta = parseValidation(
    uploadMetadadosSchema.safeParse({
      tipoMime: payload.tipoMime,
      tamanhoBytes: payload.tamanhoBytes,
      fonte: payload.fonte,
      dataPublicacao: payload.dataPublicacao,
    }),
  );

  const textoExtraido = (await ctx.deps.extractTextFromPdf(payload.buffer)).trim();
  if (textoExtraido.length < TEXTO_MIN_CHARS) {
    throw new ValidationError(
      `O texto da publicação precisa ter ao menos ${TEXTO_MIN_CHARS} caracteres.`,
    );
  }

  const created = await ctx.deps.prisma.publicacao.create({
    data: {
      escritorioId: ctx.escritorioId,
      textoIntegral: textoExtraido,
      fonte: meta.fonte,
      dataPublicacao: dataPublicacaoParaDate(meta.dataPublicacao),
      statusAnalise: 'NOVA',
    } satisfies Prisma.PublicacaoUncheckedCreateInput,
  });

  return {
    id: created.id,
    escritorioId: created.escritorioId,
    statusAnalise: 'NOVA',
  };
}
