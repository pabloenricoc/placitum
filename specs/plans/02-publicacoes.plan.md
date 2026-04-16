# Plan 02 — Publicações (upload manual + feed)

**Spec**: `specs/features/02-publicacoes.spec.md`
**Status**: approved
**Iteração**: slice 1 — upload manual (texto + PDF) e feed com filtros

## 1. Escopo desta iteração

Entrega completa dos 21 CAs da spec 02. Não cobre:

- Análise com IA (spec 03) — o botão "Analisar com IA" é só um trigger que chama um endpoint stub retornando 501 `"Disponível em breve."`.
- Captação automática do DJe.
- Anexar PDF bruto em storage.

Decisão: mantemos **tudo** num único slice porque upload e listagem são dependentes e o feed é o ponto de entrada diário do advogado. Fatiar (ex.: só upload sem feed) entrega UX quebrada.

## 2. Decisões técnicas

### 2.1 Lógica em módulos puros, rotas finas

Para testar sem subir Next, a lógica crítica vive em `src/lib/publicacoes/*` recebendo dependências (Prisma, extractor PDF) por parâmetro. As rotas em `src/app/api/publicacoes/**/route.ts` são apenas:

1. `const session = await auth()` — valida sessão, retorna 401 caso contrário.
2. Valida input com `zod`.
3. Chama função pura com `{ prisma, extrator }` e `session.user.escritorioId`.
4. Serializa resposta ou erro.

Módulos:

- `src/lib/publicacoes/validation.ts` — schemas `zod`: `criarPorTextoSchema`, `filtrosListagemSchema`, `uploadMetadadosSchema`.
- `src/lib/publicacoes/create.ts` — `criarPublicacaoTexto(input, deps)` e `criarPublicacaoPdf(input, deps)`.
- `src/lib/publicacoes/list.ts` — `listarPublicacoes(filtros, deps)` monta `where`/`orderBy`/`skip`/`take` do Prisma e retorna `{ items, page, pageSize, total, totalPages }`.
- `src/lib/publicacoes/tribunal.ts` — `tribunalFromFonte(fonte: string): string` — RN-12.
- `src/lib/publicacoes/pdf.ts` — `extractTextFromPdf(buffer: Buffer): Promise<string>` — wrapper fino sobre `pdf-parse`. Toda chamada em `try/catch`; erros viram `PdfExtractionError` com `reason: "encrypted" | "empty" | "invalid"`.
- `src/lib/publicacoes/errors.ts` — classes `ValidationError`, `PdfExtractionError` com códigos p/ discriminação no handler.

### 2.2 Schema: adicionar `Publicacao.escritorioId`

RN-1 exige filtrar `Publicacao` por `escritorioId`. O schema atual ligava `Publicacao` → `Processo` → `Escritorio`, mas como upload manual tem `processoId = null`, **precisamos** de `escritorioId` direto em `Publicacao`.

**Migration**: `prisma/migrations/<timestamp>_add_escritorio_to_publicacao/migration.sql`.

```sql
ALTER TABLE "Publicacao"
  ADD COLUMN "escritorioId" TEXT;

-- Backfill pelo processo quando existir (idempotente, só em dev — prod só tem dados de teste)
UPDATE "Publicacao" pub
SET "escritorioId" = proc."escritorioId"
FROM "Processo" proc
WHERE pub."processoId" = proc."id";

-- NOT NULL depois do backfill
ALTER TABLE "Publicacao"
  ALTER COLUMN "escritorioId" SET NOT NULL;

ALTER TABLE "Publicacao"
  ADD CONSTRAINT "Publicacao_escritorioId_fkey"
  FOREIGN KEY ("escritorioId") REFERENCES "Escritorio"("id") ON DELETE RESTRICT;

CREATE INDEX "Publicacao_escritorioId_dataPublicacao_idx"
  ON "Publicacao" ("escritorioId", "dataPublicacao" DESC);
```

E em `schema.prisma`:

