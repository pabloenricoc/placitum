# Plan 03 — Análise de publicação com IA

**Spec**: `specs/features/03-analise-ia.spec.md`
**Status**: approved
**Iteração**: slice 1 — rota `POST /api/publicacoes/[id]/analisar` real + UI de resultado no drawer

## 1. Escopo desta iteração

Entrega os 22 CAs da spec 03. Fora desta iteração:

- Geração de peça (feature 04).
- Fila BullMQ (tudo síncrono por ora).
- Cron de recuperação de publicações presas em `EM_ANALISE`.
- Rate-limit de consumo por escritório.

Decisão: chamada síncrona dentro da rota. Haiku p95 ~3s; Next 15 App Router dá timeout default de ~60s em Node runtime. Suficiente.

## 2. Decisões técnicas

### 2.1 Arquitetura — lógica pura + rota fina

Mesma filosofia da feature 02: rota só resolve auth, valida id, chama orquestrador puro com deps injetáveis. Lógica mora em `src/lib/analise-ia/*`.

```
src/lib/analise-ia/
  orchestrator.ts    # analisarPublicacao(publicacaoId, ctx)
  claude.ts          # chamarClaudeAnalise(promptInput, deps) → RespostaIA + UsageTokens
  sanitizar.ts       # sanitizarParaIA(texto)
  schema.ts          # zod do JSON da IA + tipo RespostaIA
  normalizar.ts      # confianca numérica → enum; enums inválidos → OUTRO; etc.
  precos.ts          # tabela de preços Haiku + calcularCustoBrl(usage)
  errors.ts          # AiParseError, AiSchemaError, AiUnavailableError

src/lib/prazos/
  calcular-prazo.ts  # calcularDataLimite(dataInicio, dias, contagem, feriados)
  feriados.ts        # listarFeriadosAplicaveis(estado?, comarca?, janela) via Prisma

src/lib/prompts/
  analisar-publicacao.ts  # SYSTEM_PROMPT (const) + buildUserPrompt(input)
```

Rota `src/app/api/publicacoes/[id]/analisar/route.ts` vira:

```ts
export async function POST(req, { params }) {
  const session = await auth();
  if (!session?.user?.escritorioId) return 401;
  const { id } = await params;
  try {
    const out = await analisarPublicacao({ publicacaoId: id, escritorioId: session.user.escritorioId }, { prisma, chamarClaude, now: () => new Date() });
    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    return mapAnaliseError(e);
  }
}
```

### 2.2 Anthropic SDK — wrapper `chamarClaudeAnalise`

```ts
interface ChamarClaudeDeps {
  client: Anthropic;
}

interface PromptInput {
  textoSanitizado: string;
  dataPublicacao: string; // YYYY-MM-DD
  fonte: string;
}

interface RespostaBruta {
  objeto: unknown; // JSON.parse do content
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
}

async function chamarClaudeAnalise(input, { client }): Promise<RespostaBruta>
```

- Usa `client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: buildUserPrompt(input) }], temperature: 0, timeout: 30_000 })`.
- Extrai `content[0].text`, faz `JSON.parse` em try/catch. Se falhar → `AiParseError`.
- Extrai `usage` (e zero-fill campos de cache quando o SDK não retorna).
- Não faz `safeParse` (isso é responsabilidade do orquestrador — mantém wrapper enxuto e testável).

### 2.3 System prompt e caching

`SYSTEM_PROMPT` é uma `const` exportada, fixa. Curto mas com:

1. Persona: "Você é um jurista digital brasileiro especializado em classificação de publicações judiciais."
2. Tarefa: extrair dados estruturados.
3. Schema exigido (literal do JSON acima, com enums explícitos).
4. Regra: responder **apenas** o JSON, sem markdown, sem prefixo.
5. 2 exemplos curtos (input → output) para ancorar formato.

`cache_control: { type: 'ephemeral' }` no bloco `system`. Prompt caching pede bloco com texto estável; qualquer mudança no system quebra o cache (é o comportamento desejado).

### 2.4 Sanitização

`sanitizarParaIA(texto)` aplica regex em ordem:

