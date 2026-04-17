# Spec 03 — Análise de publicação com IA (Claude Haiku 4.5)

**Status**: draft
**Owner**: dev full-stack
**Depende de**: `01-auth.spec.md` (sessão com `escritorioId`), `02-publicacoes.spec.md` (publicação já existe no banco com `statusAnalise = NOVA`), `constitution.md` §4, `DESIGN.md`, HTML de referência `docs/designs/detalhe-publicacao.html` (coluna central "Análise Digital Jurist")

## 1. Objetivo

Quando o advogado clica **"Analisar com IA"** em uma publicação do feed (spec 02), o Placitum envia o texto integral **sanitizado** a Claude Haiku 4.5, recebe uma análise estruturada (número do processo, vara, comarca, tipo de decisão, resumo, partes, prazo, urgência, confiança), valida essa resposta, calcula a data limite do prazo em dias úteis (considerando feriados) e cria automaticamente um registro `Prazo` vinculado à publicação. A análise passa a ser exibida na tela de detalhe, com badge de confiança e CTA para gerar peça.

## 2. Motivação

- O gargalo de um escritório massificado é **ler publicação e fichar prazo**. Automatizar essa etapa libera advogado para o trabalho intelectual (redigir peça, estratégia).
- Haiku 4.5 é barato e rápido o suficiente para rodar em todo upload sem custo explosivo (~R$ 0,01–0,02 por publicação a preços de referência).
- Extrair dados estruturados + criar `Prazo` numa única operação materializa o valor: o advogado abre a agenda e o compromisso já está lá.
- Confiança da IA visível ao usuário sustenta human-in-the-loop (constitution §4.6): alta confiança → pode protocolar rápido; baixa → revisão manual obrigatória.

## 3. Escopo

### No escopo

- Endpoint `POST /api/publicacoes/[id]/analisar` que substitui o stub 501 da spec 02.
- Chamada a Claude Haiku 4.5 via `@anthropic-ai/sdk` com **prompt caching** no `system` (`cache_control: { type: 'ephemeral' }`).
- **Sanitização** do texto da publicação antes de enviar: remoção de CPF (padrão `XXX.XXX.XXX-XX` ou 11 dígitos), CNPJ (`XX.XXX.XXX/XXXX-XX` ou 14 dígitos), e-mails e telefones (formatos BR) — substituídos por tokens fixos `[CPF]`, `[CNPJ]`, `[EMAIL]`, `[TELEFONE]`.
- Validação **zod** da resposta JSON do modelo.
- Persistência:
  - Atualizar `Publicacao` com `statusAnalise = ANALISADA`, `confiancaIA` e `dadosExtraidos` (JSON).
  - Criar `Prazo` com `dataLimite` calculada + `tipoProvidencia` + `diasPrazo` + `tipoContagem`.
  - Se IA retornou `numeroProcesso` e este ainda não existe para o escritório, criar `Processo` automaticamente e vincular à publicação.
- **Cálculo de dias úteis**: `calcularDataLimite(dataInicio, dias, contagem, feriados)` pula sábados, domingos e feriados (tabela `Feriado`) quando `contagem = UTEIS`.
- **Prorrogação**: se a data final cai em fim de semana ou feriado, prorroga para o próximo dia útil (vale para `UTEIS` e `CORRIDOS`).
- **Registro de consumo de tokens** (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) em tabela nova `ConsumoIA` para controle de custo (RN-5 abaixo).
- **Exibição na UI do drawer** (`detalhe-drawer.tsx`): quando `statusAnalise = ANALISADA`, renderizar painel "Análise Digital Jurist" com prazo legal, data limite, providência sugerida, partes, badge de confiança.
- **Cor do badge de confiança**: `ALTA` → tertiary (roxo) do design; `MEDIA` → laranja de atenção; `BAIXA` → vermelho `error`.
- **Estado de carregamento** otimista: ao clicar "Analisar", drawer mostra `statusAnalise = EM_ANALISE` enquanto a chamada acontece.
- **Fail-safe**: se a Claude API falhar ou retornar JSON inválido, transicionar a publicação para `statusAnalise = ERRO`, registrar mensagem e **não** criar `Prazo`.