```prisma
model Publicacao {
  // ...existing...
  escritorioId   String
  escritorio     Escritorio @relation(fields: [escritorioId], references: [id])

  @@index([escritorioId, dataPublicacao(sort: Desc)])
}

model Escritorio {
  // ...existing...
  publicacoes    Publicacao[]
}
```

Riscos aceitos: em ambiente com dados de produção reais (não é o caso hoje), o backfill por `processo.escritorioId` deixaria órfãs as publicações sem processo — no MVP não existem.

### 2.3 Biblioteca de PDF: `pdf-parse`

Comparativo:

| | `pdf-parse` | `pdfjs-dist` |
|---|---|---|
| Runtime | Node | Node + browser (pesado no server) |
| API | `pdf(buffer) → { text }` | Baixo-nível, precisa compor |
| Peso | Pequeno | Grande |
| Streams / async | Suporta | Suporta |

Escolhemos `pdf-parse`. Instalar com `npm i pdf-parse` (já compatível com Node 22). Tipos via `@types/pdf-parse` (dev). Wrapper em `pdf.ts` faz a chamada isolada; testes injetam mock e não dependem da lib real.

Runtime da rota: `export const runtime = "nodejs"` em `/api/publicacoes/upload/route.ts` (edge não suporta `Buffer` nativo).

### 2.4 Next 15 API routes — `Request` + `NextResponse`

- `GET /api/publicacoes` — usa `nextUrl.searchParams` para pegar filtros; retorna `NextResponse.json(result)`.
- `POST /api/publicacoes` — `await req.json()`.
- `POST /api/publicacoes/upload` — `await req.formData()`, extrai `file` como `File`, lê `arrayBuffer`, valida tamanho e tipo.

### 2.5 Páginas (App Router)

- `src/app/(auth)/publicacoes/page.tsx` — Server Component que:
  - Lê `auth()` → `escritorioId` (garantido pelo layout (auth)).
  - Lê `searchParams`: `page`, `status`, `tribunal`, `de`, `ate`, `q`, `publicacao` (id do drawer).
  - Chama `listarPublicacoes` diretamente (lib → Prisma), sem passar pela rota HTTP (economia de hop).
  - Renderiza `<FeedHeader/>`, `<Filtros .../>`, `<FeedTable items=.../>` e, se `searchParams.publicacao`, `<DetalheDrawer id=.../>`.

- `src/app/(auth)/publicacoes/nova/page.tsx` — Server Component que renderiza um `<UploadForm action={criarPublicacaoAction}/>`. Server Action `criarPublicacaoAction` vive em `actions.ts`, aceita `FormData` (texto **ou** arquivo), chama a mesma lógica das rotas HTTP e redireciona para `/publicacoes?publicacao=<id>` em sucesso.

- `src/app/(auth)/publicacoes/[id]/page.tsx` — **não** faremos nesta iteração. Drawer é suficiente. Deep-link via `?publicacao=<id>` na própria `/publicacoes`.

### 2.6 Componentes

Diretório `src/app/(auth)/publicacoes/_components/`:

- `feed-header.tsx` (Server) — headline + subtítulo + botão "Nova publicação".
- `filtros.tsx` (Client) — selects + inputs; submete como query params via `useRouter().push`. Sem estado local longo; cada submit atualiza URL.
- `feed-table.tsx` (Server) — tabela com ghost borders, badges de status, mouse hover → ações. Cada linha é um `<Link href={?publicacao=id}>` (abre o drawer).
- `status-badge.tsx` (Server) — mapeia enum `StatusAnalise` para classes Tailwind.
- `detalhe-drawer.tsx` (Client) — fixed right, `on-close` limpa query param. Botão "Analisar com IA" chama `POST /api/publicacoes/:id/analisar` que por ora retorna **501**. Fail-loud documenta que a feature 03 conecta aqui depois.
- `upload-form.tsx` (Client) — textarea + input file + inputs de metadata, validação local leve + delegação para Server Action.
- `paginacao.tsx` (Server) — liga a `?page=N` conservando outros filtros.
- `empty-state.tsx` (Server) — CA-21.

### 2.7 Design fidelity