```ts
texto
  .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF]')
  .replace(/\bCPF[:\s]*\d{11}\b/gi, 'CPF [CPF]')  // 11 dígitos após "CPF"
  .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ]')
  .replace(/\bCNPJ[:\s]*\d{14}\b/gi, 'CNPJ [CNPJ]')
  .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[EMAIL]')
  .replace(/\(\d{2}\)\s?\d{4,5}-\d{4}/g, '[TELEFONE]')
  .replace(/\b\d{2}\s?9?\d{4}[-\s]?\d{4}\b/g, '[TELEFONE]');
```

Regex `/\b\d{11}\b/` solta demais (casaria números de processo). Por isso restringimos CPF/CNPJ "nu" só quando precedidos de label. Regra testada em unit.

### 2.5 Validação do JSON da IA — zod

`respostaIASchema` em `src/lib/analise-ia/schema.ts`:

```ts
const respostaIASchema = z.object({
  numeroProcesso: z.string().min(1).nullable(),
  vara: z.string().nullable(),
  comarca: z.string().nullable(),
  estado: z.string().length(2).nullable(),
  tipoDecisao: z.string(),
  resumo: z.string().min(10),
  partes: z.object({
    autor: z.string().nullable(),
    reu: z.string().nullable(),
  }),
  parteCliente: z.string().nullable(),
  areaDireito: z.enum(['CIVEL','TRABALHISTA','PREVIDENCIARIO','BANCARIO','TRIBUTARIO','OUTRO']),
  prazo: z.object({
    tipoProvidencia: z.enum([
      'CONTESTACAO','RECURSO_APELACAO','RECURSO_AGRAVO','EMBARGOS_DECLARACAO',
      'MANIFESTACAO','IMPUGNACAO','CONTRARRAZOES','CUMPRIMENTO_SENTENCA','OUTRO',
    ]),
    dias: z.number().int().min(1).max(365),
    tipoContagem: z.enum(['UTEIS', 'CORRIDOS']),
  }),
  urgencia: z.enum(['ALTA', 'MEDIA', 'BAIXA']),
  confianca: z.union([
    z.enum(['ALTA', 'MEDIA', 'BAIXA']),
    z.number().min(0).max(1),
  ]),
});
```

`normalizarConfianca` converte número → enum (>=0.85 ALTA, >=0.6 MEDIA, senão BAIXA).

### 2.6 Orquestrador — fluxo de `analisarPublicacao`

```
1. Prisma: findFirst({ id, escritorioId, statusAnalise: 'NOVA' }, { include: processo })
   - não encontrou com esse where → findFirst só com { id, escritorioId }:
     - null → 404 NOT_FOUND
     - statusAnalise != NOVA → 409 CONFLICT
2. Guard de concorrência: updateMany({ where: { id, statusAnalise: 'NOVA' }, data: { statusAnalise: 'EM_ANALISE' } })
   - count === 0 → 409 CONFLICT (outro winner)
3. textoSanitizado = sanitizarParaIA(publicacao.textoIntegral)
4. try {
     resposta = await chamarClaudeAnalise({ textoSanitizado, dataPublicacao: ISO, fonte })
   } catch (AiParseError/AiUnavailableError) {
     persistir ConsumoIA (usage mesmo em erro), transicionar ERRO, re-throw
   }
5. parsed = respostaIASchema.safeParse(resposta.objeto)
   - fail → persistir ConsumoIA, transicionar ERRO, throw AiSchemaError
6. dados = normalizar(parsed.data)   # enums inválidos já filtrados pelo zod
7. feriados = listarFeriadosAplicaveis(estado, comarca, janela) via prisma
8. dataLimite = calcularDataLimite(publicacao.dataPublicacao, dados.prazo.dias, dados.prazo.tipoContagem, feriados)
9. statusFinal = dados.confianca === 'BAIXA' ? 'ANALISADA' : 'PRAZO_CADASTRADO'
10. prisma.$transaction:
     - upsert Processo (se numeroProcesso e não existe; se existe, NÃO sobrescreve)
     - update Publicacao: statusAnalise=statusFinal, confiancaIA, dadosExtraidos=dados, processoId
     - create Prazo vinculado (com dataLimite, tipoProvidencia, diasPrazo, tipoContagem)
11. create ConsumoIA (fora da tx para não vincular a falha de write do consumo à análise)
12. return { publicacaoId, statusAnalise: statusFinal, confianca, prazoId, dataLimite: ISO }
```

