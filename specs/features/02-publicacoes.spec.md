# Spec 02 — Publicações (upload manual + feed)

**Status**: draft
**Owner**: dev full-stack
**Depende de**: `01-auth.spec.md` (sessão carrega `escritorioId`), schema Prisma atual (`Publicacao`, `Processo`, `Escritorio`), `DESIGN.md`, HTML de referência `docs/designs/publicacoes.html`

## 1. Objetivo

Permitir que advogados e paralegais de um escritório tragam publicações do DJe para dentro do Placitum — colando texto bruto **ou** subindo o PDF da intimação — e visualizem todas as publicações captadas num feed com filtros, busca e status. Clicar numa publicação abre um drawer lateral com o texto integral e um botão "Analisar com IA" que apenas dispara a feature 03 (análise de prazo fica fora deste escopo).

## 2. Motivação

- No MVP, a captação automática do DJe ainda não está pronta. Upload manual destrava o fluxo de ponta a ponta: entrar → jogar publicação no sistema → ver na lista.
- O feed é a **porta de entrada operacional** do escritório: advogado abre o Placitum e quer ver o que caiu hoje, com status e filtro.
- O drawer lateral (texto integral + "Analisar com IA") é o ponto de conexão com a feature 03 (classificação de prazo com Haiku 4.5).
- Separar upload + listagem desta spec da análise com IA (spec 03) mantém cada spec pequena e testável.

## 3. Escopo

### No escopo

- Upload de publicação via **textarea** (texto colado) — Server Action com `zod`.
- Upload de publicação via **PDF** — API route que extrai texto do PDF e persiste.
- Persistência em `Publicacao` com `statusAnalise = NOVA` e `escritorioId` do usuário logado.
- Feed/tabela listando todas as publicações **do escritório** (multi-tenant).
- Filtros por: `status`, `tribunal` (derivado do campo `fonte`), `período` (data de publicação), `advogado` (via `prazo.advResponsavel` quando houver; publicações sem prazo aparecem em "Sem responsável").
- Busca por **número de processo** ou **nome da parte**.
- Paginação fixa em **20 itens por página**.
- Drawer lateral (client component) ao clicar na linha: texto integral + metadados + botão **"Analisar com IA"** que apenas dispara (trigger). A análise é feature 03.
- Badge de status com cores do design (`NOVA`, `EM_ANALISE`, `ANALISADA`, `PRAZO_CADASTRADO`, `PECA_GERADA`, `ERRO`).
- Headline gigante ("Publicações"), filtros em `surface-container-low`, tabela com ghost borders, ações com `opacity-0 group-hover:opacity-100` — exatamente como em `docs/designs/publicacoes.html`.

### Fora do escopo (post-MVP / outra spec)

- **Análise real com IA** (classificação de prazo, confiança, extração de partes/processo) — spec 03.
- Edição ou exclusão de publicação já cadastrada.
- Captação automática do DJe (scraping/API oficial).
- Associação manual de uma publicação a um `Processo` existente (por enquanto `processoId = null` em upload manual).
- Exportar CSV (botão de referência no HTML fica inerte ou oculto nesta iteração).
- Insight flutuante ("Insight Placitum") — fica para o slice de IA.
- Upload em lote (múltiplos PDFs).
- OCR em PDFs imagem (só PDFs com camada de texto extraível).
- Anexo do PDF original em storage (S3/R2) — hoje salvamos apenas o texto extraído; arquivo bruto não é persistido.

## 4. Regras de negócio

RN-1. **Multi-tenant (constitution §3.4)**: toda query de leitura e escrita de `Publicacao` filtra por `escritorioId` da sessão. Não existe leitura cross-tenant. Upload grava `escritorioId` do usuário logado; o cliente **não** pode enviá-lo.

RN-2. **Texto mínimo**: `textoIntegral` precisa ter no mínimo **50 caracteres** após `trim`. Abaixo disso, rejeitar com 400 e mensagem `"O texto da publicação precisa ter ao menos 50 caracteres."`.

RN-3. **Tamanho do PDF**: arquivo PDF limitado a **5 MB** (5 × 1024 × 1024 bytes). Acima, rejeitar com 400 e mensagem `"O arquivo excede o limite de 5MB."`. O tamanho é verificado no servidor — nunca confiar no cliente.

RN-4. **Tipo do PDF**: apenas `application/pdf`. Outros MIME types rejeitam com 400 e mensagem `"Apenas arquivos PDF são aceitos."`.

RN-5. **Data de publicação obrigatória**: `dataPublicacao` é input obrigatório. Aceitar ISO `YYYY-MM-DD`. Se vazio, rejeitar com 400 e mensagem `"Informe a data de publicação."`. Não pode ser data futura (`> hoje`) — rejeita 400 com mensagem `"Data de publicação não pode ser futura."`.

