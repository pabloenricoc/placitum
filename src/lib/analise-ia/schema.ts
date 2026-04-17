import { z } from 'zod';

export const AREAS_DIREITO = [
  'CIVEL',
  'TRABALHISTA',
  'PREVIDENCIARIO',
  'BANCARIO',
  'TRIBUTARIO',
  'OUTRO',
] as const;

export const TIPOS_PROVIDENCIA = [
  'CONTESTACAO',
  'RECURSO_APELACAO',
  'RECURSO_AGRAVO',
  'EMBARGOS_DECLARACAO',
  'MANIFESTACAO',
  'IMPUGNACAO',
  'CONTRARRAZOES',
  'CUMPRIMENTO_SENTENCA',
  'OUTRO',
] as const;

export const TIPOS_CONTAGEM = ['UTEIS', 'CORRIDOS'] as const;

export const NIVEIS_CONFIANCA = ['ALTA', 'MEDIA', 'BAIXA'] as const;

export const respostaIASchema = z.object({
  numeroProcesso: z.string().min(1).nullable(),
  vara: z.string().nullable(),
  comarca: z.string().nullable(),
  estado: z.string().length(2).nullable(),
  tipoDecisao: z.string().min(1),
  resumo: z.string().min(10),
  partes: z.object({
    autor: z.string().nullable(),
    reu: z.string().nullable(),
  }),
  parteCliente: z.string().nullable(),
  areaDireito: z.enum(AREAS_DIREITO),
  prazo: z.object({
    tipoProvidencia: z.enum(TIPOS_PROVIDENCIA),
    dias: z.number().int().min(1).max(365),
    tipoContagem: z.enum(TIPOS_CONTAGEM),
  }),
  urgencia: z.enum(NIVEIS_CONFIANCA),
  confianca: z.union([z.enum(NIVEIS_CONFIANCA), z.number().min(0).max(1)]),
});

export type RespostaIA = z.infer<typeof respostaIASchema>;
