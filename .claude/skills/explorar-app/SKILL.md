---
name: explorar-app
description: Exploração semanal do Faísca como paciente e como profissional, só no computador local e com as contas fictícias do seed, para achar defeitos, atritos, textos estranhos e ideias de funcionalidade. Publica um comentário na discussão do mês ("Exploração do app", categoria Exploração das Discussions) e, na primeira segunda do mês, abre a discussão nova com o resumo do mês anterior. Nunca corrige código nem abre PR. Use quando a tarefa agendada de segunda chamar, ou quando pedirem "explora o app", "navega no Faísca e sugere melhorias", "faz a rodada de exploração".
---

# Explorar o app

Combinado com o usuário em 23/11/2026:
- a rodada é semanal (segunda às 20h, ou quando o app do Claude abrir);
- os achados vão para **uma discussão por mês**, na categoria Exploração das Discussions (DEC-138);
- nada vira issue de trabalho sem a escolha dele.

As regras do AGENTS.md e do CLAUDE.md continuam valendo, em especial estas:
- só dados fictícios (regra 5);
- nunca ler `.env`;
- nunca entrar em produção com senha.

## Limites
- **Só localhost**, com as contas de `backend/scripts/seed-dev.ts`. Nunca minhafaisca.com.br, nunca conta
  real, nunca senha de verdade.
- **Só olhar e anotar.** Não editar código, não commitar, não abrir PR nem issue.
- O repositório e as Discussions são **públicos**: nada de dado real, e-mail pessoal ou falha de
  segurança ainda aberta. Uma falha de segurança vai só para o usuário, na conversa.
- Não derrubar processos de outros agentes. As portas desta rodada são **3334 (API)** e
  **5174 (front)**. Se estiverem ocupadas, use 3335 e 5175 e anote no comentário.
- O banco de dev é compartilhado. O seed devolve as contas fictícias ao estado conhecido, e mais
  nada.

## Preparação única
Uma pasta só para a exploração, separada da pasta de trabalho (já criada em 23/11/2026):
```powershell
git -C C:\workspace\faisca-app worktree add --detach C:\workspace\faisca-explorar origin/main
```
Depois disso, **o usuário** copia o `backend/.env` da pasta de trabalho para
`C:\workspace\faisca-explorar\backend\`. O agente nunca lê nem copia esse arquivo.

## 1. Preparar
1. Na pasta `C:\workspace\faisca-explorar`, rode `git fetch origin` e `git checkout --detach origin/main`.
   Se a pasta ou o `backend/.env` não existirem, comente na discussão do mês que a rodada não pôde rodar
   (diga o que falta) e pare.
2. Desde a última rodada, veja o que entrou: `git log --oneline --since=<data do último comentário>`.
   **O que é novo tem prioridade.**
3. Rode `npm ci` em `backend/` e em `frontend/` só se o `package-lock.json` mudou desde a última vez
   ou se a pasta `node_modules` não existe.
4. Ligue o Docker e o Postgres:
   - confira com `docker ps` se o `faisca-db` está de pé;
   - se o Docker estiver fechado, tente abrir o Docker Desktop e espere até 2 min;
   - se não der, comente na discussão do mês que a semana foi pulada e pare.
5. Em `backend/`, rode `npm run db:deploy` e `npm run db:seed-dev`.
6. Suba os dois servidores em segundo plano, com as variáveis no ambiente (elas valem mais que as do
   arquivo):
   - API: `PORT=3334 FRONTEND_URL=http://localhost:5174 npm run dev` em `backend/`;
   - front: `API_PROXY_TARGET=http://localhost:3334 npx vite --port 5174 --strictPort` em `frontend/`.

## 2. Escolher o foco (rodízio)
| Semana do mês | Foco |
|---|---|
| 1ª | Atividades, início, ciclo e consultas |
| 2ª | Pensamentos, Tensão, Ação, sono e humor |
| 3ª | Profissional (pacientes, Lido, planos) e Mensagens |
| 4ª e 5ª | Conta, personalização, acessibilidade, notificações e Comunidade |

Além do foco, sempre entra **o que chegou na `main` na semana**.

**Condição da rodada:** varie uma por semana:
- celular (375 px);
- tema escuro;
- uma paleta diferente;
- um ajuste de acessibilidade (Linguagem direta, Uma coisa por vez, Leitura confortável ou Menos movimento).