### Fora do escopo (post-MVP / outra spec)

- **Geração de peça** (contestação, recurso etc.) — é o botão "Gerar Peça Completa" do design, mas vira feature 04 com Sonnet 4.6.
- **Re-análise** (botão "Regenerar" ou mudar confiança manualmente). Uma publicação só é analisada uma vez neste slice — `ANALISADA` é terminal até feature 04.
- **Fila assíncrona (BullMQ)** — nesta iteração a chamada é **síncrona** na rota (timeout Next 15 permite; Haiku é rápido). Assíncrono fica para quando o volume exigir (item aberto §10).
- **Análise em lote** de publicações `NOVA` existentes no banco.
- **Ajuste manual** do prazo/providência proposto pela IA (edit inline). Vive na feature da agenda.
- **Notificação** por e-mail após criação do prazo — vive em outra feature.
- **Cache por hash do texto** (mesma publicação analisada 2×) — não reanalisamos, então não precisa.
- **Suporte a múltiplos idiomas** — só PT-BR.
- **Análise de PDF bruto** — operamos sobre `textoIntegral` já persistido.

## 4. Regras de negócio

RN-1. **Autorização (constitution §3.4)**: só pode analisar publicação do próprio escritório. Tentativa cross-tenant retorna 404 (não 403 — não revelar que o id existe). Rota consulta `findFirst({ where: { id, escritorioId } })` antes de qualquer trabalho.

RN-2. **Papel suficiente**: `ADMIN`, `ADVOGADO`, `ESTAGIARIO` podem disparar análise. Sem gate adicional de papel nesta feature.

RN-3. **Idempotência de status**: só analisa publicações em `statusAnalise = NOVA`. Se já está `EM_ANALISE`, `ANALISADA`, `PRAZO_CADASTRADO`, `PECA_GERADA` ou `ERRO`, a rota retorna **409** com `{ error: "CONFLICT", message: "Publicação já analisada ou em análise." }` — evita chamadas duplicadas e consumo de IA desnecessário.

RN-4. **Sanitização obrigatória (constitution §4.2)**: antes de montar o user prompt, o texto passa por `sanitizarParaIA(textoIntegral)` que substitui:
  - CPF formatado `^\d{3}\.\d{3}\.\d{3}-\d{2}$` e 11 dígitos consecutivos em contexto de pessoa física → `[CPF]`
  - CNPJ formatado e 14 dígitos consecutivos → `[CNPJ]`
  - E-mails (regex RFC-lite) → `[EMAIL]`
  - Telefones BR (`(DDD) XXXXX-XXXX`, `DDD+9 dígitos`) → `[TELEFONE]`
  
  **Nome das partes NÃO é sanitizado** (precisa para análise). Endereço residencial idealmente também seria sanitizado, mas no MVP raramente aparece em publicação; item aberto.
  
  A publicação **no banco** permanece com o texto original — sanitização acontece apenas na memória, só para a chamada da IA.

RN-5. **Prompt caching (constitution §4.1)**: bloco `system` sempre com `cache_control: { type: 'ephemeral' }`. System prompt fixo (ver §8) — muda apenas quando conscientemente editado; o cache é quente entre requests da mesma pod/janela de 5 min.

RN-6. **Registro de tokens (constitution §4.3)**: toda chamada cria um registro em `ConsumoIA` com:
  - `escritorioId`, `publicacaoId`, `modelo = "claude-haiku-4-5-20251001"`
  - `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens`
  - `custoEstimadoBrl` calculado a partir de tabela de preços em `src/lib/claude/precos.ts` (Haiku input/output por 1M tokens × cotação fixa para MVP)
  - `createdAt`
  - Registro é gravado **mesmo se a análise falhar** (response JSON inválido conta igual).

