---
name: nova-migration
description: Guia para mudar o banco do Faísca com Prisma 7 — schema comentado, migration criada como faisca_migrator, CHECKs escritos à mão, permissões do faisca_app, nunca editar migration já aplicada e deploy seguro com o front (expandir e depois contrair). Use sempre que for criar ou alterar tabela, coluna, CHECK, índice ou enum, mesmo que o pedido não diga "migration" — por exemplo "guarda também…", "a API precisa salvar…", "muda o limite de…", "cria um campo…".
---

# Nova migration

Siga os passos em ordem. As regras vêm do AGENTS.md (regra 6, menor privilégio) e do
backend/CLAUDE.md ("Prisma e banco"); em caso de dúvida, eles prevalecem. Rode tudo dentro de
`backend/`, com o Docker e o `faisca-db` no ar (skill `finalizar-mudanca`, passo 2).

## 1. Antes de mexer
- A mudança vem de um requisito ou decisão? Confira a SPEC e as DECs; se não estiver definido,
  pergunte. Mudança de banco quase sempre pede uma DEC nova.
- O dado é sensível (texto do paciente, nota, emoção, motivo)? Então:
  - o nome do campo entra em `SENSITIVE_KEYS` de `src/lib/logger.ts` (regra 7), que gera o
    `redact` do campo e da variante aninhada `*.campo`;
  - um tipo de dado novo pode pedir uma área nova no aviso de privacidade
    (`src/modules/auth/privacy.ts`, DEC-042). Pergunte antes de decidir.

## 2. Schema
Edite `prisma/schema.prisma`:
- identificadores em inglês, com um comentário em pt-BR explicando o campo e a DEC;
- coluna nova em tabela que já tem dados: **opcional** (`?`) ou com `@default`, senão a migration
  falha em produção;
- datas sem hora como `@db.Date`, horas como `@db.Time(0)` (fuso America/Sao_Paulo; DEC-007).

Depois: `npx prisma format`.

## 3. Criar a migration
```bash
npm run db:migrate -- --create-only --name <nome_em_ingles>
```
Usa o `faisca_migrator` (DDL), nunca o superusuário (regra 6). Localmente ele tem `CREATEDB`,
para o shadow database do `prisma migrate dev` (`docker/init-db.sh`): se der erro de permissão,
confira o banco local, e não troque de usuário. O `--create-only` gera o SQL sem aplicar, para
você acrescentar o que o Prisma não gera.

## 4. CHECKs à mão
O Prisma não gera CHECK. No fim do `migration.sql`, escreva os limites que o Zod já valida, como
segunda linha de defesa:
```sql
-- Escrito à mão (o Prisma não gera CHECK): segunda linha de defesa, além do Zod (DEC-0xx).
ALTER TABLE "Tabela" ADD CONSTRAINT "Tabela_campo_check" CHECK (
  "campo" IS NULL OR char_length("campo") BETWEEN 1 AND 5000
);
```
Modelos: `20261001150000_thought_records` e `20261015120000_thought_record_alternative`. Os
números do CHECK e do Zod (`*.schema.ts` no back e `*-labels.ts` no front) precisam ser iguais.

## 5. Tabela nova
O `faisca_app` recebe DML sozinho, pelos default privileges da `0000_init_privileges`. Confira
nos testes que a API consegue ler e gravar na tabela nova.

## 6. Aplicar e gerar
```bash
npm run db:migrate
npx prisma generate
```

## 7. Regra de ouro: nunca editar migration aplicada
Migration que já rodou (na `main`, no `faisca_test` ou no seu banco de dev) **não se edita**: o
banco guarda a versão antiga e só aplica arquivos novos. Para corrigir, crie outra migration.
- O hook `.claude/hooks/proteger.mjs` **bloqueia** editar ou apagar uma migration que está na
  `main` (pelo editor ou pelo terminal, com caminho a partir da raiz ou de `backend/`) e
  **pergunta** antes de mexer numa que só existe na branch. Um script que edita o arquivo sem
  citar o caminho escapa do hook: por isso o CI existe.
- O CI (`migrations-ci.yml`) falha se um PR alterar, renomear ou apagar uma migration existente.

## 8. Deploy seguro
Em produção, a migration roda no pre-deploy do Railway (`npm run db:deploy`). A Vercel publica o
front alguns minutos antes da API (#66), então:
- mudança **aditiva** (tabela nova, coluna opcional, CHECK mais folgado) vai num PR da API que
  pode subir antes do front;
- **renomear ou apagar** coluna, ou apertar um CHECK, é feito em dois PRs (**expandir e depois
  contrair**): primeiro a API passa a aceitar os dois formatos; só depois do front novo no ar, o
  PR que remove o antigo;
- nunca `prisma db push` (o hook bloqueia).

## 9. Fechar
- `scripts/seed-dev.ts` com dados fictícios para o campo novo (regra 5);
- testes que gravem no limite (para exercitar o CHECK) e, se for dado de paciente, os de
  autorização (skill `nova-rota-api`);
- SPEC e DEC no mesmo PR;
- siga a skill `finalizar-mudanca`.
