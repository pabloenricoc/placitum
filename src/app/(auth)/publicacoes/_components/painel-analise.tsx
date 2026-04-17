import { BadgeConfianca } from './badge-confianca';

type TipoProvidencia =
  | 'CONTESTACAO'
  | 'RECURSO_APELACAO'
  | 'RECURSO_AGRAVO'
  | 'EMBARGOS_DECLARACAO'
  | 'MANIFESTACAO'
  | 'IMPUGNACAO'
  | 'CONTRARRAZOES'
  | 'CUMPRIMENTO_SENTENCA'
  | 'OUTRO';

type TipoContagem = 'UTEIS' | 'CORRIDOS';

const LABEL_PROVIDENCIA: Record<TipoProvidencia, string> = {
  CONTESTACAO: 'CONTESTAÇÃO',
  RECURSO_APELACAO: 'RECURSO DE APELAÇÃO',
  RECURSO_AGRAVO: 'AGRAVO',
  EMBARGOS_DECLARACAO: 'EMBARGOS DE DECLARAÇÃO',
  MANIFESTACAO: 'MANIFESTAÇÃO',
  IMPUGNACAO: 'IMPUGNAÇÃO',
  CONTRARRAZOES: 'CONTRARRAZÕES',
  CUMPRIMENTO_SENTENCA: 'CUMPRIMENTO DE SENTENÇA',
  OUTRO: 'OUTRO',
};

export interface PainelAnaliseProps {
  dados: unknown;
  prazo: {
    id: string;
    dataLimite: Date;
    diasPrazo: number;
    tipoContagem: TipoContagem;
    tipoProvidencia: TipoProvidencia;
  };
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
  statusAnalise: 'ANALISADA' | 'PRAZO_CADASTRADO' | 'PECA_GERADA';
}

function fmtData(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(d);
}

function resumoFromDados(dados: unknown): string | null {
  if (!dados || typeof dados !== 'object') return null;
  const v = (dados as Record<string, unknown>).resumo;
  return typeof v === 'string' ? v : null;
}

export function PainelAnalise({
  dados,
  prazo,
  confianca,
}: PainelAnaliseProps) {
  const resumo = resumoFromDados(dados);

  return (
    <section
      aria-label="Análise Digital Jurist"
      className="mt-8 flex flex-col gap-6 rounded-xl bg-surface-container-lowest p-6"
    >
      <header className="flex items-center gap-2 text-tertiary">
        <h3 className="font-headline text-xl font-bold tracking-tight">
          Análise Digital Jurist
        </h3>
      </header>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border-l-4 border-primary bg-surface-container p-4">
          <p className="font-body text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Prazo Legal
          </p>
          <p className="font-headline text-2xl font-bold text-primary">
            {String(prazo.diasPrazo).padStart(2, '0')} Dias
          </p>
        </div>
        <div className="rounded-lg border-l-4 border-error bg-surface-container p-4">
          <p className="font-body text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Data Limite
          </p>
          <p className="font-headline text-2xl font-bold text-error">
            {fmtData(prazo.dataLimite)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-body text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
          Sugestão de ação
        </p>
        <div className="rounded-lg border border-tertiary-container/20 bg-tertiary-container/5 p-4">
          <p className="font-body text-sm font-bold text-on-surface">
            {LABEL_PROVIDENCIA[prazo.tipoProvidencia]}
          </p>
          {resumo ? (
            <p className="mt-2 font-body text-sm leading-relaxed text-on-surface/80">
              {resumo}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <BadgeConfianca nivel={confianca} />
        <p className="font-body text-[10px] uppercase tracking-[0.1em] text-on-surface-variant">
          {prazo.tipoContagem === 'UTEIS' ? 'Dias úteis' : 'Dias corridos'}
        </p>
      </div>

      <p className="font-body text-[11px] italic text-on-surface-variant">
        Rascunho gerado por IA — revisão obrigatória.
      </p>
    </section>
  );
}