RN-7. **Validação da resposta (constitution §4.4)**: output é `JSON.parse` dentro de `try/catch`. Em seguida, `respostaIASchema.safeParse(obj)`. Falha em qualquer etapa → marcar publicação como `ERRO`, não criar `Prazo`, responder 502 `{ error: "AI_PARSE_ERROR", message: "Resposta da IA não pôde ser interpretada." }`.

RN-8. **Confiança**: enum `NivelConfianca` em {`ALTA`, `MEDIA`, `BAIXA`}. Haiku retorna string — convertida/normalizada. Qualquer valor fora vira `BAIXA`.

RN-9. **Dias úteis**:
  - Fim de semana sempre excluído (sábado e domingo).
  - `Feriado` consultado por `data` em range `[dataInicio, dataInicio + 2 × dias]` (margem de segurança).
  - Feriados de âmbito `NACIONAL` sempre contam; `ESTADUAL` conta se `estado` bater com o estado do escritório; `MUNICIPAL` conta se `comarca` bater com a comarca do processo. Quando não dá pra determinar estado/comarca (upload manual sem processo), aplica só `NACIONAL`.
  - Contagem começa **no primeiro dia útil após** a `dataPublicacao` (regra clássica do CPC). Ex.: publicado sexta, prazo começa a contar segunda.

RN-10. **Prorrogação**: a `dataLimite` **nunca** cai em sábado, domingo ou feriado. Prorroga-se para o próximo dia útil. Aplica-se a ambos `UTEIS` e `CORRIDOS`.

RN-11. **Criação de `Processo`**: se a IA extraiu `numeroProcesso` e não existe `Processo` com `(escritorioId, numeroProcesso)`, criamos um novo com os campos disponíveis (`vara`, `comarca`, `areaDireito` inferida ou `OUTRO`, `parteCliente` da resposta). Se já existe, vinculamos a publicação ao existente e **não** sobrescrevemos campos.

RN-12. **`areaDireito`**: Haiku é instruído a retornar uma das opções do enum `AreaDireito`. Valor inválido/ausente → `OUTRO`.

RN-13. **`tipoProvidencia`**: Haiku retorna uma das opções de `TipoProvidencia`. Valor inválido → `OUTRO` + log de alerta.

RN-14. **Transação**: a escrita (update `Publicacao` + create `Processo` opcional + create `Prazo` + create `ConsumoIA`) acontece dentro de `prisma.$transaction`. Se qualquer passo falhar, rollback total; publicação permanece em `NOVA` para nova tentativa. (Exceção: `ConsumoIA` pode ir fora da transação se decidirmos registrar mesmo em falha — ver plan.)

RN-15. **Sem PII em logs (constitution §3.9)**: logs **nunca** imprimem `textoIntegral` nem resposta da IA crua. Em erro, loga-se `{ publicacaoId, escritorioId, etapa, tipoErro, preview?: first-60-chars-sanitized }`.

RN-16. **Timeout**: chamada Anthropic SDK com `timeout: 30_000` ms. Além disso, `AbortController` se o cliente abortar a conexão da rota Next.

RN-17. **Idempotência operacional**: se duas requests simultâneas tentam analisar o mesmo id, apenas a primeira transiciona de `NOVA` para `EM_ANALISE` (guard via `updateMany` com `where.statusAnalise: 'NOVA'` + checagem de `count`). A segunda recebe 409.

RN-18. **Custo máximo por chamada**: se `inputTokens + outputTokens > 20_000`, registrar em log estruturado (`warn`) para auditoria. Não bloqueia — Haiku cobra barato e publicação grande é raridade.

## 5. Requisitos não-funcionais

- Latência p95 de `POST /api/publicacoes/[id]/analisar`: < 6s no feliz (Haiku + DB). p99 < 12s.
- Disponibilidade: tolera API Anthropic cair — publicação vai para `ERRO`, sem crash.
- Nenhum log contém `textoIntegral`, nome de parte, ou resposta bruta da IA.
- Custo unitário p95: < R$ 0,05 por análise.
- Prompt caching deve atingir ≥ 80% cache hit em sessões quentes (≥ 2 análises na mesma pod em < 5 min).

