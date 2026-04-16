import Link from 'next/link';

export function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-4 bg-surface-container-lowest px-10 py-16 rounded-xl">
      <p className="font-body text-xs font-medium uppercase tracking-[0.05em] text-on-surface-variant">
        Feed vazio
      </p>
      <h2 className="font-headline text-2xl font-bold tracking-[-0.02em] text-on-surface">
        Nenhuma publicação ainda. Comece enviando uma.
      </h2>
      <p className="max-w-prose font-body text-sm text-on-surface-variant">
        Cole o texto do DJe ou envie o PDF da intimação. O Placitum guarda tudo
        organizado para você revisar quando precisar.
      </p>
      <Link
        href="/publicacoes/nova"
        className="rounded-md bg-primary px-4 py-2 font-body text-sm font-semibold text-on-primary hover:opacity-90"
      >
        Enviar publicação
      </Link>
    </div>
  );
}