Seguindo `DESIGN.md` + `docs/designs/publicacoes.html`:

- Canvas `/publicacoes` usa `bg-surface-container-lowest` (vem do layout autenticado).
- Headline `3.5rem`, `font-headline`, `font-bold`, `tracking-[-0.04em]`.
- Filtros dentro de `bg-surface-container-low p-6 rounded-xl`.
- Tabela em `bg-surface-container-lowest rounded-xl overflow-hidden`, sem linhas verticais, `divide-y divide-outline-variant/15` (ghost borders — opacidade 15%).
- Badge de status: `rounded-full text-[10px] font-bold uppercase` com cores:
  - `NOVA` → `bg-primary-fixed text-on-primary-fixed`
  - `EM_ANALISE` → `bg-tertiary-fixed text-on-tertiary-fixed-variant`
  - `ANALISADA` → `bg-secondary-container text-on-secondary-container`
  - `PRAZO_CADASTRADO` → `bg-secondary-container text-on-secondary-container`
  - `PECA_GERADA` → `bg-primary-container text-on-primary`
  - `ERRO` → `bg-error-container text-on-error-container`
- Linha da tabela com `group hover:bg-surface-container-high`; ações com `opacity-0 group-hover:opacity-100`.
- Nenhuma menção à "Lexis AI" — sempre "Placitum". Comentários de arte no HTML ficam fora do código final.
- Disclaimer de IA não é renderizado nesta feature (não há conteúdo gerado por IA ainda); o drawer só mostra texto original.

### 2.8 Busca & filtros no Prisma

`where` construído condicionalmente em `listarPublicacoes`:

```ts
const where: Prisma.PublicacaoWhereInput = { escritorioId };
if (status) where.statusAnalise = status;
if (tribunal) where.fonte = { startsWith: `DJe-${tribunal}` };
if (de || ate) where.dataPublicacao = { gte: de, lte: ate };
if (q && q.length >= 3) {
  where.processo = {
    is: {
      OR: [
        { numeroProcesso: { contains: q, mode: 'insensitive' } },
        { parteCliente: { contains: q, mode: 'insensitive' } },
      ],
    },
  };
}
```

`orderBy`: `[{ dataPublicacao: 'desc' }, { createdAt: 'desc' }]` — RN-11.

### 2.9 Paginação

`pageSize = 20`. Query count + findMany em `prisma.$transaction` para consistência.

```ts
const [total, items] = await prisma.$transaction([
  prisma.publicacao.count({ where }),
  prisma.publicacao.findMany({ where, orderBy, skip, take: 20, include: { processo: true } }),
]);
```

### 2.10 Stub de análise IA

`POST /api/publicacoes/[id]/analisar` retorna:

```ts
return NextResponse.json(
  { error: 'NOT_IMPLEMENTED', message: 'Disponível em breve.' },
  { status: 501 },
);
```

Esta rota garante que o botão do drawer tem para onde apontar. Spec 03 substitui a implementação. Vale verificar isolamento multi-tenant mesmo no stub: checa que a publicação pertence ao escritório antes de responder 501.

## 3. Arquivos

### Criar