## 6. Critérios de aceite (Given / When / Then)

### CA-1. Análise feliz — status, dados e prazo

**Given** Ana autenticada em `esc-a`
**And** publicação `pub-1` em `esc-a` com `statusAnalise = NOVA`, texto contendo "prazo de 15 dias para contestar" e número de processo "0001234-56.2024.8.26.0100"
**And** Claude Haiku respondendo JSON válido com `confianca: "ALTA"`, `numeroProcesso: "0001234-56.2024.8.26.0100"`, `tipoDecisao: "CITACAO"`, `prazoDias: 15`, `tipoContagem: "UTEIS"`, `providencia: "CONTESTACAO"`, `areaDireito: "CIVEL"`, `parteCliente: "Empresa X"`
**When** Ana faz `POST /api/publicacoes/pub-1/analisar`
**Then** retorna `200` com `{ publicacaoId, statusAnalise: "PRAZO_CADASTRADO", confianca: "ALTA", prazoId, dataLimite: "<ISO>" }`
**And** `Publicacao.statusAnalise = PRAZO_CADASTRADO`, `confiancaIA = ALTA`, `dadosExtraidos` é JSON com os campos extraídos
**And** existe um `Prazo` com `tipoProvidencia = CONTESTACAO`, `diasPrazo = 15`, `tipoContagem = UTEIS`, `publicacaoId = pub-1`
**And** `Processo` foi criado com `numeroProcesso = "0001234-56.2024.8.26.0100"` + `escritorioId = esc-a` + `areaDireito = CIVEL`
**And** `Publicacao.processoId` aponta para o processo criado
**And** existe 1 registro `ConsumoIA` com `modelo = "claude-haiku-4-5-20251001"`, `publicacaoId = pub-1`, `inputTokens > 0`, `outputTokens > 0`

### CA-2. Isolamento multi-tenant

**Given** publicação `pub-b` pertence a `esc-b`
**And** Ana autenticada em `esc-a`
**When** Ana faz `POST /api/publicacoes/pub-b/analisar`
**Then** retorna `404 { error: "NOT_FOUND", message: "Publicação não encontrada." }`
**And** **nenhuma** chamada é feita à Claude API
**And** nenhum `Prazo` é criado

### CA-3. Publicação já analisada — 409

**Given** publicação `pub-1` com `statusAnalise = ANALISADA`
**When** Ana chama a rota
**Then** retorna `409 { error: "CONFLICT", message: "Publicação já analisada ou em análise." }`
**And** nenhuma chamada à IA é feita
**And** nenhum novo `Prazo` é criado

### CA-4. Sanitização de CPF antes de enviar à IA

**Given** publicação com `textoIntegral` contendo "Fulano da Silva, CPF 123.456.789-00, foi intimado"
**When** a rota é chamada
**Then** o prompt enviado à Claude contém "Fulano da Silva, CPF [CPF], foi intimado"
**And** em momento algum o CPF literal aparece no `messages` enviado ao SDK
**And** `Publicacao.textoIntegral` no banco **continua** com o CPF original (sanitização é só em trânsito)

### CA-5. Sanitização de CNPJ, e-mail e telefone

**Given** texto com "CNPJ 12.345.678/0001-90, contato: fulano@escritorio.com, tel (85) 99999-9999"
**When** a rota é chamada
**Then** o prompt envia "CNPJ [CNPJ], contato: [EMAIL], tel [TELEFONE]"

### CA-6. Resposta da IA com JSON inválido → status ERRO

**Given** publicação válida em `NOVA`
**And** Claude respondendo com texto não-JSON ("Desculpe, não consigo analisar...")
**When** a rota é chamada
**Then** retorna `502 { error: "AI_PARSE_ERROR", message: "Resposta da IA não pôde ser interpretada." }`
**And** `Publicacao.statusAnalise = ERRO`
**And** nenhum `Prazo` é criado
**And** registro `ConsumoIA` **é** persistido (RN-6)

