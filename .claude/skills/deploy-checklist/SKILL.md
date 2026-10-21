---
name: deploy-checklist
description: Passo a passo para colocar uma mudança do Faísca em produção com segurança — classificar o PR (front, API, contrato, migration), a ordem API antes do front (DEC-056), merge com confirmação, acompanhar Vercel e Railway, conferir em produção pelo /health com o commit, avisar quem usa e o que fazer se der errado. Use sempre que for fazer merge na main ou quando pedirem "pode mergear", "sobe para produção", "faz o deploy", "já está no ar?", mesmo que não digam "deploy".
---

# Deploy de uma mudança

O primeiro deploy (painéis, DNS, segredos) está no `docs/DEPLOY.md`. Esta skill é para o dia a
dia: cada merge na `main` faz o deploy sozinho. Antes de tudo, a mudança passou pela skill
`finalizar-mudanca`.

## 1. Classificar o PR
```bash
gh pr diff <n> --name-only
```
| O PR mexe em | Tipo | O que sobe |
|---|---|---|
| só `frontend/` | front | Vercel (~1 min) |
| só `backend/` | API | Railway (~8–9 min: espera o CI, build, migration no pre-deploy, healthcheck) |
| `backend/` com mudança de rota, de formato de resposta ou de entrada, **e** `frontend/` que depende disso | **contrato** | os dois, em tempos diferentes |
| `backend/prisma/migrations/` | migration | Railway, com a migration no pre-deploy |
| só `docs/`, `.claude/`, `.github/` | nada | nenhum deploy do app |

**Contrato (DEC-056):** o front sobe minutos antes da API. Nunca junte os dois num PR só:
1. PR da API, **aditivo**: a API nova continua aceitando o front que está no ar (campo novo
   opcional, rota nova, formato antigo mantido);
2. merge, deploy e conferência da API (passos 3 e 4, com o commit no `/health`);
3. só então o PR do front.

Para remover ou renomear algo, faça o "expandir e depois contrair" da skill `nova-migration`.

## 2. Merge
- Confira o CI uma vez: `gh pr checks <n>`. Com algo pendente, não fique consultando em loop:
  avise e espere o usuário pedir de novo.
- **Peça confirmação antes do merge** (CLAUDE.md). Depois: `gh pr merge <n> --merge`.
- Pegue o commit do merge: `gh pr view <n> --json mergeCommit -q .mergeCommit.oid`.

## 3. Acompanhar o deploy
```bash
gh api "repos/LucasDevRJ/faisca-app/deployments?sha=<commit>" -q '.[] | {id, environment}'
gh api "repos/LucasDevRJ/faisca-app/deployments/<id>/statuses" -q '.[0].state'
```
- `Production` é a Vercel; `laudable-spirit / production` é o Railway.
- Estados: `in_progress` → `success`. No Railway, `inactive` quando o PR não mexeu no
  `backend/` (nada para publicar).
- Espere em segundo plano, com um laço que confere a cada ~20 s e para no `success` ou numa falha.
- Se o Railway não aparecer em ~2 min num PR com `backend/`, ele pode ter perdido o acesso ao
  GitHub (aconteceu em 01/10/2026): peça ao usuário para conferir o painel e fazer o deploy manual.

## 4. Conferir em produção
```bash
curl -s https://api.minhafaisca.com.br/health        # status ok e "version": o commit curto
curl -s -o /dev/null -w "%{http_code}" https://minhafaisca.com.br/
curl -s -o /dev/null -w "%{http_code}" https://api.minhafaisca.com.br/<rota-nova>   # 401 = existe
```
- **API:** o `version` do `/health` precisa ser o commit do merge (os 7 primeiros caracteres).
  Enquanto for o anterior, a versão nova ainda não entrou.
- **Rota nova:** 401 sem sessão prova que ela existe e que a API subiu; 404 quer dizer que a API
  antiga ainda está no ar.
- **Migration:** se o deploy terminou com `success`, a migration rodou (o pre-deploy roda antes e
  barra a troca se falhar).
- **Front:** o site responde 200. A tela em si é o usuário quem confere, na conta de testes.

## 5. Avisar quem usa
Diga ao usuário o que muda para ele e para a psicóloga:
- o PWA aberto mostra a faixa **"Atualizar"** (DEC-041); no iPhone, às vezes é preciso fechar o
  app de vez;
- se houver card de Novidades novo (DEC-054), ele aparece depois de atualizar;
- se o aviso de privacidade mudou de versão, a área nova pede um novo aceite (DEC-042).

## 6. Se der errado
- **Healthcheck ou migration falhou:** o Railway mantém a versão anterior no ar. Leia os logs do
  deploy no painel; corrija num PR novo (migration errada se corrige com outra migration).
- **Subiu e quebrou, sem migration:** reverta a mudança num PR (`git revert -m 1 <merge>`), com
  confirmação. Nos painéis também dá para voltar: *Redeploy* da versão anterior no Railway e
  *Promote to Production* na Vercel. Diga ao usuário qual caminho recomenda e por quê.
- **Subiu e quebrou, com migration:** **nem o revert nem o painel desfazem uma migration que já
  rodou**: o banco continua no schema novo, e o código antigo pode quebrar ao procurar uma coluna
  que mudou. Corrija para a frente: um PR novo, com uma migration nova se for preciso, no
  "expandir e depois contrair" da skill `nova-migration`. Nunca altere o banco de produção à mão,
  nunca use o superusuário (regra 6) nem `db push`. Por isso migrations que removem ou renomeiam
  algo nunca vão no mesmo PR que o código que deixa de usar o antigo.
- **Front novo com API velha** (quebrou o contrato): espere o Railway terminar, conferindo o
  `/health`; se demorar, reverta o front.

## 7. Relatório
| O quê | Resultado |
|---|---|
| PR e commit | #n, `abc1234` |
| Vercel | `success` às HH:MM (Brasília) |
| Railway | `success` às HH:MM · `/health` com `version` = `abc1234` |
| Conferências | site 200, rota nova 401, … |
| Para quem usa | "Atualizar", novidades, aceite |
