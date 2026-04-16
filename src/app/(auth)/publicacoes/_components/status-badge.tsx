import type { PublicacaoParaFeed } from '@/lib/publicacoes/list';

type Status = PublicacaoParaFeed['statusAnalise'];

const LABELS: Record<Status, string> = {
  NOVA: 'Nova',
  EM_ANALISE: 'Em análise',
  ANALISADA: 'Analisada',
  PRAZO_CADASTRADO: 'Prazo cadastrado',
  PECA_GERADA: 'Peça gerada',
  ERRO: 'Erro',
};

const CLASSES: Record<Status, string> = {
  NOVA: 'bg-primary-fixed text-on-primary-fixed',
  EM_ANALISE: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  ANALISADA: 'bg-secondary-container text-on-secondary-container',
  PRAZO_CADASTRADO: 'bg-secondary-container text-on-secondary-container',
  PECA_GERADA: 'bg-primary-container text-on-primary',
  ERRO: 'bg-error-container text-on-error-container',
};

export interface StatusBadgeProps {
  status: Status;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={[
        'inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.05em]',
        CLASSES[status],
      ].join(' ')}
    >
      {LABELS[status]}
    </span>
  );
}
