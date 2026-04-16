'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/lib/auth';

export async function loginAction(
  formData: FormData,
): Promise<{ error?: string } | void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: '/dashboard',
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'Credenciais inválidas.' };
    }
    throw err;
  }
}