RN-6. **Fonte obrigatória**: `fonte` é string obrigatória, 3 a 50 caracteres após `trim`. Exemplos: `"DJe-TJCE"`, `"DJe-TJSP"`, `"upload-manual"`. Em upload por PDF, se o usuário não informar, o default é `"upload-manual"`.

RN-7. **Status inicial**: toda publicação criada manualmente tem `statusAnalise = NOVA`. Transições para `EM_ANALISE`, `ANALISADA` etc. são disparadas por outras features (03 em diante). Esta feature **não** transiciona status.

RN-8. **Confiança IA inicial**: `confiancaIA` começa `null` em upload manual. Preenchida pela feature 03.

RN-9. **Paginação**: 20 itens por página, ordenados por `dataPublicacao DESC`, depois `createdAt DESC` como desempate determinístico. `page` começa em 1. Fora do range → lista vazia + `total` correto (não 404).

RN-10. **Busca**: `q` pesquisa em `processo.numeroProcesso` e `processo.parteCliente` (quando a publicação tem processo vinculado). Busca `ILIKE %q%` case-insensitive, mínimo 3 caracteres — strings menores são ignoradas (retorna listagem normal). Publicações sem `processo` nunca casam com `q`.

RN-11. **Filtros combináveis**: `status`, `tribunal`, `periodo`, `advogado`, `q` combinam em `AND`. Ausência de um filtro = sem restrição naquele eixo.

RN-12. **Tribunal derivado**: nesta iteração, "tribunal" é inferido do prefixo de `fonte` depois do hífen — `"DJe-TJCE"` → `"TJCE"`, `"DJe-TJSP"` → `"TJSP"`. `"upload-manual"` → tribunal `"—"`. Regra testada em unit test para não regredir.

RN-13. **Autorização**: qualquer usuário autenticado do escritório pode criar e listar publicações (papéis `ADMIN`, `ADVOGADO`, `ESTAGIARIO`). Este feature não tem gate de papel.

RN-14. **Segurança de conteúdo**: texto integral pode conter PII — logs **nunca** imprimem `textoIntegral`. Em caso de erro de upload, log registra apenas `{ userId, escritorioId, tamanhoBytes, tipoEntrada: "texto" | "pdf" }`. (Constitution §3.9.)

RN-15. **Idempotência básica**: mesmo texto + mesma data + mesmo escritório + mesma fonte no mesmo dia **é permitido** (não deduplicamos nesta iteração — o usuário verá duplicata na lista). Deduplicação real depende de hash de conteúdo, fica no slice de captação automática.

## 5. Requisitos não-funcionais

- Latência de `POST /api/publicacoes` (texto): p95 < 250ms excluindo DB.
- Latência de `POST /api/publicacoes/upload` (PDF 1 MB): p95 < 2s no servidor.
- `GET /api/publicacoes` com 10k publicações e filtros combinados: p95 < 400ms (índices em `escritorioId`, `dataPublicacao`, `statusAnalise` — ver plan).
- Nenhum log contém `textoIntegral` ou nome de parte.
- Upload PDF usa `Content-Type: multipart/form-data`. `URLSearchParams` / JSON não é suportado na rota de upload.

## 6. Critérios de aceite (Given / When / Then)

### CA-1. Upload por texto — sucesso

**Given** Ana autenticada em `Escritório X` (id `esc-x`)
**And** payload `{ textoIntegral: "...50+ chars...", fonte: "DJe-TJCE", dataPublicacao: "2026-04-10" }`
**When** Ana faz `POST /api/publicacoes`
**Then** retorna 201 com `{ id, statusAnalise: "NOVA", escritorioId: "esc-x" }`
**And** a publicação foi persistida com `escritorioId = "esc-x"`, `statusAnalise = NOVA`, `confiancaIA = null`, `processoId = null`
**And** `textoIntegral` **não** aparece em nenhum log

### CA-2. Upload por texto — texto curto

**Given** payload com `textoIntegral` de 10 caracteres
**When** Ana faz `POST /api/publicacoes`
**Then** retorna 400 com `{ error: "VALIDATION_ERROR", message: "O texto da publicação precisa ter ao menos 50 caracteres." }`
**And** nada é persistido

### CA-3. Upload por texto — fonte faltando

**Given** payload sem `fonte`
**When** faz `POST /api/publicacoes`
**Then** retorna 400 `"A fonte é obrigatória."`

### CA-4. Upload por texto — data faltando ou futura