## 3. Explorar
Use o navegador embutido em `http://localhost:5174` (prefira `read_page` e `get_page_text`; capture a
tela só para mostrar um achado visual).
- **Como paciente:**
  - crie, edite, conclua e apague registros fictícios;
  - mude ajustes e personalização;
  - use as Mensagens.
- **Como profissional:**
  - veja o paciente vinculado;
  - marque "Lido";
  - responda mensagens;
  - confira o que **não** deveria aparecer, como uma área que o paciente não liberou.
- Faça o caminho de quem usa de verdade: "registrei uma tensão no ônibus", "quero mostrar isso à
  psicóloga".
- Anote o atrito: toques demais, texto que confunde, botão que some no celular, espera sem retorno.
- Confira o console (`read_console_messages`) em cada área.

## 4. Anotar de 3 a 8 achados
Para cada um:
- **Tipo:** defeito, atrito, texto ou ideia.
- **Onde:** a tela, o perfil (paciente ou profissional) e os passos para repetir.
- **Por quê:** o efeito para o paciente ou para a profissional.
- **Esforço:** pequeno, médio ou grande.
- **Regra que toca, se houver.** Por exemplo:
  - nada de placar, pontos ou culpa (frontend/CLAUDE.md);
  - notificação neutra (regra 3);
  - autorização (regra 1);
  - TCC de verdade (`docs/IDEIAS-TCC.md`).

Antes de sugerir, confira se já existe, para não repetir:
- as issues abertas e fechadas (`gh issue list --state all --search "<palavras>"`);
- as discussões de Ideias e de Exploração, inclusive as fechadas, em especial as marcadas
  "Recusada:" (busca no GitHub: `repo:LucasDevRJ/faisca-app is:discussion <palavras>`).

Ideia que fere uma regra do projeto não entra.

## 5. Publicar
- **Discussão do mês:**
  - título "Exploração do app — <mês>/<ano>", na categoria **Exploração**;
  - só um mantenedor abre discussão nessa categoria; o agente usa o login do usuário.
- **Primeira segunda do mês:**
  1. abra a discussão nova;
  2. no corpo, ponha o **resumo do mês anterior**, com os achados juntos, sem repetidos e por
     importância, e o link de cada comentário;
  3. comente na discussão anterior apontando para a nova e feche-a como resolvida.
- **Nas outras semanas,** comente na discussão aberta. O formato do comentário:
  - "Rodada de <data>": o foco, a condição e o commit da `main`;
  - os achados, numerados;
  - no fim, "Não rodou" ou "Pulado", se algo faltou.
- **Achado aprovado pelo usuário** vira issue (com o link do comentário), e não antes.
- Capturas de tela não sobem para o GitHub. Descreva o que se vê, com os passos.
- Ao terminar, avise o usuário com o link do comentário.

### Comandos (`gh api graphql`)
O `gh` não tem comandos de Discussions. No PowerShell, troque as aspas simples por aspas duplas
escapadas, ou salve a consulta num arquivo e use `-F query=@consulta.graphql`.
```bash
# ids do repositório e das categorias, e as discussões abertas de Exploração
gh api graphql -f query='query { repository(owner: "LucasDevRJ", name: "faisca-app") {
  id
  discussionCategories(first: 20) { nodes { id name } }
  discussions(first: 5, states: OPEN, orderBy: {field: CREATED_AT, direction: DESC}) {
    nodes { id number title url category { name } } } } }'

# abrir a discussão do mês
gh api graphql -f query='mutation($repo: ID!, $cat: ID!, $title: String!, $body: String!) {
  createDiscussion(input: {repositoryId: $repo, categoryId: $cat, title: $title, body: $body}) {
    discussion { url } } }' -f repo=<id do repositório> -f cat=<id da Exploração> \
  -f title="Exploração do app — <mês>/<ano>" -F body=@resumo.md

# comentar a rodada da semana
gh api graphql -f query='mutation($id: ID!, $body: String!) {
  addDiscussionComment(input: {discussionId: $id, body: $body}) { comment { url } } }' \
  -f id=<id da discussão> -F body=@rodada.md

# fechar a discussão do mês anterior
gh api graphql -f query='mutation($id: ID!) {
  closeDiscussion(input: {discussionId: $id, reason: RESOLVED}) { discussion { url } } }' \
  -f id=<id da discussão>
```
Escreva o `resumo.md` e o `rodada.md` numa pasta temporária, fora do repositório.

## 6. Limpar
- Desligue a API e o front que **esta rodada** subiu (só esses).
- A pasta `C:\workspace\faisca-explorar` fica para a próxima semana.
