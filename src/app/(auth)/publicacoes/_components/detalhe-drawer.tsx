'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { tribunalFromFonte } from '@/lib/publicacoes/tribunal';
import type { PublicacaoParaFeed } from '@/lib/publicacoes/list';
import { StatusBadge } from './status-badge';

export interface DetalheDrawerProps {
  publicacao: PublicacaoParaFeed;
}

export function DetalheDrawer({ publicacao }: DetalheDrawerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [analiseStatus, setAnaliseStatus] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  function fechar() {
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    next.delete('publicacao');
    const qs = next.toString();
    router.push(qs ? `/publicacoes?${qs}` : '/publicacoes', { scroll: false });
  }

  async function analisar() {
    setCarregando(true);
    setAnaliseStatus(null);
    try {
      const res = await fetch(`/api/publicacoes/${publicacao.id}/analisar`, {
        method: 'POST',
      });
      if (res.status === 501) {
        setAnaliseStatus('Disponível em breve.');
      } else if (!res.ok) {
        setAnaliseStatus('Não foi possível iniciar a análise.');
      } else {
        setAnaliseStatus('Análise iniciada.');
      }
    } catch {
      setAnaliseStatus('Falha de rede.');
    } finally {
      setCarregando(false);
    }
  }

  const tribunal = tribunalFromFonte(publicacao.fonte);
  const dataFmt = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(publicacao.dataPublicacao);

  return (
    <aside
      aria-label="Detalhe da publicação"
      className="fixed right-0 top-0 z-30 flex h-screen w-full max-w-xl flex-col bg-surface-container-lowest px-8 py-8 shadow-[0_0_48px_rgba(25,28,30,0.08)]"
    >
      <div className="flex items-center justify-between">
        <p className="font-body text-xs font-medium uppercase tracking-[0.05em] text-on-surface-variant">
          Publicação
        </p>
        <button
          type="button"
          onClick={fechar}
          className="rounded-md px-2 py-1 font-body text-sm font-semibold text-on-surface-variant hover:bg-surface-container"
        >
          Fechar
        </button>
      </div>

      <h2 className="mt-4 font-headline text-3xl font-bold tracking-[-0.02em] text-on-surface">
        {publicacao.processo?.numeroProcesso ?? 'Upload manual'}
      </h2>

      <dl className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <dt className="font-body text-[10px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
            Fonte
          </dt>
          <dd className="mt-1 font-body text-sm font-medium text-on-surface">
            {publicacao.fonte}
          </dd>
        </div>
        <div>
          <dt className="font-body text-[10px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
            Tribunal
          </dt>
          <dd className="mt-1 font-body text-sm font-medium text-on-surface">
            {tribunal}
          </dd>
        </div>
        <div>
          <dt className="font-body text-[10px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
            Data de publicação
          </dt>
          <dd className="mt-1 font-body text-sm font-medium text-on-surface">
            {dataFmt}
          </dd>
        </div>
        <div>
          <dt className="font-body text-[10px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
            Status
          </dt>
          <dd className="mt-1">
            <StatusBadge status={publicacao.statusAnalise} />
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex-1 overflow-y-auto rounded-md bg-surface-container-low p-4">
        <pre className="whitespace-pre-wrap font-body text-sm leading-relaxed text-on-surface">
          {publicacao.textoIntegral}
        </pre>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p
          aria-live="polite"
          className="font-body text-xs text-on-surface-variant"
        >
          {analiseStatus ?? ''}
        </p>
        <button
          type="button"
          onClick={analisar}
          disabled={carregando}
          className="rounded-md bg-primary px-4 py-2 font-body text-sm font-semibold text-on-primary disabled:opacity-60"
        >
          {carregando ? 'Enviando…' : 'Analisar com IA'}
        </button>
      </div>
    </aside>
  );
}
