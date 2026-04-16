# Placitum — CLAUDE.md

## Sobre o projeto
SaaS jurídico que automatiza o controle de publicações para escritórios
de advocacia massificados usando IA. Capta publicações de tribunais,
classifica prazos, gera rascunhos de peças processuais e organiza tudo
numa agenda inteligente.

Time: 1 dev full-stack + 1 jurista. MVP em 30 dias. Bootstrapping.

## Stack
- Runtime: Node.js 22 LTS
- Framework: Next.js 15 (App Router, TypeScript strict)
- UI: Tailwind CSS + shadcn/ui (NÃO usar outros frameworks CSS)
- ORM: Prisma (NÃO usar query builders ou SQL direto)
- Auth: NextAuth.js v5 (credenciais + magic link)
- DB: PostgreSQL 16 (via Docker/Coolify)
- Filas: BullMQ + Redis 7
- IA: Anthropic SDK (@anthropic-ai/sdk) — Haiku 4.5 para classificação, Sonnet 4.6 para geração
- E-mail: Resend SDK
- Deploy: Coolify no Hetzner CX32

## Comandos
- npm run dev — rodar app em desenvolvimento
- npm run build — build de produção
- npx prisma migrate dev — criar migration
- npx prisma db push — push schema para DB
- npx prisma studio — interface visual do banco
- npm run lint — ESLint
- npm run typecheck — tsc --noEmit

## Convenções de código

### TypeScript
- SEMPRE usar TypeScript strict. Nunca any — usar unknown e fazer type guard.
- Usar tipos do Prisma gerados automaticamente.
- Preferir interface para objetos, type para unions e intersections.

### React / Next.js
- SEMPRE usar Server Components por padrão. Client Components apenas quando necessário.
- Marcar Client Components com 'use client' no topo.
- NÃO usar useEffect para fetch de dados — usar Server Components.

### API Routes
- Todas as API routes devem validar autenticação.
- Retornar erros com status HTTP correto e mensagem em JSON.
- Rotas de cron protegidas por header Authorization: Bearer {CRON_SECRET}.

### Banco de dados
- NUNCA alterar schema.prisma sem criar migration.
- SEMPRE usar transações para operações multi-tabela.

### IA (Claude API)
- SEMPRE usar prompt caching no system prompt.
- NUNCA enviar dados pessoais sensíveis (CPF, endereço) nos prompts.
- SEMPRE registrar tokens consumidos para controle de custo.
- Outputs da IA SEMPRE passam por JSON.parse com try/catch.

## REGRAS DE SEGURANÇA — OBRIGATÓRIO
1. NUNCA commitar secrets, API keys ou senhas. Usar .env.
2. NUNCA expor PostgreSQL ou Redis para a internet.
3. SEMPRE validar e sanitizar input do usuário com zod.
4. SEMPRE filtrar queries por escritorioId (multi-tenant).
5. NUNCA usar eval() ou Function().
6. NUNCA armazenar senhas em texto puro — usar bcrypt com saltRounds >= 12.
7. NUNCA fazer SELECT * com dados sensíveis.

## Git
- Branch principal: main
- Feature branches: feat/descricao-curta
- Commits em português: "feat: descrição", "fix: descrição"
- Rodar typecheck e lint antes de cada commit.

## Contexto jurídico
- Publicação = texto publicado no Diário de Justiça Eletrônico (DJe).
- Prazo processual = tempo para responder/recorrer após publicação.
- Dias úteis = excluindo sábados, domingos e feriados.
- Human-in-the-loop = advogado SEMPRE revisa antes de protocolar.
- Toda peça gerada DEVE conter disclaimer: "Rascunho gerado por IA — revisão obrigatória."