### CA-7. Resposta da IA com schema inválido → ERRO

**Given** Claude respondendo `{"confianca": 99}` (tipos errados, campos faltando)
**When** rota é chamada
**Then** retorna `502 { error: "AI_SCHEMA_ERROR", message: "Resposta da IA não tem o formato esperado." }`
**And** publicação vai para `ERRO`

### CA-8. Falha de rede na Claude API → ERRO

**Given** SDK Anthropic lança erro de rede/timeout
**When** rota é chamada
**Then** retorna `503 { error: "AI_UNAVAILABLE", message: "Serviço de IA indisponível. Tente novamente." }`
**And** publicação vai para `ERRO`

### CA-9. Confiança BAIXA não bloqueia prazo, mas sinaliza revisão

**Given** Claude retorna JSON válido com `confianca: "BAIXA"`
**When** rota é chamada
**Then** `Prazo` é criado normalmente
**And** `Publicacao.statusAnalise = ANALISADA` (não `PRAZO_CADASTRADO`) para indicar revisão pendente
**And** `Publicacao.confiancaIA = BAIXA`

### CA-10. Cálculo de prazo — dias úteis puros

**Given** `dataPublicacao = 2026-04-10 (sexta)`, `diasPrazo = 15`, `tipoContagem = UTEIS`, feriados = []
**When** `calcularDataLimite` roda
**Then** começa a contar na segunda `2026-04-13` e retorna `2026-05-04`
**And** o resultado **não** é fim de semana

### CA-11. Cálculo de prazo — pula feriado nacional

**Given** `dataPublicacao = 2026-04-16 (quinta)`, `diasPrazo = 5`, `tipoContagem = UTEIS`
**And** feriado nacional `2026-04-21` (Tiradentes, terça)
**When** calcula
**Then** retorna `2026-04-24` (pula feriado + conta os outros dias úteis)

### CA-12. Prorrogação quando dataLimite cai em feriado

**Given** contagem cai em `2026-09-07` (Independência, domingo)
**When** calcula
**Then** prorroga para `2026-09-08` (terça — segunda é feriado nacional remanejado?) — detalhe: regra genérica é pular sábado/domingo/feriado até achar dia útil

### CA-13. tipoContagem CORRIDOS

**Given** `dataPublicacao = 2026-04-10 (sexta)`, `diasPrazo = 5`, `tipoContagem = CORRIDOS`
**When** calcula
**Then** retorna `2026-04-15` (quarta) — conta dias corridos e só prorroga se cair em fim de semana/feriado

### CA-14. Criação de Processo novo

**Given** publicação sem `processoId`
**And** IA retorna `numeroProcesso` inexistente no escritório
**When** análise roda
**Then** cria `Processo` com `escritorioId = esc-a`, `numeroProcesso`, `vara`, `comarca`, `parteCliente`, `areaDireito` vindos da IA
**And** `Publicacao.processoId` é setado para o id do novo processo

### CA-15. Processo já existente não é sobrescrito

**Given** já existe `Processo` com `numeroProcesso = "X"` em `esc-a`, com `parteCliente = "Alfa"`
**And** IA retorna `numeroProcesso = "X"`, `parteCliente = "Beta"`
**When** análise roda
**Then** `Publicacao.processoId` aponta para o processo existente
**And** `parteCliente` do processo **continua** "Alfa" (não sobrescreve)

### CA-16. UI — drawer mostra painel de análise após sucesso

**Given** publicação com `statusAnalise = PRAZO_CADASTRADO`, `confiancaIA = ALTA`, `dadosExtraidos` preenchido, `prazo.dataLimite = 2026-05-04`, `prazo.diasPrazo = 15`, `prazo.tipoProvidencia = CONTESTACAO`
**When** o usuário abre o drawer
**Then** o drawer renderiza um painel "Análise Digital Jurist" com:
  - bloco "Prazo Legal" = "15 Dias"
  - bloco "Data Limite" = "04 Mai 26"
  - providência sugerida "CONTESTAÇÃO"
  - badge de confiança em cor tertiary (roxo) com texto "ALTA"

