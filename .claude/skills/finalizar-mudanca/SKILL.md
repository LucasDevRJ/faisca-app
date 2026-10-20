---
name: finalizar-mudanca
description: Checklist para encerrar uma mudança no Faísca antes do commit e do PR — ambiente (Docker/Postgres), lint, typecheck e testes só dos pacotes alterados e na ordem certa, conferência na tela, revisor-regras, SPEC/DECISIONS e um relatório fiel do resultado. Use sempre que terminar de codar ou quando pedirem "roda os testes", "pode commitar", "abre o PR", "finaliza", "está pronto?", mesmo que não digam "checklist". Tem um modo rápido para mudança só de documentação.
---

# Finalizar uma mudança

Siga os passos em ordem e relate o resultado **como foi**, inclusive falhas e o que não deu para
rodar. As regras vêm do CLAUDE.md e do AGENTS.md; em caso de dúvida, eles prevalecem.

## 1. O que mudou
```bash
git status --short
git diff main --stat
```
Anote os pacotes tocados: `backend/`, `frontend/`, `tests/`, `docs/`, `.claude/`. Arquivos novos
aparecem como `??` no status: lembre de incluí-los no commit.

**Modo rápido:** se só mudou `docs/`, `.claude/` ou arquivos `.md`, vá direto para o passo 8 e,
antes, confira:
- os links relativos apontam para arquivos que existem;
- as DECs citadas existem no `docs/DECISIONS.md` e a numeração nova segue a última;
- as tabelas e listas do Markdown estão bem formadas.

## 2. Ambiente
Só se mudou `backend/` ou se vai rodar o Playwright:
```bash
docker ps --format '{{.Names}} {{.Status}}'
```
O `faisca-db` precisa estar `healthy` (porta 5434). Docker fechado: **pare e peça ao usuário para
abrir o Docker Desktop**; não tente contornar. Depois, `npm run db:up` dentro de `backend/`.

Nunca leia nem mostre o `.env` (o hook bloqueia comandos que o citam).

## 3. Lint e typecheck
Em cada pacote alterado, dentro da pasta dele:
```bash
npm run lint
npm run typecheck
```
São rápidos: rode antes dos testes. O projeto não usa Prettier (não rode `--write`).

## 4. Testes
Na ordem abaixo, só dos pacotes que importam para a mudança:
1. **Frontend** (`frontend/`): `npm test`. Leva ~1 min.
2. **Backend** (`backend/`): `npm test`. Leva ~13 min: rode **em segundo plano** e siga com outra
   coisa. Para um retorno rápido antes, rode só os arquivos afetados
   (`npx vitest run src/modules/<modulo>`).
3. **Playwright** (`tests/`): `npm test`, **só depois que o backend terminar**. Os dois usam o
   mesmo banco `faisca_test` e não podem rodar juntos. Rode se mudou rota, contrato da API ou fluxo
   de tela.

Armadilhas conhecidas:
- **Migration editada depois de aplicada:** o `faisca_test` guarda a versão antiga e os testes
  falham de um jeito confuso. Não mexa no banco: desfaça a edição e crie uma migration nova.
- **E2E que estoura os 5 s no login** com a suíte inteira: rode o arquivo sozinho
  (`npx playwright test e2e/<arquivo>.spec.ts`). Se passar, relate como instabilidade, com o nome
  do teste; nunca esconda.
- **Teste que compara o formato exato da resposta** (`toEqual`) quebra quando a API ganha campo
  novo: atualize o teste, e não o contrário.

## 5. Conferência na tela
Só se mudou o que a pessoa vê:
1. Em `backend/`: `npm run db:deploy` e `npm run db:seed-dev`. Depois `npm run dev` (API na 3333)
   e, em `frontend/`, `npm run dev` (Vite na 5173), os dois em segundo plano.
2. Abra http://localhost:5173 no navegador embutido com as contas fictícias do seed (e-mails e
   senha no `backend/README.md`): `paciente.dev` e, se a terapeuta vê algo novo, `terapeuta.dev`.
3. Confira o fluxo de ponta a ponta, o celular (375 px) e os modos claro e escuro.
4. Diga ao usuário quais servidores ficaram ligados. Para desligar no Windows, pare as tarefas e
   encerre o `node` que sobra na porta (`Get-NetTCPConnection -LocalPort 3333,5173`). Avise antes
   de desligar.

## 6. Revisão das regras
Se o PR toca em `backend/`, rode o subagente `revisor-regras` (o CLAUDE.md exige). Corrija o que
ele apontar ou leve a decisão ao usuário, e rode-o de novo sobre a correção.

## 7. Documentação
A mudança altera requisito ou decisão?
- requisito → `docs/SPEC.md`;
- decisão → nova entrada no `docs/DECISIONS.md`, antes de "## Adiado", com **Decisão** e
  **Motivo**.

Os dois vão no mesmo PR. Ferramenta de desenvolvimento (skill, hook, script) não precisa de DEC.

## 8. Relatório e commit
Mostre uma tabela com cada verificação e o resultado real:

| Verificação | Resultado |
|---|---|
| Lint e typecheck | ✅ / ❌ com a mensagem |
| Front / Backend / Playwright | quantos passaram, quantos falharam e por quê |
| Tela | o que foi conferido |
| `revisor-regras` | veredito, ou "não exigido" |

Depois, proponha a mensagem de commit (Conventional Commits, em pt-BR, `Closes #N` ou `Refs #N`)
e **peça confirmação antes de commit, push, PR ou merge**. Mande a mensagem por heredoc, porque o
hook confunde algumas palavras dentro de `-m`.