Observação: a chamada Anthropic **não** pode estar dentro de `$transaction` — transaction do Prisma reserva conexão; chamada HTTP externa a tornaria extensamente longa e arriscaria deadlocks. Chamamos IA primeiro, abrimos tx só para persistir.

### 2.7 Cálculo de prazo — `calcularDataLimite`

Arquivo: `src/lib/prazos/calcular-prazo.ts`

Assinatura:

```ts
function calcularDataLimite(params: {
  dataInicio: Date;          // dataPublicacao
  dias: number;
  tipoContagem: 'UTEIS' | 'CORRIDOS';
  feriados: Date[];          // normalizados para 00:00 UTC
}): Date
```

Algoritmo:

1. Normaliza `dataInicio` para UTC meia-noite.
2. **Descobre primeiro dia de contagem**: avança 1 dia; enquanto `ehFimDeSemana(d) || ehFeriado(d, feriados)`, avança mais 1. Esse é dia-1.
3. Se `tipoContagem === 'UTEIS'`: loop contando dias úteis até chegar a `dias` (o dia-1 conta como o 1º).
4. Se `tipoContagem === 'CORRIDOS'`: avança `(dias - 1)` dias corridos a partir do dia-1.
5. **Prorroga**: enquanto `ehFimDeSemana(d) || ehFeriado(d, feriados)`, avança 1 dia.
6. Retorna `d`.

Helpers puros: `ehFimDeSemana(d)`, `ehFeriado(d, feriados)` (compara por YYYY-MM-DD em UTC).

Feriados são buscados no banco por janela `[dataPublicacao, dataPublicacao + 2×dias + 14]` (margem). Feriado `ESTADUAL` só casa se `estado` passado bate; `MUNICIPAL` se `comarca` bate. `NACIONAL` sempre casa.

### 2.8 Persistência — `ConsumoIA` (novo modelo)

Migration `prisma/migrations/<ts>_add_consumo_ia/migration.sql`:

```sql
CREATE TABLE "ConsumoIA" (
  "id" TEXT PRIMARY KEY,
  "escritorioId" TEXT NOT NULL REFERENCES "Escritorio"("id") ON DELETE RESTRICT,
  "publicacaoId" TEXT REFERENCES "Publicacao"("id") ON DELETE SET NULL,
  "modelo" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL,
  "outputTokens" INTEGER NOT NULL,
  "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
  "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
  "custoEstimadoBrl" DECIMAL(10, 4) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ConsumoIA_escritorioId_createdAt_idx"
  ON "ConsumoIA" ("escritorioId", "createdAt" DESC);
```

Schema Prisma:

```prisma
model ConsumoIA {
  id                  String   @id @default(cuid())
  escritorioId        String
  escritorio          Escritorio @relation(fields: [escritorioId], references: [id])
  publicacaoId        String?
  publicacao          Publicacao? @relation(fields: [publicacaoId], references: [id], onDelete: SetNull)
  modelo              String
  inputTokens         Int
  outputTokens        Int
  cacheReadTokens     Int      @default(0)
  cacheCreationTokens Int      @default(0)
  custoEstimadoBrl    Decimal  @default(0) @db.Decimal(10, 4)
  createdAt           DateTime @default(now())

  @@index([escritorioId, createdAt(sort: Desc)])
}

model Escritorio {
  // ...
  consumosIA ConsumoIA[]
}

model Publicacao {
  // ...
  consumosIA ConsumoIA[]
}
```

### 2.9 Preços

`src/lib/analise-ia/precos.ts`:

```ts
export const PRECOS_USD_POR_MILHAO = {
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00, cacheRead: 0.10 },
} as const;

export function calcularCustoBrl(modelo: string, usage, cotacaoBrl: number) {
  const p = PRECOS_USD_POR_MILHAO[modelo] ?? PRECOS_USD_POR_MILHAO['claude-haiku-4-5-20251001'];
  const usd =
    (usage.input_tokens * p.input +
     usage.output_tokens * p.output +
     usage.cache_read_input_tokens * p.cacheRead) / 1_000_000;
  return Number((usd * cotacaoBrl).toFixed(4));
}
```