### CA-17. UI — badge de confiança MEDIA é laranja

**Given** publicação com `confiancaIA = MEDIA`
**Then** badge tem classe de cor alaranjada (tertiary-container mix / warning)

### CA-18. UI — badge de confiança BAIXA é vermelho e destaca revisão manual

**Given** publicação com `confiancaIA = BAIXA` e `statusAnalise = ANALISADA`
**Then** badge é em tom `error` (`bg-error-container`)
**And** exibe texto "Requer revisão manual" abaixo do badge

### CA-19. UI — botão "Analisar com IA" desaparece para publicação já analisada

**Given** publicação com `statusAnalise in (ANALISADA, PRAZO_CADASTRADO, PECA_GERADA)`
**Then** o botão "Analisar com IA" não é renderizado no drawer
**And** no lugar aparece o painel de análise

### CA-20. UI — erro exibe estado ERRO

**Given** publicação com `statusAnalise = ERRO`
**Then** o drawer exibe aviso `"Não foi possível analisar esta publicação. Tente novamente."`
**And** botão "Tentar novamente" reaparece (dispara POST de novo — que precisa primeiro voltar status a `NOVA` — decisão no plan)

### CA-21. Tokens — registro de consumo

**Given** análise feliz com `usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 }`
**When** rota termina
**Then** existe 1 linha em `ConsumoIA` com esses quatro campos + `modelo = "claude-haiku-4-5-20251001"` + `publicacaoId` + `escritorioId`

### CA-22. Idempotência concorrente

**Given** duas requests simultâneas (mesma `pub-1`, `statusAnalise = NOVA`)
**When** ambas batem na rota
**Then** apenas uma resulta em `200`/`PRAZO_CADASTRADO`
**And** a outra recebe `409`
**And** apenas **uma** chamada à Claude API é feita
**And** apenas **um** `Prazo` é criado

## 7. Edge cases

- **Texto muito curto após sanitização** (ex.: só `[CPF]` sobrando) → ainda tentamos; IA retorna confiança BAIXA ou schema inválido → cai em CA-7/9.
- **Texto gigante** (> 100k chars) → enviamos todo ao Haiku (contexto grande). Se ultrapassar limite do modelo, erro da Claude SDK → CA-8.
- **IA retorna `prazoDias: 0` ou negativo** → schema zod rejeita → CA-7.
- **IA retorna `dataLimite` já calculada em vez de `prazoDias`** → ignoramos `dataLimite` da IA. **Sempre calculamos no servidor** a partir de `dataPublicacao` + `prazoDias` + `tipoContagem` + feriados. IA não é fonte de verdade para datas.
- **Publicação sem `dataPublicacao`** → impossível pela spec 02 (obrigatório), mas defensivamente retornamos 500 com log se encontrar.
- **Feriado estadual em escritório de outro estado** → não conta (RN-9).
- **Dois feriados consecutivos + fim de semana** (ex.: carnaval) → loop de prorrogação acha o próximo dia útil mesmo com 4+ dias seguidos não úteis.
- **IA retorna `confianca` como número (0.98)** em vez de string → normalizamos: `>= 0.85 → ALTA`, `>= 0.6 → MEDIA`, senão `BAIXA`.
- **Cliente aborta a request no meio** → `AbortController` cancela a chamada Anthropic; publicação permanece em `EM_ANALISE`. Plan define como voltar a `NOVA` (cron de recuperação) — fora desta iteração documentar completamente.
- **Chamada feita após 30s do clique (usuário fechou o drawer)** → resposta vem, ainda atualiza o banco (é seguro); UI é observador, não dono.
- **`ConsumoIA` falha em persistir** (FK inválido, DB down) → log, mas **não** faz a análise falhar se a transação principal já commitou. Implementação decide ordem no plan.
- **Publicação tem `processo.areaDireito = OUTRO` e IA sugere `TRABALHISTA`** → não atualizamos o processo existente (RN-15). A análise salva em `dadosExtraidos`.
- **Publicação upload-manual sem `estado`/`comarca`** → cálculo usa só feriados nacionais (RN-9).
- **Clock skew** → sempre usar `new Date()` do servidor e `dataPublicacao` do banco (não do cliente).

