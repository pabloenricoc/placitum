import Link from 'next/link';
import { UploadForm } from '../_components/upload-form';
import { criarPublicacaoAction } from '../actions';

export default function NovaPublicacaoPage() {
  return (
    <div className="px-12 py-12">
      <Link
        href="/publicacoes"
        className="font-body text-xs font-semibold uppercase tracking-[0.05em] text-on-surface-variant hover:text-primary"
      >
        ← Voltar para publicações
      </Link>

      <header className="mt-6">
        <p className="font-body text-xs font-medium uppercase tracking-[0.05em] text-on-surface-variant">
          Captação manual
        </p>
        <h1 className="mt-3 font-headline text-[3.5rem] font-bold leading-none tracking-[-0.04em] text-primary">
          Nova publicação
        </h1>
        <p className="mt-4 max-w-2xl font-body text-sm text-on-surface-variant">
          Cole o texto do DJe ou envie o PDF da intimação. O Placitum prepara o
          registro e sinaliza para análise.
        </p>
      </header>

      <div className="mt-10 max-w-3xl">
        <UploadForm action={criarPublicacaoAction} />
      </div>
    </div>
  );
}
