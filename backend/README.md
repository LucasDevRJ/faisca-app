# Faísca — backend

API do Faísca: Node 24, Express 5, TypeScript, Zod, Prisma 7 e PostgreSQL 17.
Regras de organização e de domínio em [`CLAUDE.md`](CLAUDE.md); requisitos em [`../docs/SPEC.md`](../docs/SPEC.md).

## Rodando localmente

Pré-requisitos: Node 24 e Docker Desktop ligado.

```bash
cp .env.example .env     # preencha as senhas (CHANGE_ME)
npm install              # também roda o `prisma generate`
npm run db:up            # sobe o Postgres e cria faisca_migrator e faisca_app
npm run db:migrate       # aplica as migrations (como faisca_migrator)
npm run dev              # API em http://localhost:3333 (GET /health)
```

As senhas de `FAISCA_MIGRATOR_PASSWORD` e `FAISCA_APP_PASSWORD` precisam ser as mesmas usadas
em `MIGRATION_DATABASE_URL` e `DATABASE_URL`. Se a porta 5432 já estiver ocupada por outro
Postgres, use `POSTGRES_PORT=5433` e troque a porta nas duas URLs.

O `docker/init-db.sh` só roda com o volume vazio. Para recriar o banco do zero:
`docker compose down -v` e depois `npm run db:up`.

## Scripts

| Script | O que faz |
|---|---|
| `dev` | API com recarga automática (tsx watch) |
| `build` / `start` | compila para `dist/` e roda a versão compilada |
| `lint` / `typecheck` | ESLint e checagem de tipos |
| `test` / `test:watch` | Vitest + Supertest |
| `db:up` / `db:down` | liga e desliga o Postgres local |
| `db:migrate` | cria e aplica migration em dev (`prisma migrate dev`) |
| `db:deploy` | aplica migrations pendentes, sem criar nova (produção e CI) |
| `db:generate` | regera o Prisma Client em `src/generated/prisma` (fora do Git) |

## Dois usuários de banco (DEC-003)

- A CLI do Prisma (`prisma.config.ts`) usa sempre `MIGRATION_DATABASE_URL` (**faisca_migrator**, DDL).
- A API usa `DATABASE_URL` (**faisca_app**, só DML) por meio do adapter `@prisma/adapter-pg`.
- A migration `0000_init_privileges` define as *default privileges*: toda tabela criada pelo
  faisca_migrator já nasce com SELECT/INSERT/UPDATE/DELETE para o faisca_app.

### Railway (produção)

O Railway entrega um superusuário. Ele é usado **uma única vez**, para criar os dois usuários,
e nunca pela aplicação. No console SQL do Postgres do Railway, rode com senhas fortes
(o banco padrão do Railway se chama `railway`):

```sql
CREATE ROLE faisca_migrator LOGIN PASSWORD '<senha forte>';
CREATE ROLE faisca_app LOGIN PASSWORD '<outra senha forte>';
ALTER DATABASE railway OWNER TO faisca_migrator;
REVOKE ALL ON DATABASE railway FROM PUBLIC;
GRANT CONNECT ON DATABASE railway TO faisca_app;
```

Depois configure as variáveis do serviço da API (`DATABASE_URL` com o faisca_app e
`MIGRATION_DATABASE_URL` com o faisca_migrator) e rode `npm run db:deploy` no pre-deploy.

## Observações de versões

- **TypeScript fixado em `~6.0`**: o typescript-eslint ainda não suporta o TypeScript 7.
- **`allowScripts` no package.json**: o npm 11 bloqueia scripts de instalação por padrão.
  Só esbuild (usado pelo tsx) e Prisma estão liberados. Ao atualizar essas versões, rode
  `npm install-scripts approve <pacote>` de novo.