Cotação lida de `process.env.USD_BRL_RATE` com fallback `5.0` — fixa no MVP, realista.

### 2.10 Mapeamento de erros HTTP

`src/app/api/publicacoes/[id]/analisar/route.ts` mapeia:

| Erro | Status | JSON |
|---|---|---|
| `NotFoundError` | 404 | `{ error: "NOT_FOUND", message: "Publicação não encontrada." }` |
| `ConflictError` | 409 | `{ error: "CONFLICT", message: "Publicação já analisada ou em análise." }` |
| `AiParseError` | 502 | `{ error: "AI_PARSE_ERROR", message: "Resposta da IA não pôde ser interpretada." }` |
| `AiSchemaError` | 502 | `{ error: "AI_SCHEMA_ERROR", message: "Resposta da IA não tem o formato esperado." }` |
| `AiUnavailableError` | 503 | `{ error: "AI_UNAVAILABLE", message: "Serviço de IA indisponível. Tente novamente." }` |
| `ValidationError` | 400 | `{ error: "VALIDATION_ERROR", message: e.message }` |
| default | 500 | `{ error: "INTERNAL_ERROR", message: "Erro ao analisar." }` |

### 2.11 UI — atualização do drawer

`src/app/(auth)/publicacoes/_components/detalhe-drawer.tsx`:

- Se `publicacao.statusAnalise in (ANALISADA, PRAZO_CADASTRADO, PECA_GERADA)` e `publicacao.dadosExtraidos` existe, renderiza `<PainelAnalise dados prazo confianca />`.
- Se `statusAnalise === 'NOVA'`, mostra botão "Analisar com IA" atual.
- Se `statusAnalise === 'EM_ANALISE'`, mostra spinner "Analisando…".
- Se `statusAnalise === 'ERRO'`, mostra aviso + botão "Tentar novamente" (POST na mesma rota; a rota, detectando ERRO, primeiro reseta para NOVA e roda — decisão: no slice 1, tentar novamente = operação admin, fora do escopo; mostramos só a mensagem de erro).

Novos componentes:

- `_components/painel-analise.tsx` (Server) — grid "Prazo Legal" / "Data Limite" / providência + `<BadgeConfianca>`.
- `_components/badge-confianca.tsx` (Server) — mapeia enum para classes (roxo/laranja/vermelho).

`page.tsx` passa `prazo` e `dadosExtraidos` ao drawer: altera o `select`/shape no Prisma fetch do detalhe para incluir `prazo` e `dadosExtraidos`, e a `PublicacaoParaFeed` ganha campos opcionais.

Extensão de `PublicacaoParaFeed` em `list.ts`:

```ts
export interface PublicacaoParaFeed {
  // ...
  dadosExtraidos: Prisma.JsonValue | null;
  prazo: null | {
    id: string;
    dataLimite: Date;
    diasPrazo: number;
    tipoContagem: 'UTEIS' | 'CORRIDOS';
    tipoProvidencia: TipoProvidencia;
  };
}
```

Mapper inclui `prazo`; `findMany` passa a `include: { processo: true, prazo: true }` para feed e detalhe.

### 2.12 Client calls

O drawer continua cliente. Após sucesso (status 200), chama `router.refresh()` para reler Server Component e renderizar o painel.

### 2.13 Testes

#### `src/__tests__/analise-ia/analise-ia.unit.test.ts`

- `sanitizarParaIA`:
  - mascara CPF formatado
  - mascara CNPJ formatado
  - mascara e-mail
  - mascara telefone `(85) 99999-9999`
  - **não** confunde número de processo com CPF/CNPJ nu
- `respostaIASchema`:
  - aceita payload válido
  - rejeita `prazo.dias = 0`
  - rejeita `areaDireito` fora do enum
  - aceita `confianca` numérica (0.98)
- `normalizarConfianca`:
  - `"ALTA" → ALTA`, `"media" → MEDIA` (case-insensitive), `0.95 → ALTA`, `0.7 → MEDIA`, `0.3 → BAIXA`, `"xyz" → BAIXA`
