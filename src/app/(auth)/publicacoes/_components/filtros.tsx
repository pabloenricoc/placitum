'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

const STATUS_OPCOES = [
  { value: '', label: 'Qualquer status' },
  { value: 'NOVA', label: 'Nova' },
  { value: 'EM_ANALISE', label: 'Em análise' },
  { value: 'ANALISADA', label: 'Analisada' },
  { value: 'PRAZO_CADASTRADO', label: 'Prazo cadastrado' },
  { value: 'PECA_GERADA', label: 'Peça gerada' },
  { value: 'ERRO', label: 'Erro' },
];

const TRIBUNAL_OPCOES = [
  { value: '', label: 'Todos os tribunais' },
  { value: 'TJCE', label: 'TJCE' },
  { value: 'TJSP', label: 'TJSP' },
  { value: 'TRF3', label: 'TRF3' },
  { value: 'STJ', label: 'STJ' },
  { value: 'STF', label: 'STF' },
];

export function Filtros() {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      if (typeof v === 'string' && v.trim().length > 0) next.set(k, v.trim());
    }
    next.delete('page');
    next.delete('publicacao');
    startTransition(() => {
      router.push(`/publicacoes${next.toString() ? `?${next}` : ''}`);
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-4 rounded-xl bg-surface-container-low p-6 md:grid-cols-5 md:items-end"
    >
      <div className="grid gap-2">
        <label className="font-body text-[0.75rem] font-medium uppercase tracking-[0.1em] text-on-surface-variant">
          Tribunal
        </label>
        <select
          name="tribunal"
          defaultValue={sp.get('tribunal') ?? ''}
          className="rounded-md border-none bg-white px-3 py-2 font-body text-sm font-semibold text-on-surface focus:ring-1 focus:ring-primary/10"
        >
          {TRIBUNAL_OPCOES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <label className="font-body text-[0.75rem] font-medium uppercase tracking-[0.1em] text-on-surface-variant">
          Status
        </label>
        <select
          name="status"
          defaultValue={sp.get('status') ?? ''}
          className="rounded-md border-none bg-white px-3 py-2 font-body text-sm font-semibold text-on-surface focus:ring-1 focus:ring-primary/10"
        >
          {STATUS_OPCOES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <label className="font-body text-[0.75rem] font-medium uppercase tracking-[0.1em] text-on-surface-variant">
          De
        </label>
        <input
          type="date"
          name="de"
          defaultValue={sp.get('de') ?? ''}
          className="rounded-md border-none bg-white px-3 py-2 font-body text-sm font-semibold text-on-surface"
        />
      </div>
      <div className="grid gap-2">
        <label className="font-body text-[0.75rem] font-medium uppercase tracking-[0.1em] text-on-surface-variant">
          Até
        </label>
        <input
          type="date"
          name="ate"
          defaultValue={sp.get('ate') ?? ''}
          className="rounded-md border-none bg-white px-3 py-2 font-body text-sm font-semibold text-on-surface"
        />
      </div>
      <div className="md:col-span-5 grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
        <div className="grid gap-2">
          <label className="font-body text-[0.75rem] font-medium uppercase tracking-[0.1em] text-on-surface-variant">
            Buscar
          </label>
          <input
            type="text"
            name="q"
            placeholder="Número do processo ou nome da parte"
            defaultValue={sp.get('q') ?? ''}
            className="rounded-md border-none bg-white px-3 py-2 font-body text-sm text-on-surface"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-5 py-2.5 font-body text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-60"
        >
          Aplicar
        </button>
        <button
          type="button"
          onClick={() => router.push('/publicacoes')}
          className="rounded-md bg-surface-container-highest px-5 py-2.5 font-body text-sm font-bold text-primary hover:opacity-90"
        >
          Limpar
        </button>
      </div>
    </form>
  );
}
