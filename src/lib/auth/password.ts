import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(10, 'A senha deve ter pelo menos 10 caracteres.')
  .refine((v) => /[a-zA-Z]/.test(v), 'A senha deve conter ao menos uma letra.')
  .refine((v) => /\d/.test(v), 'A senha deve conter ao menos um número.');

export type PasswordValidation = { ok: true } | { ok: false; message: string };

export function validatePasswordShape(raw: string): PasswordValidation {
  const result = passwordSchema.safeParse(raw);
  if (result.success) return { ok: true };
  const first = result.error.issues[0];
  return { ok: false, message: first?.message ?? 'Senha inválida.' };
}