- `calcularDataLimite`:
  - CA-10 dias úteis puros (sexta + 15 UTEIS, sem feriados)
  - CA-11 pula feriado nacional (quinta + 5 UTEIS, feriado na terça seguinte)
  - CA-12 prorrogação se cair em fim de semana/feriado (5 CORRIDOS de quinta → terça quando segunda é feriado)
  - CA-13 CORRIDOS simples (sexta + 5 CORRIDOS = quarta)
- `calcularCustoBrl`:
  - usage zero → 0
  - valores realistas batem cálculo esperado

#### `src/__tests__/analise-ia/analise-ia.integration.test.ts`

Setup: cria mock de `prisma` (escritorio-aware), mock de `chamarClaudeAnalise` que devolve fixture. Testa o orquestrador `analisarPublicacao`.

Fixtures em `src/__tests__/analise-ia/fixtures/`:
- `resposta-valida.ts` — objeto + usage
- `resposta-json-invalido.ts` — string que não parse
- `resposta-schema-invalido.ts` — objeto com campos errados

Testes:
- CA-1: happy path cria Prazo, Processo, atualiza Publicacao, registra ConsumoIA
- CA-2: escritório errado → `NotFoundError`
- CA-3: publicação `ANALISADA` → `ConflictError`
- CA-4/5: orquestrador passa texto **sanitizado** ao chamarClaudeAnalise (spy no input)
- CA-6: JSON inválido → `AiParseError` + `ERRO` + ConsumoIA
- CA-7: schema inválido → `AiSchemaError` + `ERRO`
- CA-8: chamada Claude rejeita → `AiUnavailableError` + `ERRO`
- CA-9: confiança BAIXA → `ANALISADA` (não `PRAZO_CADASTRADO`); Prazo ainda criado
- CA-14: processo novo é criado
- CA-15: processo existente não é sobrescrito
- CA-21: ConsumoIA registra tokens (batendo valores da fixture)
- CA-22: concorrência (simula updateMany retornando count=0 na segunda chamada → 409)

#### UI tests (component)

Extensão de `src/__tests__/publicacoes/publicacoes.component.test.ts` **ou** novo `analise-ia.component.test.ts`:
- CA-16: drawer com `statusAnalise = PRAZO_CADASTRADO` renderiza painel com dias/data/providência
- CA-17: badge MEDIA tem classe laranja
- CA-18: badge BAIXA tem classe vermelha + texto "Requer revisão manual"
- CA-19: botão "Analisar com IA" some quando já analisada

**Decisão**: criar `analise-ia.component.test.ts` novo para manter o arquivo de 02 fechado. Total de 4 arquivos de teste na feature 03: unit, integration, component.

### 2.14 Anthropic SDK — integração real

`src/lib/claude.ts` (arquivo pedido no prompt) é o **singleton** que expõe `Anthropic` client e o wrapper `chamarClaudeAnalise`. Mas, para respeitar testabilidade, mantemos a função testável em `src/lib/analise-ia/claude.ts` recebendo `client` por DI, e `src/lib/claude.ts` só exporta:

```ts
import Anthropic from '@anthropic-ai/sdk';
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export { chamarClaudeAnalise } from './analise-ia/claude';
```

Usado pela rota; testes usam a função interna de `analise-ia/claude.ts` injetando mock.

## 3. Arquivos

### Criar