| Path | Propósito |
|---|---|
| `prisma/migrations/<ts>_add_escritorio_to_publicacao/migration.sql` | Migration §2.2 |
| `src/lib/publicacoes/validation.ts` | Schemas zod |
| `src/lib/publicacoes/create.ts` | `criarPublicacaoTexto`, `criarPublicacaoPdf` |
| `src/lib/publicacoes/list.ts` | `listarPublicacoes` |
| `src/lib/publicacoes/tribunal.ts` | `tribunalFromFonte` |
| `src/lib/publicacoes/pdf.ts` | Wrapper `pdf-parse` + erros |
| `src/lib/publicacoes/errors.ts` | `ValidationError`, `PdfExtractionError` |
| `src/app/api/publicacoes/route.ts` | GET (listar) + POST (texto) |
| `src/app/api/publicacoes/upload/route.ts` | POST upload PDF |
| `src/app/api/publicacoes/[id]/analisar/route.ts` | Stub 501 |
| `src/app/(auth)/publicacoes/page.tsx` | Feed |
| `src/app/(auth)/publicacoes/nova/page.tsx` | Form de upload |
| `src/app/(auth)/publicacoes/actions.ts` | Server Action do upload |
| `src/app/(auth)/publicacoes/_components/feed-header.tsx` | — |
| `src/app/(auth)/publicacoes/_components/filtros.tsx` | Client |
| `src/app/(auth)/publicacoes/_components/feed-table.tsx` | — |
| `src/app/(auth)/publicacoes/_components/status-badge.tsx` | — |
| `src/app/(auth)/publicacoes/_components/detalhe-drawer.tsx` | Client |
| `src/app/(auth)/publicacoes/_components/upload-form.tsx` | Client |
| `src/app/(auth)/publicacoes/_components/paginacao.tsx` | — |
| `src/app/(auth)/publicacoes/_components/empty-state.tsx` | — |
| `src/__tests__/publicacoes/publicacoes.unit.test.ts` | |
| `src/__tests__/publicacoes/publicacoes.integration.test.ts` | |
| `src/__tests__/publicacoes/publicacoes.component.test.ts` | |

### Modificar

| Path | Motivo |
|---|---|
| `prisma/schema.prisma` | `Publicacao.escritorioId` + relation + index; `Escritorio.publicacoes` |
| `package.json` | `pdf-parse` (dep) + `@types/pdf-parse` (devDep) |
| `src/app/(auth)/sidebar.tsx` | Já tem entrada "Publicações" — nada a mudar, só validar. |

### Remover

Nada.

## 4. Dependências

- Novas: `pdf-parse@^1.1.1`, `@types/pdf-parse` (dev).
- Já instaladas: `zod`, `@prisma/client`, `next-auth`, `react`, `tailwindcss`, testing libs.

## 5. Mapeamento CA → teste → arquivo

| CA / requisito | Teste | Arquivo testado |
|---|---|---|
| CA-1 upload texto sucesso | `integration › criarPublicacaoTexto persiste com escritorioId e status NOVA` | `lib/publicacoes/create.ts` |
| CA-1 sem passwordHash/logs | `unit/integration › criarPublicacaoTexto não loga textoIntegral` (sanity) | `lib/publicacoes/create.ts` |
| CA-2 texto curto | `unit › criarPorTextoSchema rejeita texto < 50 chars` | `lib/publicacoes/validation.ts` |
| CA-3 fonte faltando | `unit › rejeita sem fonte` | `lib/publicacoes/validation.ts` |
| CA-4 data ausente / futura | `unit › rejeita data ausente` e `rejeita data futura` | `lib/publicacoes/validation.ts` |
| CA-5 upload PDF sucesso | `integration › criarPublicacaoPdf extrai texto e persiste` | `lib/publicacoes/create.ts` |
| CA-6 PDF > 5MB | `unit › uploadMetadadosSchema rejeita > 5MB` | `lib/publicacoes/validation.ts` |
| CA-7 tipo errado | `unit › rejeita MIME != application/pdf` | `lib/publicacoes/validation.ts` |
| CA-8 texto extraído curto | `integration › rejeita quando extractor retorna < 50 chars` | `lib/publicacoes/create.ts` |
| CA-9 isolamento multi-tenant | `integration › listarPublicacoes filtra por escritorioId` | `lib/publicacoes/list.ts` |
| CA-10 paginação | `integration › pagina 2 de 45 retorna itens 21-40` | `lib/publicacoes/list.ts` |
| CA-11 ordem estável | `integration › desempate por createdAt desc` | `lib/publicacoes/list.ts` |
| CA-12 filtro status | `integration › where.statusAnalise aplicado` | `lib/publicacoes/list.ts` |
| CA-13 filtro tribunal | `integration › filtra fonte startsWith DJe-<tribunal>` + `unit tribunalFromFonte` | `lib/publicacoes/list.ts`, `tribunal.ts` |
| CA-14 período | `integration › filtra dataPublicacao gte/lte` | `lib/publicacoes/list.ts` |
| CA-15/16 busca | `integration › q pesquisa numeroProcesso e parteCliente ILIKE` | `lib/publicacoes/list.ts` |
| CA-17 q curta ignorada | `integration › q com 2 chars é ignorado` | `lib/publicacoes/list.ts` |
| CA-18 feed UI | `component › FeedTable renderiza linhas com status badges` | `_components/feed-table.tsx` |
| CA-19 drawer | `component › DetalheDrawer renderiza textoIntegral e botão Analisar` | `_components/detalhe-drawer.tsx` |
| CA-20 form upload | `component › UploadForm mostra validação texto < 50` | `_components/upload-form.tsx` |
| CA-21 empty state | `component › FeedTable em modo vazio renderiza link para nova` | `_components/feed-table.tsx` ou `empty-state.tsx` |

