# Design System: Placitum — The Architectural Intelligence Framework

## North Star: "The Digital Jurist"
UI que transmite precisão, clareza e autoridade editorial. Assimetria intencional, contraste tipográfico extremo, superfícies monolíticas em camadas.

## Cores
- Primary: #000a1e (navy profundo)
- Primary Container: #002147
- Surface: #f7f9fb
- Error: #ba1a1a
- Tertiary: #10002f (roxo profundo para IA)

### Regra "No-Line"
Bordas de 1px proibidas para separar seções. Usar mudança de background:
- Canvas principal: surface (#f7f9fb)
- Sidebar: surface-container-low (#f2f4f6)
- Workspace ativo: surface-container-lowest (#ffffff)

### Hierarquia de superfícies
- Tier 1 (Base): background
- Tier 2 (Seção): surface-container
- Tier 3 (Elemento interativo): surface-container-highest
- Tier 4 (Painéis flutuantes IA): Glassmorphism — 80% opacidade + backdrop-blur 24px

## Tipografia
- Headlines: Plus Jakarta Sans (tight tracking, peso pesado)
- Corpo/Dados: Inter (clínico, denso)
- Display: 3.5rem, 700, -0.04em tracking
- Headline: 1.5rem, 600, -0.02em
- Labels: 0.75rem, 500, 0.05em, ALL CAPS

## Elevação
- Sem drop shadows estilo 2010. Usar layering tonal
- Ghost Border: outline-variant a 15% opacidade apenas quando necessário
- Shadows apenas em modais: on-surface a 4% opacidade, blur 32px

## Componentes
- Tabelas: sem linhas verticais, ghost borders horizontais
- Badges IA: tertiary-fixed para alta confiança, primary-fixed-dim para baixa
- Botões primary: background primary, texto on-primary, border-radius 0.375rem
- Cards urgentes: borda esquerda 4px em primary (não colorir card inteiro de vermelho)

## Regras
- NUNCA usar preto 100% — sempre on-surface (#191c1e)
- NUNCA arredondar tudo — roundedness.sm para dados, roundedness.lg para containers
- NUNCA usar vermelho padrão em excesso — usar laranja/atenção primeiro
- SEMPRE confiar no whitespace — aumentar padding ao invés de adicionar linhas

## Telas de referência
Os HTMLs das telas ficam em docs/designs/:
- dashboard.html — Visão geral com stats, gráfico de prazos, publicações recentes
- publicacoes.html — Feed/tabela com filtros, confiança IA, status
- detalhe-publicacao.html — 3 colunas: texto original, análise IA, editor de peça
- agenda.html — Calendário mensal com cards de prazo por urgência
- settings.html — Gestão de equipe, identidade do escritório, config do assistente IA
- onboarding.html — Stepper de configuração inicial (tribunais, processos)
