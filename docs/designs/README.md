# docs/designs/

HTMLs de referência visual das telas do Placitum.

Cada arquivo é um protótipo estático seguindo o sistema de design definido em [`/DESIGN.md`](../../DESIGN.md) (The Architectural Intelligence Framework). Servem como fonte de verdade visual para a implementação em React/Tailwind — ao construir uma tela, o HTML correspondente aqui é a referência.

## Telas

- `dashboard.html` — Visão geral com stats, gráfico de prazos, publicações recentes
- `publicacoes.html` — Feed/tabela com filtros, confiança IA, status
- `detalhe-publicacao.html` — 3 colunas: texto original, análise IA, editor de peça
- `agenda.html` — Calendário mensal com cards de prazo por urgência
- `settings.html` — Gestão de equipe, identidade do escritório, config do assistente IA
- `onboarding.html` — Stepper de configuração inicial (tribunais, processos)

## Convenções

- HTMLs são estáticos e autocontidos (CDN do Tailwind/fontes via `<link>`).
- Não editar diretamente no código React: atualizar primeiro o HTML de referência, depois portar.
- Divergências entre HTML e implementação devem ser resolvidas favorecendo o HTML, salvo decisão explícita registrada em PR.
