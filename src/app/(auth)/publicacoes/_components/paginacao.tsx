import Link from 'next/link';

export interface PaginacaoProps {
  page: number;
  totalPages: number;
  total: number;
  searchParams: Record<string, string | undefined>;
}

function buildHref(
  page: number,
  searchParams: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== 'page' && k !== 'publicacao') params.set(k, v);
  }
  params.set('page', String(page));
  return `/publicacoes?${params.toString()}`;
}

export function Paginacao({
  page,
  totalPages,
  total,
  searchParams,
}: PaginacaoProps) {
  if (total === 0) return null;

  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;
  const inicio = (page - 1) * 20 + 1;
  const fim = Math.min(page * 20, total);

  return (
    <div className="flex items-center justify-between rounded-b-xl bg-surface-container-low/50 px-6 py-4">
      <span className="font-body text-xs font-medium text-on-surface-variant">
        Exibindo {inicio}–{fim} de {total} publicações
      </span>
      <div className="flex items-center gap-2">
        {prev ? (
          <Link
            href={buildHref(prev, searchParams)}
            className="rounded-md bg-surface-container-lowest px-3 py-1 font-body text-xs font-bold text-primary hover:opacity-90"
          >
            Anterior
          </Link>
        ) : null}
        <span className="rounded-md bg-primary px-3 py-1 font-body text-xs font-bold text-on-primary">
          Página {page} de {totalPages}
        </span>
        {next ? (
          <Link
            href={buildHref(next, searchParams)}
            className="rounded-md bg-surface-container-lowest px-3 py-1 font-body text-xs font-bold text-primary hover:opacity-90"
          >
            Próxima
          </Link>
        ) : null}
      </div>
    </div>
  );
}
