import { LoginForm } from './login-form';
import { loginAction } from './actions';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6">
      <div className="w-full max-w-sm">
        <header className="mb-10">
          <p className="font-body text-xs font-medium uppercase tracking-[0.05em] text-on-surface-variant">
            Placitum
          </p>
          <h1 className="mt-3 font-headline text-[2.5rem] font-bold leading-tight tracking-[-0.04em] text-on-surface">
            Entre no painel.
          </h1>
          <p className="mt-3 font-body text-sm text-on-surface-variant">
            Acesso restrito a membros do escritório.
          </p>
        </header>

        <section className="rounded-lg bg-surface-container-lowest p-8">
          <LoginForm action={loginAction} />
        </section>

        <p className="mt-8 font-body text-xs text-on-surface-variant">
          Problemas para entrar? Fale com o admin do seu escritório.
        </p>
      </div>
    </main>
  );
}
