# Plan 01 — Autenticação

**Spec**: `specs/features/01-auth.spec.md`
**Status**: approved
**Iteração**: slice 1 — credenciais + proteção de rotas

## 1. Escopo desta iteração (slice 1)

A spec cobre 14 critérios de aceite. Este slice entrega o fluxo mínimo viável para destravar o resto do app: **login por credenciais + sessão + proteção de rotas**.

### CAs em escopo
- **CA-2** — login credenciais sucesso
- **CA-3** — login credenciais falha (senha errada)
- **CA-11** — proteção de rota (middleware)
- **CA-12** — conta inativa (adaptado: `Escritorio.ativo = false` bloqueia login — ver §2.5)
- **CA-13** — sessão carrega `escritorioId` (base do isolamento multi-tenant, cobertura completa em futuras specs)
- Normalização de e-mail (edge case da spec §7) — lowercase + trim antes de qualquer query
- Validação de formato de senha no input (RN-3)
- Validação de form vazio na UI

### CAs fora deste slice (aguardam spec/plan dedicados)
- CA-1 registro de escritório, CA-4 rate-limit, CA-5/6/7 magic link, CA-8/9 convite, CA-10 logout (parcial — botão chega no slice 2), CA-14 checagem de papel em endpoint de peça (depende da feature de peças).

A decisão de fatiar está alinhada com "MVP 30 dias + correção jurídica > segurança > UX" (constitution §1). Slice 1 entrega o bloqueador de todas as outras features. Slices seguintes herdam este plan como base.

## 2. Decisões técnicas

### 2.1 NextAuth v5 com JWT session strategy

- `session: { strategy: "jwt" }` — sem tabela `Session` no schema atual. JWT assinado com `NEXTAUTH_SECRET`, TTL 30 dias (RN-6).
- Trade-off: revogação de sessão não é server-side instantânea (cookie continua válido até expirar). Aceitável no slice 1 porque desativação de usuário só entra num slice futuro. Quando RN-9 entrar em escopo, migramos para DB sessions via `@auth/prisma-adapter`.

### 2.2 Provider único: Credentials

- Apenas `CredentialsProvider` neste slice. Magic link é provider separado (`EmailProvider`), entra no slice 2.
- `authorize(credentials)` retorna `User | null`. Null gera erro 401 padrão do NextAuth.

### 2.3 Callbacks de JWT e session

- `jwt({ token, user })`: na primeira chamada (após `authorize` bem-sucedido), copia `user.id`, `user.escritorioId`, `user.role` para o token.
- `session({ session, token })`: expõe `session.user.id`, `session.user.escritorioId`, `session.user.role`.
- Isso cumpre CA-13 (sessão carrega tenant) e prepara RN-7 (checagem de papel).

### 2.4 Lógica extraível e testável

Para permitir testes unitários sem subir servidor Next.js, a lógica crítica fica em módulos puros:

- `src/lib/auth/credentials.ts` — função `authenticateCredentials(input, { prisma, bcrypt })` que o `authorize` chama. Recebe deps por parâmetro para facilitar mock nos testes.
- `src/lib/auth/email.ts` — `normalizeEmail(raw: string): string`.
- `src/lib/auth/password.ts` — schema zod `passwordSchema` e helper `validatePasswordShape(raw): Result`.
- `src/lib/auth/guards.ts` — `assertEscritorioAtivo(escritorio)` lança `EscritorioInativoError` quando `ativo === false`.

`src/lib/auth.ts` é a casca NextAuth que compõe esses módulos e exporta `{ handlers, signIn, signOut, auth }`.

### 2.5 CA-12 adaptado: escritório inativo, não usuário inativo

- O schema atual (`prisma/schema.prisma`) tem `Escritorio.ativo` mas **não** tem `User.ativo`. Adicionar `ativo` em `User` exigiria migration.
- Decisão: neste slice, "conta inativa" = escritório inativo. Bloqueia login de todos os usuários do escritório.
- Desativação individual de usuário (RN-9 pleno) fica para o slice que trouxer a tela de gestão de usuários, junto com a migration de `User.ativo`. Registrado como item aberto.

### 2.6 Middleware — matcher

