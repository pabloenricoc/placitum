# Spec 01 — Autenticação

**Status**: draft
**Owner**: dev full-stack
**Depende de**: constitution.md, schema Prisma (User, Escritorio, Session, VerificationToken)

## 1. Objetivo

Permitir que um usuário (advogado, sócio, paralegal ou admin) entre no Placitum associado ao seu escritório (tenant), com credenciais seguras e com opção de entrada sem senha via magic link. Toda autenticação é pré-requisito para acessar publicações e peças.

## 2. Motivação

- Multi-tenant exige identidade forte: cada requisição precisa saber `userId` + `escritorioId`.
- Advogados não querem gerenciar senha complexa — magic link reduz fricção.
- Escritórios massificados têm paralegais operando contas compartilhadas; precisamos forçar conta individual por pessoa para auditoria.

## 3. Escopo

### No escopo
- Login por e-mail + senha (credenciais).
- Login por magic link (e-mail com token de uso único, 15 min).
- Logout.
- Sessão persistente (JWT ou DB session strategy do NextAuth v5).
- Registro de novo **escritório** + primeiro **usuário admin** (fluxo "criar conta do escritório").
- Convite de novo usuário a um escritório existente por um admin, via link de convite por e-mail.
- Papéis: `ADMIN`, `ADVOGADO`, `PARALEGAL`.
- Proteção de rotas: middleware redireciona não-autenticado para `/login`.

### Fora do escopo (post-MVP)
- SSO corporativo (Google Workspace, Microsoft).
- 2FA / TOTP.
- Reset de senha por link (usar magic link como bypass no MVP).
- Auditoria detalhada de login (IP, device).
- Rate-limit por IP (depende de infra Redis, tratado em spec separada).
- Recuperação de conta por suporte humano.
- Social login.

## 4. Regras de negócio

RN-1. **Um usuário pertence a exatamente um escritório.** Troca de escritório exige criar nova conta.

RN-2. **E-mail é único globalmente.** Se usuário já existe em outro escritório, registro falha com mensagem clara sem revelar qual escritório.

RN-3. **Senha**: mínimo 10 caracteres, com ao menos 1 letra e 1 número. Armazenada com `bcrypt`, `saltRounds = 12`. Nunca logada, nunca retornada por API.

RN-4. **Magic link**: token opaco de 32 bytes (base64url), TTL 15 min, single-use. Ao consumir, token é invalidado no banco mesmo em caso de erro posterior.

RN-5. **Convite**: token de convite TTL 7 dias, single-use, vincula o novo usuário ao `escritorioId` do convite. Papel do convidado é definido pelo admin no momento do convite.

RN-6. **Sessão**: válida por 30 dias, renovada a cada requisição autenticada. Logout invalida a sessão no servidor.

RN-7. **Papéis**:
- `ADMIN`: tudo, incluindo convidar/remover usuários, editar dados do escritório.
- `ADVOGADO`: gerenciar publicações, gerar peças, operar agenda.
- `PARALEGAL`: gerenciar publicações e agenda. **Não** pode gerar peça final nem protocolar.

RN-8. **Tentativas falhas**: 5 tentativas erradas consecutivas por e-mail em janela de 15 min → bloqueio de 15 min para aquele e-mail. Mensagem genérica ("credenciais inválidas"), não revela se e-mail existe.

RN-9. **Desativação**: admin pode desativar usuário (`ativo = false`). Usuário desativado não loga e tem sessão invalidada na próxima requisição.

RN-10. **Primeiro usuário do escritório** é sempre `ADMIN`. Não pode ser criado como paralegal.

## 5. Requisitos não-funcionais

- Latência de login credenciais: < 500ms no p95 (bcrypt é o gargalo esperado).
- Envio de magic link: enfileirar no BullMQ, retornar 200 imediatamente ao cliente (não bloquear no Resend).
- Nenhum log contém senha, hash, token de magic link ou token de convite.
- Cookies: `httpOnly`, `secure` em produção, `sameSite=lax`.

## 6. Critérios de aceite (Given / When / Then)

### CA-1. Registro de novo escritório + admin

**Given** um e-mail `ana@escritorio-x.com.br` que não existe em nenhum escritório
**And** nome do escritório "Escritório X"
**And** senha válida `Senha1234!`
**When** o usuário submete o formulário de criação de escritório
**Then** cria `Escritorio` com `nome = "Escritório X"`
**And** cria `User` com `email = "ana@..."`, `papel = ADMIN`, `ativo = true`, senha hasheada com bcrypt 12
**And** inicia sessão e redireciona para `/onboarding`
**And** envia e-mail de boas-vindas (enfileirado)

### CA-2. Login credenciais — sucesso

**Given** usuário existente com e-mail `ana@...` e senha `Senha1234!`
**And** conta ativa
**When** usuário submete `email + senha` corretos
**Then** cria sessão de 30 dias
**And** redireciona para `/dashboard`
**And** não registra a senha em log

### CA-3. Login credenciais — senha errada

**Given** usuário existente com senha `Senha1234!`
**When** submete `email + senhaErrada`
**Then** retorna erro 401 com mensagem `"Credenciais inválidas"`
**And** incrementa contador de tentativas para aquele e-mail
**And** **não** revela se o e-mail existe

