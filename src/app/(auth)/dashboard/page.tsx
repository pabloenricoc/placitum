export default function DashboardPage() {
  return (
    <div className="px-10 py-12">
      <p className="font-body text-xs font-medium uppercase tracking-[0.05em] text-on-surface-variant">
        Visão geral
      </p>
      <h1 className="mt-3 font-headline text-[2.5rem] font-bold leading-tight tracking-[-0.04em] text-on-surface">
        Dashboard
      </h1>
      <p className="mt-4 max-w-prose font-body text-sm text-on-surface-variant">
        Em breve: estatísticas de publicações do dia, gráfico de prazos por
        urgência e feed das últimas captações do Diário de Justiça.
      </p>
    </div>
  );
}