**Given** `dataPublicacao` ausente
**When** faz `POST /api/publicacoes`
**Then** retorna 400 `"Informe a data de publicação."`

**And** dado `dataPublicacao` = amanhã
**Then** retorna 400 `"Data de publicação não pode ser futura."`

### CA-5. Upload por PDF — sucesso

**Given** Ana autenticada
**And** arquivo `intimacao.pdf`, `application/pdf`, 1.2 MB, com texto extraível contendo 200 caracteres
**And** `dataPublicacao = "2026-04-10"`, `fonte = "DJe-TJSP"`
**When** Ana faz `POST /api/publicacoes/upload` com `multipart/form-data`
**Then** extrai o texto do PDF, persiste `Publicacao` com `textoIntegral` igual ao texto extraído, `statusAnalise = NOVA`, `escritorioId` da sessão
**And** retorna 201 com `{ id, statusAnalise: "NOVA" }`

### CA-6. Upload por PDF — arquivo grande demais

**Given** arquivo PDF de 6 MB
**When** faz `POST /api/publicacoes/upload`
**Then** retorna 400 `"O arquivo excede o limite de 5MB."`
**And** nada é persistido

### CA-7. Upload por PDF — tipo errado

**Given** arquivo `.docx` com MIME `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
**When** faz `POST /api/publicacoes/upload`
**Then** retorna 400 `"Apenas arquivos PDF são aceitos."`

### CA-8. Upload por PDF — texto extraído muito curto

**Given** PDF que extrai apenas 20 caracteres (ex.: só cabeçalho)
**When** faz `POST /api/publicacoes/upload`
**Then** retorna 400 `"O texto da publicação precisa ter ao menos 50 caracteres."`

### CA-9. Listagem — isolamento multi-tenant

**Given** banco com 5 publicações de `esc-a` e 3 publicações de `esc-b`
**And** Ana autenticada em `esc-a`
**When** Ana faz `GET /api/publicacoes`
**Then** o JSON de resposta contém **apenas** as 5 publicações de `esc-a`
**And** `total = 5`

### CA-10. Listagem — paginação

**Given** 45 publicações de `esc-a`
**When** Ana faz `GET /api/publicacoes?page=2`
**Then** retorna os itens 21–40 (20 itens)
**And** `page = 2`, `pageSize = 20`, `total = 45`, `totalPages = 3`

### CA-11. Listagem — ordenação estável

**Given** duas publicações com a mesma `dataPublicacao`, criadas em momentos diferentes
**When** Ana lista
**Then** a mais recente por `createdAt` aparece primeiro (desempate determinístico)

### CA-12. Listagem — filtro por status

**Given** publicações com statuses misturados (`NOVA`, `ANALISADA`, `PRAZO_CADASTRADO`)
**When** Ana faz `GET /api/publicacoes?status=NOVA`
**Then** retorna apenas as com `statusAnalise = NOVA`

### CA-13. Listagem — filtro por tribunal

**Given** publicações com `fonte` `"DJe-TJCE"`, `"DJe-TJSP"`, `"upload-manual"`
**When** Ana faz `GET /api/publicacoes?tribunal=TJCE`
**Then** retorna apenas as cuja `fonte` começa com `"DJe-TJCE"`

### CA-14. Listagem — filtro por período

**Given** publicações em `2026-03-01`, `2026-04-01`, `2026-04-15`
**When** Ana faz `GET /api/publicacoes?de=2026-04-01&ate=2026-04-30`
**Then** retorna apenas as duas de abril

### CA-15. Listagem — busca por número de processo

**Given** publicação vinculada a processo `"0001234-56.2024.8.26.0100"`
**And** outra publicação sem processo
**When** Ana faz `GET /api/publicacoes?q=0001234`
**Then** retorna apenas a vinculada

### CA-16. Listagem — busca por parte

**Given** processo com `parteCliente = "Construtora Mar Azul Ltda."`
**When** Ana faz `GET /api/publicacoes?q=mar%20azul`
**Then** retorna publicações daquele processo (ILIKE case-insensitive)

### CA-17. Listagem — busca curta é ignorada

**Given** `q=ab` (2 caracteres)
**When** Ana lista
**Then** retorna a listagem normal (q ignorado, nenhum erro)

### CA-18. UI — feed renderiza headline e filtros

**Given** a página `/publicacoes` com 3 publicações
**When** a página renderiza
**Then** exibe `<h1>Publicações</h1>` em tipografia headline
**And** exibe os selects de filtro: Tribunal, Status, Advogado, Período
**And** exibe a tabela com colunas **Data, Tribunal, Processo, Parte, Status, Ações**
**And** cada linha tem um badge de status com a cor correspondente

### CA-19. UI — drawer de detalhe

**Given** a lista renderizada com uma publicação
**When** o usuário clica na linha
**Then** abre um drawer lateral com `textoIntegral` completo, `fonte`, `dataPublicacao` e botão "Analisar com IA"
**And** clicar fora do drawer ou em "Fechar" o oculta

### CA-20. UI — formulário de upload

**Given** a página `/publicacoes/nova`
**When** carrega
**Then** exibe um formulário com:
  - textarea para texto colado,
  - input file (PDF),
  - input de data de publicação,
  - input de fonte,
  - botão "Enviar publicação"
**And** enviar com textarea vazia + sem arquivo mostra validação `"Cole o texto ou envie um PDF."`
**And** enviar com texto < 50 chars mostra `"O texto da publicação precisa ter ao menos 50 caracteres."`

### CA-21. UI — tabela vazia

**Given** escritório sem publicações
**When** carrega `/publicacoes`
**Then** exibe estado vazio `"Nenhuma publicação ainda. Comece enviando uma."` com link para `/publicacoes/nova`

## 7. Edge cases

- Texto com `\r\n` do Windows → normalizar para `\n` antes de contar 50 caracteres? **Não**. Contamos tamanho após `trim`, sem normalizar line endings. Suficiente para MVP.
- Usuário envia **texto + arquivo** ao mesmo tempo na rota de texto → rota `/api/publicacoes` aceita só texto; rota `/api/publicacoes/upload` aceita só PDF. Cada rota ignora o outro canal.
- PDF criptografado (senha) → `pdf-parse` lança. Capturamos e retornamos 400 `"Não foi possível extrair texto deste PDF. Ele pode estar protegido ou ser apenas imagem."`.
- PDF puro imagem (zero texto extraível) → cai em CA-8 (texto < 50 chars).
- `page` negativa ou zero → clamp para 1.
- `page` string não numérica → 400 `"Parâmetro page inválido."`.
- `status` com valor fora do enum → 400 `"Status inválido."`.
- `periodo` com `ate < de` → 400 `"Período inválido."`.
- Um usuário ataca enviando `escritorioId` no body do POST → **ignorar** o campo; `escritorioId` sempre vem da sessão.
- Texto com caracteres especiais/unicode (π, ≠, emojis) → aceitar; `textoIntegral` é `String` no Prisma (Postgres `text`), cabe sem problema.
- Data em fuso diferente → backend só aceita `YYYY-MM-DD` (string), converte com `new Date(iso + "T12:00:00Z")` para evitar deslize de dia por timezone do servidor. Testado em unit.
- Usuário sem sessão chama a API → 401 (coberto pelo middleware global + auth() na rota).
- Processo não existe mas `processoId` foi passado → nesta iteração não aceitamos `processoId` no body (sempre null). Item aberto para spec futura.

## 8. Dados / schema (referência, detalhes no plan)

- Acréscimo obrigatório: coluna `escritorioId String` em `Publicacao` + `@relation` com `Escritorio` + índice composto `@@index([escritorioId, dataPublicacao])`.
- Usamos `Publicacao.fonte` existente para derivar o tribunal. Sem coluna nova de `tribunal` por enquanto.
- Campos já cobertos pelo schema: `textoIntegral`, `fonte`, `dataPublicacao`, `dataCaptacao`, `statusAnalise`, `confiancaIA`, `dadosExtraidos`, `processoId` (null no MVP).
- Sem tabela de log nova nesta feature (logs estruturados via `console` respeitando RN-14).

## 9. Métricas de sucesso

- 100% dos uploads de texto válidos criam `Publicacao` com `escritorioId` correto.
- Zero publicações de outro escritório aparecendo em `/api/publicacoes` em auditoria manual.
- Tempo de upload de PDF 1 MB < 3s no 95º percentil (p95) após warmup.
- Feed abre em < 1s para um escritório com 1k publicações.

## 10. Aberto / a decidir no plan

- Biblioteca de extração de texto de PDF: `pdf-parse` vs `pdfjs-dist` — decisão no plan (estamos sob Node 22 + Next 15 edge/node).
- Se o drawer é Server-rendered com `useRouter` + query param (`?publicacao=id`) ou puramente client state — decidir no plan, com preferência por query param para deep-link.
- Onde viver a migration (nome, campos nulos vs default) — plan.
- Inclusão de índice GIN para busca full-text futura (`pg_trgm`) — fora do escopo; decidir apenas se perf exigir.
- Rate-limit em `/api/publicacoes/upload` para evitar abuso (subir PDFs de 5 MB em loop) — tratar em spec de infra junto com rate-limit de magic link.
