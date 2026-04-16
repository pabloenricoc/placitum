'use client';

import { useState } from 'react';

export interface LoginFormProps {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  defaultError?: string;
}

export function LoginForm({ action, defaultError }: LoginFormProps) {
  const [error, setError] = useState<string | undefined>(defaultError);
  const [pending, setPending] = useState(false);

  async function handle(formData: FormData) {
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    if (!email || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }

    setError(undefined);
    setPending(true);
    try {
      const result = await action(formData);
      if (result && 'error' in result && result.error) {
        setError(result.error);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={handle} className="flex flex-col gap-5" noValidate>
      <label className="flex flex-col gap-2">
        <span className="font-body text-xs font-medium uppercase tracking-[0.05em] text-on-surface-variant">
          E-mail
        </span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          className="h-11 rounded-md bg-surface-container px-4 font-body text-sm text-on-surface outline-none transition focus:bg-surface-container-highest"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="font-body text-xs font-medium uppercase tracking-[0.05em] text-on-surface-variant">
          Senha
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className="h-11 rounded-md bg-surface-container px-4 font-body text-sm text-on-surface outline-none transition focus:bg-surface-container-highest"
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="border-l-[3px] border-error bg-error-container/40 py-2 pl-3 font-body text-sm text-on-surface"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-11 rounded-md bg-primary font-headline text-sm font-semibold tracking-tight text-on-primary transition hover:bg-primary-container disabled:opacity-60"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