## 6. Ordem de implementação (green)

1. Migration + `schema.prisma` (sem rodar ainda — só gerar client no fim).
2. `pdf.ts` + `errors.ts` — blocos isolados.
3. `validation.ts` — zod schemas.
4. `tribunal.ts` — puro.
5. `create.ts` + `list.ts` — compõem 2–4.
6. Rodar `npm test` — **unit + integration passam aqui**.
7. Componentes em `_components/` — do mais simples (status-badge) ao mais complexo (upload-form, detalhe-drawer).
8. Rodar `npm test` — **component também passa**.
9. Rotas `route.ts` (GET/POST + upload + stub analisar).
10. Páginas `page.tsx` (feed + nova) + Server Action.
11. `npx prisma generate` depois do schema.prisma atualizado. Rodar `typecheck` + `lint`.

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| `pdf-parse` falha em PDFs encriptados ou imagem | Wrapper em `pdf.ts` captura e retorna `PdfExtractionError`; rota mapeia para 400 com mensagem clara (CA edge case) |
| `Buffer` não disponível no edge runtime | `export const runtime = "nodejs"` na rota de upload |
| Tamanho de `File` via `formData` chega errado se o cliente mente | Medimos `arrayBuffer.byteLength` no servidor, ignoramos `file.size` |
| Migration em prod vazia — sem efeito | Backfill só afeta dev/staging; checar antes do deploy real que `SELECT count(*) FROM "Publicacao" WHERE "escritorioId" IS NULL` é 0 após backfill (ou aceitar vácuo) |
| Busca `ILIKE %q%` sem índice pode ficar lenta em 100k rows | Fora do orçamento MVP; listado em §10 da spec para futura otimização com `pg_trgm` |
| Server Action + redirect em testes do Vitest é ruim | Extrair lógica para `create.ts`; Server Action vira wrapper fino testado só por inspeção estática / integração E2E futura |
| Estado do drawer via URL query param pode conflitar com `Link` prefetch | Usar `scroll={false}` nos `Link` do drawer |

## 8. Rollback

- Feature isolada: tudo em diretório novo + modificação de `schema.prisma`, `package.json`.
- Reverter feature: `git revert` do commit de feature **+** rollback da migration (`prisma migrate resolve --rolled-back <nome>` ou script SQL `ALTER TABLE "Publicacao" DROP COLUMN "escritorioId"`).
- Flag de segurança: se a migration falhar no deploy, botão de upload some (rota 500 → UI exibe erro) — sem bloqueio de login (feature 01 segue ok).

## 9. Itens abertos para slices futuros

1. Associar manualmente publicação a um `Processo` existente.
2. Deduplicação por hash do texto integral.
3. Anexar PDF bruto em storage (S3/R2) e linkar em `Publicacao.anexoUrl`.
4. OCR para PDFs imagem (Tesseract ou API externa).
5. Feature 03: implementar `POST /api/publicacoes/[id]/analisar` real com Haiku 4.5.
6. Exportar CSV do feed.
7. Rate-limit do upload por escritório (prevenir abuso 5 MB × N).
8. Badge de confiança IA na tabela (coluna existe no HTML, mas vive sem dado até a feature 03).