| Path | Propósito |
|---|---|
| `prisma/migrations/<ts>_add_consumo_ia/migration.sql` | Migration §2.8 |
| `src/lib/analise-ia/orchestrator.ts` | `analisarPublicacao` |
| `src/lib/analise-ia/claude.ts` | `chamarClaudeAnalise` (DI `client`) |
| `src/lib/analise-ia/sanitizar.ts` | `sanitizarParaIA` |
| `src/lib/analise-ia/schema.ts` | zod `respostaIASchema` + tipo |
| `src/lib/analise-ia/normalizar.ts` | `normalizarConfianca` e coerções |
| `src/lib/analise-ia/precos.ts` | Tabela preços + `calcularCustoBrl` |
| `src/lib/analise-ia/errors.ts` | `AiParseError`, `AiSchemaError`, `AiUnavailableError`, `NotFoundError`, `ConflictError` |
| `src/lib/prazos/calcular-prazo.ts` | Dias úteis + prorrogação |
| `src/lib/prazos/feriados.ts` | Helper de busca de feriados por janela |
| `src/lib/prazos/sanitizar.ts` | Reexporta `sanitizarParaIA` (alias solicitado pelo prompt do task) |
| `src/lib/prompts/analisar-publicacao.ts` | `SYSTEM_PROMPT` + `buildUserPrompt` |
| `src/lib/claude.ts` | Singleton Anthropic client + reexport wrapper |
| `src/app/(auth)/publicacoes/_components/painel-analise.tsx` | Painel "Análise Digital Jurist" |
| `src/app/(auth)/publicacoes/_components/badge-confianca.tsx` | Badge de confiança |
| `src/__tests__/analise-ia/analise-ia.unit.test.ts` | Testes puros |
| `src/__tests__/analise-ia/analise-ia.integration.test.ts` | Testes do orquestrador |
| `src/__tests__/analise-ia/analise-ia.component.test.ts` | Testes UI do painel/drawer |
| `src/__tests__/analise-ia/fixtures/respostas.ts` | Fixtures de resposta IA |

### Modificar

| Path | Motivo |
|---|---|
| `prisma/schema.prisma` | Novo model `ConsumoIA` + relations |
| `src/app/api/publicacoes/[id]/analisar/route.ts` | Substituir stub 501 pela rota real |
| `src/app/(auth)/publicacoes/_components/detalhe-drawer.tsx` | Renderizar painel/ajustar botão |
| `src/lib/publicacoes/list.ts` | `PublicacaoParaFeed` ganha `prazo` e `dadosExtraidos`; include `prazo` no findMany |
| `src/app/(auth)/publicacoes/page.tsx` | Shape do fetch do detalhe inclui `prazo` e `dadosExtraidos` |
| `.env.example` | `ANTHROPIC_API_KEY=` + `USD_BRL_RATE=5.0` |

### Remover

Nada.

## 4. Dependências

- Já instalada: `@anthropic-ai/sdk` ^0.90.0, `zod`, `@prisma/client`, `date-fns`.
- Nenhuma nova dependência.

## 5. Mapeamento CA → teste → arquivo

| CA | Teste | Arquivo |
|---|---|---|
| CA-1 | `integration › happy path persiste tudo` | `orchestrator.ts` |
| CA-2 | `integration › cross-tenant → NotFoundError` | `orchestrator.ts` |
| CA-3 | `integration › publicação já analisada → ConflictError` | `orchestrator.ts` |
| CA-4 | `integration › texto enviado à IA está sanitizado (CPF)` | `orchestrator.ts` + `sanitizar.ts` |
| CA-5 | `unit › sanitizar mascara CNPJ/email/telefone` | `sanitizar.ts` |
| CA-6 | `integration › JSON inválido → AiParseError + ERRO` | `orchestrator.ts` |
| CA-7 | `integration › schema inválido → AiSchemaError + ERRO` | `orchestrator.ts` + `schema.ts` |
| CA-8 | `integration › Claude rejeita → AiUnavailableError + ERRO` | `orchestrator.ts` |
| CA-9 | `integration › confiança BAIXA → ANALISADA + Prazo` | `orchestrator.ts` |
| CA-10 | `unit › calcularDataLimite 15 úteis sem feriados` | `calcular-prazo.ts` |
| CA-11 | `unit › calcularDataLimite pula feriado nacional` | `calcular-prazo.ts` |
| CA-12 | `unit › prorrogação em fim de semana/feriado` | `calcular-prazo.ts` |
| CA-13 | `unit › CORRIDOS conta dias corridos` | `calcular-prazo.ts` |
| CA-14 | `integration › cria Processo novo quando não existe` | `orchestrator.ts` |
| CA-15 | `integration › não sobrescreve Processo existente` | `orchestrator.ts` |
| CA-16 | `component › painel com dados de análise` | `painel-analise.tsx` |
| CA-17 | `component › badge MEDIA laranja` | `badge-confianca.tsx` |
| CA-18 | `component › badge BAIXA vermelho + revisão` | `badge-confianca.tsx` |
| CA-19 | `component › botão Analisar some quando ANALISADA` | `detalhe-drawer.tsx` |
| CA-20 | `component › estado ERRO renderiza aviso` | `detalhe-drawer.tsx` |
| CA-21 | `integration › ConsumoIA registra tokens` | `orchestrator.ts` |
| CA-22 | `integration › concorrência → 409 na segunda` | `orchestrator.ts` |

