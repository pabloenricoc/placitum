import Link from 'next/link';
import { tribunalFromFonte } from '@/lib/publicacoes/tribunal';
import type { PublicacaoParaFeed } from '@/lib/publicacoes/list';
import { StatusBadge } from './status-badge';
import { EmptyState } from './empty-state';

const DATA_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const HORA_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

function formatarData(data: Date): string {
  return DATA_FORMATTER.format(data);
}

function formatarHora(data: Date): string {
  return HORA_FORMATTER.format(data);
}

export interface FeedTableProps {
  items: PublicacaoParaFeed[];
  searchParams?: Record<string, string | undefined>;
}

function linhaHref(
  id: string,
  searchParams?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== 'publicacao') params.set(k, v);
    }
  }
  params.set('publicacao', id);
  return `/publicacoes?${params.toString()}`;
}

export function FeedTable({ items, searchParams }: FeedTableProps) {
  if (items.length === 0) return <EmptyState />;

  return (
    <div className="overflow-hidden rounded-xl bg-surface-container-lowest">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-surface-container-high/30">
            <th className="px-6 py-4 text-[0.75rem] font-body font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
              Data
            </th>
            <th className="px-6 py-4 text-[0.75rem] font-body font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
              Tribunal
            </th>
            <th className="px-6 py-4 text-[0.75rem] font-body font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
              Processo
            </th>
            <th className="px-6 py-4 text-[0.75rem] font-body font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
              Parte
            </th>
            <th className="px-6 py-4 text-[0.75rem] font-body font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
              Status
            </th>
            <th className="px-6 py-4 text-right text-[0.75rem] font-body font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/15">
          {items.map((item) => {
            const tribunal = tribunalFromFonte(item.fonte);
            return (
              <tr
                key={item.id}
                className="group transition-colors hover:bg-surface-container-high"
              >
                <td className="px-6 py-5">
                  <div className="font-body text-sm font-semibold text-on-surface">
                    {formatarData(item.dataPublicacao)}
                  </div>
                  <div className="font-body text-[11px] font-medium text-on-surface-variant">
                    {formatarHora(item.dataPublicacao)}
                  </div>
                </td>
                <td className="px-6 py-5">
                  <span className="rounded bg-surface-container px-2 py-1 font-body text-[11px] font-bold text-on-surface">
                    {tribunal}
                  </span>
                </td>
                <td className="px-6 py-5">
                  <span className="font-mono text-xs font-semibold text-on-primary-container">
                    {item.processo?.numeroProcesso ?? '—'}
                  </span>
                </td>
                <td className="px-6 py-5 font-body text-sm font-medium text-on-surface">
                  {item.processo?.parteCliente ?? '—'}
                </td>
                <td className="px-6 py-5">
                  <StatusBadge status={item.statusAnalise} />
                </td>
                <td className="px-6 py-5 text-right">
                  <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <Link
                      href={linhaHref(item.id, searchParams)}
                      scroll={false}
                      aria-label="Abrir detalhe"
                      className="rounded-md p-2 text-primary-container hover:bg-surface-container-lowest"
                    >
                      Ver
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