### CA-4. Login — bloqueio por tentativas

**Given** 5 tentativas erradas consecutivas em 15 min para `ana@...`
**When** 6ª tentativa acontece (mesmo com senha correta)
**Then** retorna 429 com mensagem `"Muitas tentativas. Tente novamente em 15 minutos."`
**And** bloqueio expira automaticamente após 15 min

### CA-5. Magic link — solicitação

**Given** e-mail `ana@...` cadastrado e conta ativa
**When** usuário solicita magic link
**Then** gera token 32 bytes base64url com TTL 15 min
**And** persiste em `VerificationToken`
**And** enfileira job de envio via Resend
**And** responde 200 com mensagem genérica `"Se o e-mail existir, você receberá um link."`
**And** retorna a mesma resposta mesmo se e-mail **não** existir (evitar enumeração)

### CA-6. Magic link — consumo

**Given** token válido e não consumido, dentro do TTL
**When** usuário acessa `/auth/magic?token=...`
**Then** valida o token, invalida-o (single-use), cria sessão
**And** redireciona para `/dashboard`

### CA-7. Magic link — expirado

**Given** token com `expiresAt < now()`
**When** usuário acessa link
**Then** retorna 400 com mensagem `"Link expirado. Solicite um novo."`
**And** **não** cria sessão
**And** remove o token do banco

### CA-8. Convite de novo usuário

**Given** admin `ana@...` logada em `Escritorio X`
**When** admin convida `joao@...` com papel `ADVOGADO`
**Then** cria registro `Invite` com `escritorioId`, `email`, `papel`, `token`, TTL 7 dias
**And** enfileira e-mail com link `/auth/aceitar-convite?token=...`

### CA-9. Aceite de convite

**Given** convite válido para `joao@...`, papel `ADVOGADO`
**And** senha `Senha1234!` escolhida por João
**When** João submete o formulário de aceite
**Then** cria `User` com `escritorioId` do convite e `papel = ADVOGADO`
**And** invalida o convite
**And** inicia sessão e redireciona para `/dashboard`

### CA-10. Logout

**Given** usuário autenticado
**When** clica em logout
**Then** invalida sessão no servidor
**And** limpa cookie
**And** redireciona para `/login`

### CA-11. Proteção de rota

**Given** usuário não autenticado
**When** acessa `/dashboard` (ou qualquer rota protegida)
**Then** middleware responde 307 redirect para `/login?callbackUrl=/dashboard`

### CA-12. Usuário desativado

**Given** usuário com `ativo = false`
**When** tenta logar com credenciais corretas
**Then** retorna 401 `"Conta inativa. Contate o administrador do escritório."`
**And** não cria sessão

### CA-13. Isolamento multi-tenant

**Given** Ana (escritório A) autenticada
**When** acessa `/api/publicacoes` e o banco tem publicações dos escritórios A e B
**Then** retorna **apenas** publicações com `escritorioId = A`

### CA-14. Papel insuficiente (paralegal tenta gerar peça)

**Given** usuário com `papel = PARALEGAL` autenticado
**When** tenta chamar endpoint de geração de peça final
**Then** retorna 403 `"Apenas advogados podem gerar peças."`

## 7. Edge cases

- E-mail com caixa alta / espaços → normalizar para lowercase + trim antes de qualquer query.
- Usuário solicita magic link 5× em 1 min → rate-limit por e-mail (máx 3 em 10 min), excedente retorna mesma resposta genérica mas não enfileira novo envio.
- Token de magic link reutilizado (segunda tentativa) → 400, sem criar sessão.
- Token de convite + e-mail diferente do original → recusar ("convite não pertence a este e-mail").
- Dois admins convidam o **mesmo** e-mail simultaneamente → apenas o primeiro vale; segundo recebe erro "e-mail já convidado".
- Admin remove (desativa) a si mesmo → bloquear se for o único admin ativo do escritório.
- Clock skew ao validar TTL → comparar sempre com `new Date()` do servidor, não do cliente.
- E-mail entregue com atraso; link já expirou → UX clara pedindo novo link.
- Usuário troca senha → invalida todas as sessões abertas daquele usuário (exceto a atual).
- Usuário apaga cookie → próxima requisição exige login novamente (comportamento padrão).

## 8. Dados / schema (referência, detalhes no plan)

Entidades esperadas: `User`, `Escritorio`, `Session`, `VerificationToken`, `Invite`, `LoginAttempt`.

Campos sensíveis: `User.passwordHash`, `VerificationToken.token`, `Invite.token` — nunca retornar em API.

## 9. Métricas de sucesso

- Taxa de conclusão de registro de escritório > 80% dos que iniciam.
- Tempo médio de login credenciais < 2s percebido pelo usuário.
- Zero incidentes de vazamento de sessão entre tenants em auditoria manual do MVP.
- < 1% de e-mails de magic link entregues fora da SLA de 30s.

## 10. Aberto / a decidir no plan

- JWT session vs DB session strategy do NextAuth v5 → decidir em `01-auth.plan.md`.
- Rate-limit: em memória (Redis single instance) ou por tabela — decidir no plan.
- Cookies cross-subdomain (app.placitum.app vs api) — confirmar no plan se haverá subdomínios separados.
