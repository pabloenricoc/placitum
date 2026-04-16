# Constituição do Projeto Placitum

> Regras inegociáveis. Qualquer PR que viole este documento deve ser rejeitado.
> Caso uma regra precise mudar, mude **este arquivo primeiro**, num commit separado.

## 1. Identidade e escopo

- **Produto**: SaaS jurídico que automatiza controle de publicações, classificação de prazos e geração de rascunhos de peças para escritórios de advocacia massificados.
- **Público**: escritórios brasileiros com volume alto de publicações no DJe.
- **Time**: 1 dev full-stack + 1 jurista. MVP em 30 dias. Bootstrapping.
- **Prioridade sempre**: correção jurídica > segurança > UX > performance > elegância de código.

## 2. Stack fixa (não trocar sem amend à constituição)

- Node.js 22 LTS
- Next.js 15 (App Router, TypeScript strict, Server Components por padrão)
- Tailwind CSS + shadcn/ui — **único** framework CSS permitido
- Prisma — **único** acesso ao banco. Proibido query builder ou SQL direto fora de migrations
- NextAuth.js v5 (credenciais + magic link)
- PostgreSQL 16
- BullMQ + Redis 7
- Anthropic SDK (Haiku 4.5 para classificação, Sonnet 4.6 para geração)
- Resend para e-mail transacional
- Deploy: Coolify no Hetzner CX32

## 3. Segurança (blocker de merge)

1. **Nunca** commitar segredos. `.env` fica fora do Git. `.env.example` sempre atualizado.
2. **Nunca** expor Postgres ou Redis à internet pública.
3. Todo input externo passa por `zod`. Sem exceção.
4. **Multi-tenant**: toda query que acessa dados de um escritório **tem** que filtrar por `escritorioId`. Não existe "consulta admin global" na aplicação.
5. Senhas: `bcrypt` com `saltRounds >= 12`. Nunca texto puro, nunca SHA-*.
6. Rotas de cron protegidas por `Authorization: Bearer ${CRON_SECRET}`.
7. Proibido `eval`, `Function()`, `dangerouslySetInnerHTML` com conteúdo não-sanitizado.
8. Proibido `SELECT *` com PII (CPF, endereço, telefone). Selecionar colunas explicitamente.
9. Logs **não** podem conter senhas, tokens, magic links, conteúdo de publicação bruto com PII.

## 4. IA (Claude)

1. `system` sempre com `cache_control` (prompt caching obrigatório).
2. Nenhum CPF, endereço residencial ou telefone vai para o prompt. Anonimizar antes.
3. Toda chamada registra `input_tokens`, `output_tokens`, `cache_read`, `cache_creation` em tabela de consumo.
4. Saída do modelo **sempre** passa por `JSON.parse` em `try/catch`. Falha de parse = log + fallback, nunca explode no usuário.
5. Toda peça gerada carrega disclaimer visível: **"Rascunho gerado por IA — revisão obrigatória."**
6. Human-in-the-loop: advogado revisa **antes** de qualquer protocolo. Sem exceção.

## 5. Metodologia: SDD + TDD

Pipeline obrigatório para qualquer feature não-trivial:

1. **Spec** — `specs/features/NN-nome.spec.md` com requisitos, regras de negócio, critérios de aceite no formato Given/When/Then, edge cases e fora-de-escopo explícito.
2. **Plan** — `specs/plans/NN-nome.plan.md` com decisões arquiteturais, arquivos afetados, migrations, riscos e rollback.
3. **Test** — escrever testes que **falham** cobrindo os critérios de aceite da spec.
4. **Code** — implementar o mínimo para passar os testes.
5. **Refactor** — limpar com testes verdes.
6. **Review** — PR linkando spec + plan. CI: typecheck + lint + testes verdes.

Regra de ouro: **nunca** escrever código de produção sem spec + teste falhando primeiro. Bug fix pequeno pode pular spec, mas não pode pular teste de regressão.

## 6. Convenções de código

### TypeScript
- `strict: true`. Nada de `any` — usar `unknown` e fazer type guard.
- Tipos do Prisma vêm do client gerado, não redeclarar.
- `interface` para objetos, `type` para unions/intersections.

### React / Next.js
- Server Components por padrão. `'use client'` é exceção, não regra.
- Nunca `useEffect` para fetch. Dados vêm do servidor.
- Formulários usam Server Actions + `zod`.

### API routes
- Toda rota valida sessão antes de qualquer lógica (exceto login/signup/magic link).
- Erros com status HTTP correto + JSON `{ error, message }`. Nunca texto cru.
- Cron behind `CRON_SECRET`.

### Banco
- Toda mudança de schema vira **migration** (`prisma migrate`). `db push` é só para protótipo local.
- Operações multi-tabela em `prisma.$transaction`.
- Nomes em `snake_case` no banco, `camelCase` no Prisma model via `@map`.

## 7. Git & commits

- Branch principal: `main`. Sempre verde.
- Feature branches: `feat/descricao-curta`, `fix/...`, `chore/...`, `docs/...`.
- Commits em português, modo imperativo: `feat: descrição`, `fix: descrição`.
- Antes de commitar: `npm run typecheck && npm run lint && npm test` passam localmente.
- Commits pequenos e coesos. Sem "WIP" em `main`.

## 8. Design (resumo — detalhe em `DESIGN.md`)

- North Star: "The Digital Jurist". Precisão, clareza, autoridade editorial.
- Regra No-Line: separar seções por mudança de superfície, não por `border: 1px`.
- Nunca preto 100% (`#000`). Usar `on-surface` `#191c1e`.
- Nunca arredondar tudo. `rounded-sm` para dados, `rounded-lg` para containers.
- Disclaimer de IA sempre visível nos artefatos gerados.

## 9. Contexto jurídico (vocabulário canônico)

- **Publicação** — texto publicado no Diário de Justiça Eletrônico (DJe).
- **Prazo processual** — tempo para responder/recorrer após publicação, em dias úteis.
- **Dias úteis** — exclui sábados, domingos e feriados (nacional + forense).
- **Peça** — documento processual (contestação, réplica, recurso etc.).
- **Escritório** — tenant. Unidade de isolamento de dados.

## 10. Alterando a constituição

Qualquer mudança aqui é PR isolado, título `chore(constitution): ...`, com justificativa no corpo. Não misturar com feature.