- `src/middleware.ts` exporta `auth` como middleware.
- `config.matcher`: `['/((?!api|_next/static|_next/image|favicon.ico|login|auth).*)']` — protege tudo exceto assets, rotas de auth, e a própria `/login`.
- Rota raiz `/` redireciona para `/dashboard` (ou `/login` se deslogado) via página, não via middleware — mantém middleware simples.

### 2.7 UI — conforme DESIGN.md

- Login page: card em `surface-container-lowest` (#ffffff) sobre canvas `surface` (#f7f9fb). Sem borda (regra no-line) — separação por mudança de superfície.
- Tipografia: `Plus Jakarta Sans` para headlines (título "Placitum"), `Inter` para corpo/inputs.
- Botão primary: `bg-primary` (#000a1e), `text-on-primary` (#ffffff), `rounded-md` (0.375rem — DESIGN §Componentes).
- Error: usar `error` (#ba1a1a), mas com moderação (DESIGN §Regras — vermelho padrão apenas quando estritamente necessário).
- Sidebar (layout autenticado): `surface-container-low` (#f2f4f6), workspace `surface-container-lowest`. Menu em PT-BR: Dashboard, Publicações, Agenda, Peças, Processos, Configurações.
- Tokens vivem em `globals.css` via Tailwind v4 `@theme` — só os tokens necessários para este slice; o resto entra quando usado.

### 2.8 Form: Server Action + zod

- `/login` é Server Component que renderiza um Client Component `<LoginForm />`.
- `<LoginForm />` usa `useActionState` + Server Action `loginAction` em `src/app/login/actions.ts`.
- `loginAction` valida com `zod`, chama `signIn('credentials', ...)`, mapeia erros do NextAuth para mensagens em PT-BR.

### 2.9 `auth.config` separado para o middleware

- NextAuth v5 exige split para edge runtime: `auth.config.ts` (sem Prisma/bcrypt) importado pelo middleware, e `auth.ts` completo para server actions.
- Decisão: apenas um `auth.ts` neste slice porque o provider Credentials não roda no edge — o middleware só chama `auth()` para ler cookie, o que funciona sem provider. Caso dê problema no `next build`, split será a primeira mitigação.

## 3. Arquivos

### Criar

| Path | Propósito |
|---|---|
| `src/lib/auth.ts` | Config NextAuth v5 (handlers, signIn, signOut, auth) |
| `src/lib/auth/credentials.ts` | `authenticateCredentials` — lógica pura |
| `src/lib/auth/email.ts` | `normalizeEmail` |
| `src/lib/auth/password.ts` | `passwordSchema`, `validatePasswordShape` |
| `src/lib/auth/guards.ts` | `assertEscritorioAtivo`, `EscritorioInativoError` |
| `src/lib/auth/errors.ts` | Classes de erro de auth (se necessário para discriminação) |
| `src/app/api/auth/[...nextauth]/route.ts` | Handlers GET/POST do NextAuth |
| `src/middleware.ts` | Proteção de rotas |
| `src/app/login/page.tsx` | Server Component da tela de login |
| `src/app/login/actions.ts` | Server Action `loginAction` |
| `src/app/login/login-form.tsx` | Client Component do form (`'use client'`) |
| `src/app/(auth)/layout.tsx` | Layout autenticado com sidebar |
| `src/app/(auth)/dashboard/page.tsx` | Placeholder do dashboard |
| `src/app/(auth)/sidebar.tsx` | Client Component da sidebar (navegação) |
| `src/types/next-auth.d.ts` | Augmentação de tipos da sessão (escritorioId, role) |
| `src/__tests__/auth/auth.unit.test.ts` | Testes unitários |
| `src/__tests__/auth/auth.integration.test.ts` | Testes das funções de login com Prisma mockado |
| `src/__tests__/auth/auth.component.test.ts` | Testes do `<LoginForm />` |

### Modificar

| Path | Motivo |
|---|---|
| `src/app/layout.tsx` | Trocar fontes Geist por Plus Jakarta + Inter; metadata pt-BR |
| `src/app/globals.css` | Adicionar tokens do design system (cores do DESIGN.md) |
| `src/app/page.tsx` | Redireciona para `/dashboard` (ou `/login` via middleware) |
| `package.json` | Nada a adicionar — dependências já instaladas |

### Remover

- Nada neste slice.

## 4. Dependências

### Já instaladas (verificado em `package.json`)
`next-auth@5-beta`, `bcryptjs` + `@types/bcryptjs`, `@prisma/client` + adapter-pg, `zod`, `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`.

### Novas neste slice
- **Nenhuma**.

### Fonts
- `Plus Jakarta Sans` e `Inter` via `next/font/google` — não são dependências npm.

## 5. Mapeamento CA → teste → arquivo

| CA / requisito | Teste | Arquivo testado |
|---|---|---|
| CA-2 login sucesso | `integration › retorna user em credenciais válidas` | `src/lib/auth/credentials.ts` |
| CA-3 senha errada | `integration › retorna null em senha errada` | `src/lib/auth/credentials.ts` |
| CA-3 e-mail inexistente | `integration › retorna null sem revelar existência de e-mail` | `src/lib/auth/credentials.ts` |
| CA-11 proteção de rota | `unit › matcher do middleware cobre /dashboard e libera /login` | `src/middleware.ts` |
| CA-12 adaptado (escritório inativo) | `integration › bloqueia login quando escritorio.ativo=false` | `src/lib/auth/credentials.ts` + `guards.ts` |
| CA-13 sessão com escritorioId | `integration › user retornado inclui escritorioId e role` | `src/lib/auth/credentials.ts` |
| Edge: e-mail com caixa alta / espaço | `unit › normalizeEmail faz trim + lowercase` | `src/lib/auth/email.ts` |
| RN-3 senha >= 10 chars, 1 letra + 1 número | `unit › passwordSchema rejeita curta/sem letra/sem número` | `src/lib/auth/password.ts` |
| UI render | `component › renderiza campos e botão com rótulos PT-BR` | `src/app/login/login-form.tsx` |
| UI erro | `component › exibe mensagem de erro quando prop error está presente` | `src/app/login/login-form.tsx` |
| UI form vazio | `component › submit com campos vazios mostra validação e não chama ação` | `src/app/login/login-form.tsx` |

## 6. Ordem de implementação

1. Tokens do design system em `globals.css`.
2. `src/lib/auth/email.ts`, `password.ts`, `guards.ts`, `errors.ts` — unidades puras.
3. `src/lib/auth/credentials.ts` — função principal composta.
4. `src/lib/auth.ts` — NextAuth config usando `credentials.ts`.
5. `src/types/next-auth.d.ts` — tipos da sessão.
6. `src/app/api/auth/[...nextauth]/route.ts` — handlers.
7. `src/middleware.ts`.
8. `src/app/login/*` (form + action + page).
9. `src/app/(auth)/layout.tsx` + `sidebar.tsx` + `dashboard/page.tsx`.
10. `src/app/layout.tsx` (fontes) + `src/app/page.tsx` (redirect).

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Incompatibilidade NextAuth v5 beta com Next 15.5 | Fixar versão no package-lock; se quebrar, separar `auth.config.ts` para edge |
| Prisma client gerado em `src/generated/prisma` pode poluir testes | `vitest.config.ts` já exclui `src/generated/**` |
| Testar Server Action no vitest é frágil | Extraímos toda lógica para funções puras; Server Action é só wrapper fino |
| `bcrypt.compare` é assíncrono e lento → testes lentos | Mockar `bcrypt` nos testes de integração (deps injetadas) |
| Middleware precisa rodar em edge runtime | Middleware chama `auth()` sem Prisma; só lê JWT do cookie |

## 8. Rollback

- Feature isolada em arquivos novos + 3 modificados (`layout.tsx`, `globals.css`, `page.tsx`). Reverter = `git revert` do commit de feature.
- JWT strategy não cria tabelas: sem migração a desfazer.

## 9. Itens abertos para slices futuros

1. Migration `User.ativo Boolean` + RN-9 completo.
2. Rate-limit por e-mail (CA-4) — depende de Redis já previsto na stack.
3. Registro de escritório (CA-1).
4. Magic link (CA-5/6/7) via Resend.
5. Convite de usuário (CA-8/9).
6. Logout no sidebar (CA-10).
7. Papel `PARALEGAL` — hoje schema tem `ESTAGIARIO`; alinhar vocabulário com spec em PR de constituição/schema.
