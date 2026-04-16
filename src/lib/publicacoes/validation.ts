import { z } from 'zod';

export const TEXTO_MIN_CHARS = 50;
export const PDF_MAX_BYTES = 5 * 1024 * 1024;

const STATUS_VALUES = [
  'NOVA',
  'EM_ANALISE',
  'ANALISADA',
  'PRAZO_CADASTRADO',
  'PECA_GERADA',
  'ERRO',
] as const;

export const statusAnaliseSchema = z.enum(STATUS_VALUES);
export type StatusAnaliseInput = z.infer<typeof statusAnaliseSchema>;

const dataIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data em formato inválido. Use YYYY-MM-DD.' });

function rejeitaDataFutura(iso: string, ctx: z.RefinementCtx) {
  const data = new Date(`${iso}T12:00:00Z`);
  const hojeLimite = new Date();
  hojeLimite.setHours(23, 59, 59, 999);
  if (data.getTime() > hojeLimite.getTime()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Data de publicação não pode ser futura.',
    });
  }
}

const fonteSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v.length >= 3 && v.length <= 50, {
    message: 'A fonte é obrigatória.',
  });

export const criarPorTextoSchema = z.object({
  textoIntegral: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length >= TEXTO_MIN_CHARS, {
      message: `O texto da publicação precisa ter ao menos ${TEXTO_MIN_CHARS} caracteres.`,
    }),
  fonte: fonteSchema,
  dataPublicacao: z
    .string()
    .min(1, { message: 'Informe a data de publicação.' })
    .pipe(dataIsoSchema)
    .superRefine(rejeitaDataFutura),
});

export type CriarPorTextoInput = z.infer<typeof criarPorTextoSchema>;

export const uploadMetadadosSchema = z.object({
  tipoMime: z
    .string()
    .refine((v) => v === 'application/pdf', {
      message: 'Apenas arquivos PDF são aceitos.',
    }),
  tamanhoBytes: z.number().int().positive().max(PDF_MAX_BYTES, {
    message: 'O arquivo excede o limite de 5MB.',
  }),
  fonte: fonteSchema.optional().default('upload-manual'),
  dataPublicacao: z
    .string()
    .min(1, { message: 'Informe a data de publicação.' })
    .pipe(dataIsoSchema)
    .superRefine(rejeitaDataFutura),
});

export type UploadMetadadosInput = z.infer<typeof uploadMetadadosSchema>;

function parseIntOrUndefined(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === 'string') {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export const filtrosListagemSchema = z
  .object({
    page: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v) => {
        const n = parseIntOrUndefined(v);
        if (n === undefined) return 1;
        return n < 1 ? 1 : n;
      }),
    pageSize: z
      .union([z.string(), z.number()])
      .optional()
      .transform(() => 20 as const),
    status: statusAnaliseSchema.optional(),
    tribunal: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? v.trim().toUpperCase() : undefined)),
    de: dataIsoSchema.optional(),
    ate: dataIsoSchema.optional(),
    q: z
      .string()
      .optional()
      .transform((v) => {
        if (!v) return undefined;
        const trimmed = v.trim();
        return trimmed.length >= 3 ? trimmed : undefined;
      }),
    advogadoId: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.de && data.ate && data.de > data.ate) {
      ctx.addIssue({ code: 'custom', message: 'Período inválido.' });
    }
  });

export type FiltrosListagemInput = z.infer<typeof filtrosListagemSchema>;