## 8. Dados / schema (referência, detalhes no plan)

### Novas tabelas

- **`ConsumoIA`** — registro por chamada à API:
  - `id`, `escritorioId`, `publicacaoId?`, `modelo`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens`, `custoEstimadoBrl (Decimal)`, `createdAt`
  - Índice em `escritorioId`, `createdAt`

### Modificações

- `Publicacao.statusAnalise` ganha uso real de `EM_ANALISE` e `PRAZO_CADASTRADO` e `ERRO` (já existem no enum).
- `Publicacao.dadosExtraidos` (Json) usado nesta feature.

### Prompts

- **System prompt** (fixo, cacheado): persona "jurista digital brasileiro", instruções de saída em JSON estrito, enums disponíveis (`NivelConfianca`, `TipoProvidencia`, `AreaDireito`, `TipoContagem`), exemplos de 2–3 shots.
- **User prompt**: `{ texto_sanitizado, data_publicacao, fonte }`.
- **Esquema de saída** (referência — detalhes no plan):
  ```json
  {
    "numeroProcesso": "string | null",
    "vara": "string | null",
    "comarca": "string | null",
    "estado": "string | null",
    "tipoDecisao": "string",
    "resumo": "string",
    "partes": { "autor": "string | null", "reu": "string | null" },
    "parteCliente": "string | null",
    "areaDireito": "CIVEL | TRABALHISTA | PREVIDENCIARIO | BANCARIO | TRIBUTARIO | OUTRO",
    "prazo": {
      "tipoProvidencia": "CONTESTACAO | RECURSO_APELACAO | ...",
      "dias": 15,
      "tipoContagem": "UTEIS | CORRIDOS"
    },
    "urgencia": "ALTA | MEDIA | BAIXA",
    "confianca": "ALTA | MEDIA | BAIXA"
  }
  ```

## 9. Métricas de sucesso

- ≥ 90% das publicações analisadas recebem `Prazo` válido sem intervenção manual (ALTA ou MEDIA).
- < 5% de publicações caem em `ERRO`.
- Custo médio por análise < R$ 0,03 no p50 com cache quente.
- Taxa de cache hit do prompt caching ≥ 80% em horário comercial.
- Latência p95 < 6s (end-to-end da rota).

## 10. Aberto / a decidir no plan

- **Fila BullMQ vs chamada síncrona**: hoje síncrona; quando virar assíncrona e como manter UX (polling? SSE?).
- **Recuperação de publicações presas em `EM_ANALISE`**: cron que volta a `NOVA` depois de X minutos — criar cron agora ou depois?
- **Transação `$transaction` vs 2 writes**: trade-off entre atomicidade e duração da tx (chamada HTTP externa **não** pode estar dentro da tx; ordem provável: call IA → parse → transaction(Publicacao+Processo+Prazo) → ConsumoIA fora).
- **`custoEstimadoBrl`** usa cotação fixa ou variável? Decisão no plan — provavelmente fixa no `.env` (`USD_BRL_RATE`).
- **Estado no UI durante análise**: `setTimeout`/spinner vs refresh da página — drawer hoje é client, pode fazer `router.refresh()` após 200.
- **`dadosExtraidos` é tipado**? Hoje é `Json`. Vale criar TS type + migration que valida no aplicativo.
- **Rate-limit por escritório** (evitar abuso de consumo de IA) — infra, fora deste slice.
- **Formato do erro na UI para dar contexto** (falha IA vs falha parse vs timeout) — UX decide se mostra mesma msg ou granulariza.