## 6. Ordem de implementação (green)

1. Schema Prisma + migration `ConsumoIA` (ainda sem rodar).
2. `errors.ts`, `sanitizar.ts`, `normalizar.ts`, `precos.ts`, `schema.ts` — módulos puros.
3. `prazos/calcular-prazo.ts` + `prazos/feriados.ts`.
4. `prompts/analisar-publicacao.ts`.
5. `analise-ia/claude.ts` (wrapper com DI).
6. `analise-ia/orchestrator.ts` — usa todos os blocos acima.
7. Rodar `npm test` — unit + integration passam.
8. `_components/painel-analise.tsx` + `badge-confianca.tsx`.
9. Atualizar `detalhe-drawer.tsx`, `list.ts`, `page.tsx`.
10. Rodar testes de component.
11. Substituir stub em `app/api/publicacoes/[id]/analisar/route.ts` pela rota real; adicionar `src/lib/claude.ts` singleton.
12. `npx prisma generate`, `npm run typecheck`, `npm run lint`.
13. (deploy/dev: `npx prisma migrate dev --name add_consumo_ia` fora da pipeline de testes).

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Claude retorna texto em vez de JSON (comportamento ocasional) | System prompt reforça "apenas JSON"; `JSON.parse` em try/catch + AiParseError; tests com fixture de texto cru |
| `$transaction` + chamada HTTP externa estourar timeout DB | Chamada IA **fora** da tx; tx só agrupa writes |
| Cache ephemeral reinicia a cada edit no system → custo sobe | Prompt fixo em `const` em módulo separado; PRs que editam o prompt precisam ser conscientes |
| Regex de sanitização mascarar demais (ex.: CPF capturando número de processo) | Unit test dedicado com texto de publicação real (fixture); regex de 11-dígitos só com label "CPF" |
| Timezone em `calcularDataLimite` | Trabalhar em UTC meia-noite consistentemente; helper `normalizarDia(d)` zera horas |
| Feriados estaduais/municipais mal configurados | Plan 03 não popula `Feriado` — fica para sysadmin; unit test usa feriados fake injetados |
| `ConsumoIA.publicacaoId` FK aponta para publicação que pode ser deletada no futuro | `onDelete: SetNull` na FK |
| Mock do Anthropic SDK em jsdom quebrar | `claude.ts` isola SDK; orquestrador recebe função por DI; zero import do SDK nos testes |
| `AbortController` + Next 15 → rota pode não conseguir abortar a chamada SDK no tempo | `timeout: 30_000` no client basta para MVP |

## 8. Rollback

- Feature 100% nova em diretórios novos (`analise-ia/`, `prazos/`, `prompts/`). Migração adiciona tabela → `DROP TABLE "ConsumoIA"` reverte.
- Rota stubada volta a 501 com `git revert` do commit da feature (rota antiga fica preservada no histórico).
- Drawer: mudanças em `detalhe-drawer.tsx` são render condicional; `git revert` limpa sem quebrar o render do feed.
- Feature flag: desnecessário neste slice — o botão "Analisar" já existia e volta a ser stub em rollback. UX não mente para o usuário.

## 9. Itens abertos para slices futuros

1. Feature 04: `Gerar Peça Completa` (Sonnet 4.6) usando `dadosExtraidos`.
2. Fila BullMQ para análise assíncrona + polling/SSE na UI.
3. Cron `recuperar-analises-travadas`: `EM_ANALISE` há > 5 min volta a `NOVA`.
4. Rate-limit de análise por escritório (cota mensal).
5. "Regenerar análise" (requer transição `ANALISADA → NOVA`).
6. Cache de resposta por hash do texto sanitizado (dedup agressiva).
7. Extração de trechos citados do texto para highlight na UI (como no design com `bg-primary/10`).
8. Painel de custo em `/settings` lendo `ConsumoIA` agregado.
9. Integração com Feriado CNJ via API oficial.
10. Suporte a análise de múltiplos prazos na mesma publicação (ex.: intimação dupla).
