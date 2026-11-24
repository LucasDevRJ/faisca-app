# Faísca — guia para agentes

PWA do Registro de Ativação. **TCC aqui é sempre Terapia Cognitivo-Comportamental**: o Faísca é um
produto independente, não um trabalho acadêmico. Requisitos em `docs/SPEC.md`; decisões e motivos
em `docs/DECISIONS.md`. Leia os dois antes de mudanças que envolvam regra de negócio.

## Stack
- **frontend/**: React 19, Vite, TypeScript, Tailwind CSS v4, React Router, TanStack Query, Recharts, Axios, PWA
- **backend/**: Node.js, Express, TypeScript, Zod, Prisma, PostgreSQL, JWT (cookie httpOnly), Resend, web-push, node-cron
- **tests/**: Playwright (API e E2E), com foco em autorização
- CI no GitHub Actions; deploy do front na Vercel e do back no Railway

## Estrutura
- `backend/`, `frontend/` e `tests/` têm `package.json` próprios (sem workspaces).
- `backup/`: serviço de cópia de segurança do banco (cron no Railway, DEC-075; roteiro no DEPLOY).
- `scripts/`: `check-unique-ids.mjs` (DEC, versão do aviso e novidade sem repetição; roda no CI).
- `docs/`: SPEC, DECISIONS, DEPLOY (passo a passo do deploy e da troca de segredos),
  BRIEFING-IA (documento único de divulgação, também para outras IAs; atualizar quando uma
  funcionalidade entra no ar) e IDEIAS-TCC (técnicas da TCC planejadas). A APRESENTACAO só aponta
  para o BRIEFING-IA.
- `.claude/skills/`: skills do projeto (`nova-rota-api`, `nova-tela`, `nova-migration`,
  `nova-decisao`, `diagnosticar-defeito-front`, `corrigir-defeito-front`, `finalizar-mudanca`,
  `deploy-checklist` e `explorar-app`, a rodada semanal de exploração com as contas fictícias).
- `.claude/agents/`: subagentes do projeto (`revisor-regras` para as regras invioláveis,
  `revisor-telas` para tom, cores, contraste, acessibilidade e celular, e `revisor-seguranca`
  para falhas de segurança e dependências, por área ou pelo diff).
- `.claude/settings.json` e `.claude/hooks/`: permissões e hooks do Claude Code (bloqueiam `.env`,
  `--no-verify`, force push, `prisma db push` e edição de migration já aplicada; pedem confirmação
  em push, PR e merge). Testes do hook: `node --test .claude/hooks/proteger.test.mjs`.
- `backend/CLAUDE.md`, `frontend/CLAUDE.md` e `tests/CLAUDE.md`: regras específicas de cada pasta.

## Comandos
Backend (rodar dentro de `backend/`; detalhes em `backend/README.md`):
- `npm run dev`: API em modo dev (porta 3333)
- `npm run lint` · `npm run typecheck` · `npm test`: rodar ao terminar uma mudança (`npm test` precisa do Postgres ligado; usa o banco de testes do agente, DEC-026 e DEC-110)
- `npm run build`: compila para `dist/`
- `npm run db:up`: sobe o Postgres local (Docker)
- `npm run db:migrate`: nova migration em dev · `npm run db:deploy`: aplica as pendentes

Frontend (rodar dentro de `frontend/`; detalhes em `frontend/README.md`):
- `npm run dev`: app em http://localhost:5173, com `/api` repassado para a API (DEC-023)
- `npm run lint` · `npm run typecheck` · `npm test`: rodar ao terminar uma mudança
- `npm run build` · `npm run preview`: build com service worker e servidor local para testá-lo

Testes de API e E2E (rodar dentro de `tests/`; precisa do Postgres ligado):
- `npm test`: sobe a API de testes e o front nas portas do agente (padrão 3334 e 5174) e roda tudo
- `npm run test:api` · `npm run test:e2e` · `npm run typecheck`
- Na primeira vez: `npx playwright install chromium`

## Regras invioláveis
1. **Autorização no backend.** No contexto de terapeuta (a profissional: psicóloga ou psiquiatra),
   só GET, só de pacientes com vínculo ativo e só das **áreas que o paciente liberou para ela**
   (DEC-097); qualquer outro caso retorna 403. Exceções: os POSTs que criam o vínculo
   (`/links/redeem-code`, `/links/accept-invite`, DEC-031), as marcas de leitura da própria terapeuta
   (`PUT`/`DELETE /therapist/read-marks/:patientId`, com vínculo ativo, DEC-057), a resposta dela ao
   pedido do paciente para ver essas marcas (`PUT /therapist/read-receipts/:patientId`, com vínculo
   ativo; grava só a preferência dela no vínculo, DEC-117), os avisos do mural
   dela (`POST`/`PATCH`/`DELETE /therapist/notices`, só o próprio aviso, DEC-079) e **somente a
   psicóloga** criando um plano para o paciente (`POST /therapist/patients/:patientId/plans`, DEC-102).
   As rotas específicas da Comunidade (DEC-113), fora de `/therapist/patients`, podem ler e alterar
   apenas conteúdo criado para o grupo e exigem aceite da área; a psicóloga responsável não ganha
   acesso aos registros clínicos. A psicóloga pode, com 2FA ativo, moderar apenas conteúdo de
   pacientes da própria comunidade; conteúdo e denúncias contra ela permanecem com a plataforma. A
   moderação da plataforma exige e-mail autorizado e 2FA ativo. Toda troca de revisor é informada no
   feed comunitário (DEC-122).
   Essa última rota exige vínculo ativo, área Meus Planos liberada e aceite da área pelo paciente e
   pela psicóloga; ela não pode editar planos nem criar registros. O plano pertence ao paciente, que
   continua podendo editar, encerrar ou apagar. Exceção de leitura: `POST
   /therapist/patients/:patientId/records/search` apenas pesquisa com termo no corpo, sem gravar ou
   alterar registros, e mantém as mesmas verificações de vínculo, área e aceite de cada resultado.
   As rotas próprias `/messages` (DEC-125) permitem ler e enviar mensagens privadas somente entre
   as duas pessoas do vínculo ativo após aceite de ambas. Esse acesso é separado dos registros.
   Cada uma grava também o próprio "visto" da conversa (`PUT /messages/:linkId/seen`, DEC-127), só a
   própria coluna no vínculo; o "visto" de uma nunca é mostrado à outra (sem recibo de leitura).
   No assunto "Sobre um registro" (DEC-128), a mensagem guarda só a referência a um registro do
   paciente; a API devolve à profissional o resumo dele (tipo, data e começo do título) só com a área
   liberada no vínculo e os aceites dos dois, conferidos a cada leitura. A profissional não aponta
   registro novo: só responde sobre o que o paciente apontou.
   No contexto de paciente, só os próprios dados.
   Toda rota nova com dado de paciente precisa de teste de autorização (caso permitido e negado).
2. **Registros finais são imutáveis.** Editar ou excluir atividade CONCLUIDA ou NAO_REALIZADA retorna 409.
3. **Notificações neutras.** Push e e-mail de lembrete nunca contêm nome de atividade, notas ou observações.
   Avisos de mensagens não contêm conteúdo, assunto, nome ou identificador da outra pessoa.
4. **Sem segredos no repositório.** Nunca commitar `.env`. Variável nova vai para o `.env.example`
   com placeholder.
5. **Sem dados reais.** Seeds, fixtures e testes usam apenas dados fictícios.
6. **Menor privilégio no banco.** A API usa `faisca_app` (DML); migrações usam `faisca_migrator` (DDL).
   Nunca o superusuário.
7. **Logs sem dados sensíveis.** Não logar senhas, tokens, códigos de vínculo, nomes de atividade,
   notas ou observações.
8. **Segredos de vínculo só como hash.** Tokens de convite e códigos de vínculo nunca são guardados em texto.

## Antes de começar (toda sessão, qualquer IA)
Outros agentes mudam o projeto entre uma sessão e outra. Antes da tarefa pedida, veja como o projeto
está **agora**; não confie só na memória, num resumo de conversa anterior ou numa cópia local antiga:
1. `git fetch origin` e `git log --oneline origin/main -20`: o que entrou desde a última vez.
2. `gh pr list` (inclusive rascunhos) e as issues com a sua etiqueta: o que está em andamento e
   quem cuida de quê.
3. Nas mudanças novas, leia o que vale como regra: as últimas DECs do `docs/DECISIONS.md`, a seção
   da SPEC do assunto, o `AGENTS.md`, o `CLAUDE.md` da pasta e os arquivos de `.claude/` (skills,
   subagentes e hooks).
4. Confira os números à mão já usados, inclusive em rascunhos: a última DEC, a versão atual do aviso
   (`frontend/src/features/auth/privacy-version.ts`) e as novidades.

Se algo contradiz o que você lembrava (uma funcionalidade que já entrou, uma regra que mudou), avise
a pessoa antes de seguir.

## Mais de um agente
Mais de um agente de IA trabalha no projeto ao mesmo tempo, cada um na sua pasta (worktree).
- **Divisão pelas issues:** cada issue tem a etiqueta do agente que cuida dela (`agente:claude`,
  `agente:antigravity`, `agente:codex`). Não pegue issue com a etiqueta de outro agente, e evite
  mexer nos mesmos arquivos de um PR aberto dele.
- **Quadro da fila** ([Faísca — fila](https://github.com/users/LucasDevRJ/projects/1), DEC-137):
  toda issue aberta fica no quadro. Status: Ideia → Na fila → Fazendo → Em revisão → No ar.
  - **Começou uma issue:** mova o cartão para **Fazendo** e marque o seu nome em **Agente**.
  - **Abriu o PR:** mova para **Em revisão**.
  - **Issue fechada ou PR com merge:** o GitHub move para **No ar**.
  - **Issue nova:** entra em **Ideia**. Quem decide a fila e a **Prioridade** é o usuário.
  - **Na fila:** a ordem de trabalho é a visão "Fila" (só "Na fila", por prioridade).
  - Não pegue cartão com outro agente em **Agente**.
  - Comandos: `gh project item-list 1 --owner LucasDevRJ` e `gh project item-edit` (o `gh` precisa
    do escopo `project`).
- **Sub-issues:** issue com mais de uma entrega se divide em sub-issues (ex.: #93), cada uma com a
  etiqueta do agente e um PR próprio. O PR cita a sub-issue (`Closes #N`), e não a mãe. A mãe fica
  aberta e fecha quando todas as sub-issues fecharem.
- **Números à mão** (DEC, versão do aviso de privacidade, novidade): reserve com um PR em
  rascunho assim que escolher, e confira os PRs abertos, inclusive rascunhos, antes de escolher.
  O CI `Números únicos` (`scripts/check-unique-ids.mjs`) barra repetição.
- **Antes do PR:** `git fetch origin main` e `git merge origin/main` (nunca rebase nem force push),
  mantendo as entradas dos dois lados no DECISIONS.md e na SPEC; depois, lint e testes de novo.
- **Testes (DEC-110):** cada agente usa o próprio banco de testes e as próprias portas do Playwright,
  para rodar ao mesmo tempo que os outros sem um apagar os dados do outro. Defina as variáveis no
  ambiente do agente (o Claude já as tem no `.claude/settings.json`):

  | Agente | `FAISCA_TEST_DB` | `E2E_API_PORT` | `E2E_WEB_PORT` |
  |---|---|---|---|
  | Claude | `faisca_test_claude` | 3334 | 5174 |
  | Codex | `faisca_test_codex` | 3344 | 5184 |
  | Antigravity | `faisca_test_antigravity` | 3354 | 5194 |
  | CI e sem variável | `faisca_test` | 3334 | 5174 |

  **Para configurar** (cada agente, uma vez):
  1. Defina as três variáveis da sua linha no ambiente em que roda os comandos, antes do `npm test`
     do backend ou do Playwright. No PowerShell, por exemplo:
     `$env:FAISCA_TEST_DB='faisca_test_codex'; $env:E2E_API_PORT='3344'; $env:E2E_WEB_PORT='5184'`.
     Se a sua ferramenta permite deixá-las fixas na configuração, use.
  2. Rode a suíte do backend uma vez: o banco é criado sozinho e precisa passar.

  **Agente novo:** ganha uma linha nova, com `faisca_test_<nome>` (só letras minúsculas, números e
  `_`) e as portas seguintes, de 10 em 10 (3364/5204, depois 3374/5214…), e a etiqueta
  `agente:<nome>` nas issues.

  Dentro do mesmo agente, a suíte do backend e o Playwright continuam sem rodar juntos, porque usam o
  mesmo banco.

## Discussions (DEC-138)
O repositório é público, e as Discussions também: **nunca dado real**, de paciente ou de
profissional (regra 5), nem e-mail pessoal, segredo ou falha de segurança ainda aberta.
- **Categorias:** Ideias (todos escrevem), Perguntas (resposta marcada), Avisos e Exploração (só
  mantenedores abrem). Criar, renomear e apagar categorias é com o usuário, pela página do GitHub.
- **Ideia nova**, que o usuário ainda não escolheu, vai para **Ideias**, e não vira issue.
- **Aprovada:** vira issue com o link da discussão (e entra no quadro como Ideia, DEC-137); a
  discussão é fechada como resolvida, com o link da issue.
- **Recusada:** a discussão é fechada como desatualizada, com um comentário "Recusada: <motivo>".
  Antes de sugerir algo, procure também nas discussões fechadas.
- **Opinião de agente:** quando o usuário pede, o agente comenta na discussão e **assina** no fim
  ("— Claude", "— Codex", "— Antigravity"), porque todos usam o login do usuário. Ele só opina e
  pode responder a outro agente; quem decide é sempre o usuário.
- **Exploração semanal:** uma discussão por mês na categoria Exploração (skill `explorar-app`).
- **Formulários de issue** (`.github/ISSUE_TEMPLATE/`): Defeito e Ideia aprovada, sem issue em
  branco. A tela de escolha leva ideias e perguntas para as Discussions e falhas de segurança para
  o relato privado. Pelo `gh issue create`, siga os mesmos títulos do formulário no corpo.
- **Comandos:** o `gh` não tem comandos de Discussions; use `gh api graphql` (exemplos na skill
  `explorar-app`).

## Segurança do repositório (DEC-136)
- A `main` só recebe PR com o CI verde, **sem exceção para administradores**. O GitHub barra push
  direto e force push; os hooks barram force push e pedem confirmação em todo push.
- **Ações dos workflows** sempre fixadas pelo SHA do commit, com a versão num comentário
  (`actions/checkout@<sha> # v4.4.0`), e o checkout com `persist-credentials: false`. Ação nova
  entra do mesmo jeito.
- **PRs do Dependabot:** quem os pega coloca a etiqueta do agente.
  - Rode o `revisor-seguranca` no modo diff.
  - Rode os testes do pacote.
  - Se o PR mexer no `vite-plugin-pwa` ou no `workbox-build`, confira que o `npm run build` do
    front continua com o mesmo número de arquivos no precache (#283).
  - Nunca faça merge sem o CI.
- **Alertas do CodeQL, do Dependabot e da varredura de segredos:** quem encontrar avisa o usuário.
  Dispensar um alerta, ou mudar as proteções do repositório, é decisão do usuário.

## Convenções
- Identificadores de código em inglês (`Activity`, `activityDate`); valores de estado do domínio
  como na SPEC (`PLANEJADA`, `CONCLUIDA`...); textos de interface em pt-BR.
- Documentação, comentários e commits em pt-BR.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), commits pequenos.
- Uma branch por etapa (`feat/...`, `fix/...`, `docs/...`) e PR para a `main`.
- Fuso America/Sao_Paulo; timestamps em UTC; `activityDate` como DATE.
- Requisito mudou → atualize `docs/SPEC.md`. Decisão mudou → nova entrada em `docs/DECISIONS.md`.
  Os outros documentos (BRIEFING-IA, IDEIAS-TCC, DEPLOY) também acompanham cada mudança: veja a
  tabela na skill `finalizar-mudanca`.
