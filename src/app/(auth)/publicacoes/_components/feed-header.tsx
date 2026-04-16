import Link from 'next/link';

export function FeedHeader() {
  return (
    <header className="flex items-end justify-between gap-6">
      <div>
        <p className="font-body text-xs font-medium uppercase tracking-[0.05em] text-on-surface-variant">
          Intimações
        </p>
        <h1 className="mt-3 font-headline text-[3.5rem] font-bold leading-none tracking-[-0.04em] text-primary">
          Publicações
        </h1>
        <p className="mt-4 max-w-2xl font-body text-sm font-medium text-on-surface-variant">
          Gestão de prazos e intimações processuais com análise Placitum.
        </p>
      </div>
      <Link
        href="/publicacoes/nova"
        className="rounded-md bg-primary px-5 py-3 font-body text-sm font-semibold text-on-primary hover:opacity-90"
      >
        Nova publicação
      </Link>
    </header>
  );
}
