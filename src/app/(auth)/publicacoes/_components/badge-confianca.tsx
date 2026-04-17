export type NivelConfianca = 'ALTA' | 'MEDIA' | 'BAIXA';

const LABELS: Record<NivelConfianca, string> = {
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
};

const CLASSES: Record<NivelConfianca, string> = {
  ALTA: 'bg-tertiary/10 text-tertiary border border-tertiary/20',
  MEDIA:
    'bg-amber-100 text-amber-900 border border-amber-200',
  BAIXA: 'bg-error-container text-on-error-container border border-error/20',
};

export interface BadgeConfiancaProps {
  nivel: NivelConfianca;
}

export function BadgeConfianca({ nivel }: BadgeConfiancaProps) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={[
          'inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 font-body text-[11px] font-bold uppercase tracking-[0.1em]',
          CLASSES[nivel],
        ].join(' ')}
      >
        Confiança {LABELS[nivel]}
      </span>
      {nivel === 'BAIXA' ? (
        <p className="font-body text-xs text-error">Requer revisão manual</p>
      ) : null}
    </div>
  );
}
