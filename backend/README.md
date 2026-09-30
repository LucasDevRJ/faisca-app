# Faísca — backend

API do Faísca: Node 24, Express 5, TypeScript, Zod, Prisma 7 e PostgreSQL 17.
Regras de organização e de domínio em [`CLAUDE.md`](CLAUDE.md); requisitos em [`../docs/SPEC.md`](../docs/SPEC.md).

## Rodando localmente

Pré-requisitos: Node 24 e Docker Desktop ligado.

```bash
cp .env.example .env     # preencha senhas, JWT_SECRET, LINK_CODE_SECRET e Resend (CHANGE_ME)
npm install              # também roda o `prisma generate`
npm run db:up            # sobe o Postgres e cria faisca_migrator e faisca_app
npm run db:migrate       # aplica as migrations (como faisca_migrator)
npm run dev              # API em http://localhost:3333 (GET /health)
```

Para o `JWT_SECRET` e o `LINK_CODE_SECRET`, gere dois valores aleatórios diferentes
(ex.: `openssl rand -base64 48`). Sem domínio
próprio, o Resend só entrega e-mail para o dono da conta: use o remetente
`onboarding@resend.dev` e cadastre-se com o seu e-mail para testar o fluxo de confirmação.

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
| `test` / `test:watch` | Vitest + Supertest, no banco `faisca_test` (precisa do Postgres ligado) |
| `test:e2e-server` | API para o Playwright (`tests/`), na porta 3334 e no `faisca_test` |
| `db:up` / `db:down` | liga e desliga o Postgres local |
| `db:migrate` | cria e aplica migration em dev (`prisma migrate dev`) |
| `db:deploy` | aplica migrations pendentes, sem criar nova (produção e CI) |
| `db:generate` | regera o Prisma Client em `src/generated/prisma` (fora do Git) |
| `db:seed-dev` | cria a terapeuta e a paciente fictícias de dev (só com `NODE_ENV=development`) |

## Contas fictícias de dev (DEC-032, DEC-033)

Sem domínio próprio, o Resend não entrega e-mail para uma segunda pessoa. Para ver os dois
lados do vínculo em dev, `npm run db:seed-dev` cria (ou restaura) duas contas já confirmadas,
ambas com a senha `senha-ficticia-123`:

- `terapeuta.dev@faisca.test`: terapeuta;
- `paciente.dev@faisca.test`: paciente já vinculada à terapeuta dev, com ~3 semanas de atividades
  e consultas fictícias em volta de hoje (última há 7 dias, próxima daqui a 3).

Rodar de novo recria os registros da paciente dev, com as datas acompanhando o dia de hoje.
Para testar o vínculo com a sua conta, gere o código em **Conta** e digite-o em **Meus
pacientes** com a terapeuta fictícia, numa janela anônima. As contas só existem no banco local.

## Banco de testes (DEC-026)

Os testes usam o mesmo Postgres de dev, num banco separado: `faisca_test`. Ele é criado
sozinho na primeira execução do `npm test` (pelo faisca_migrator, que tem `CREATEDB` só localmente)
e recebe as migrations a cada execução. As URLs vêm do `.env`, trocando só o nome do banco.
Os dados são apagados antes de cada teste; nada de dev é tocado.

## Dois usuários de banco (DEC-003)

- A CLI do Prisma (`prisma.config.ts`) usa sempre `MIGRATION_DATABASE_URL` (**faisca_migrator**, DDL).
- A API usa `DATABASE_URL` (**faisca_app**, só DML) por meio do adapter `@prisma/adapter-pg`.
- A migration `0000_init_privileges` define as *default privileges*: toda tabela criada pelo
  faisca_migrator já nasce com SELECT/INSERT/UPDATE/DELETE para o faisca_app.

### Railway (produção)

O passo a passo completo está em `docs/DEPLOY.md`. Em resumo:
- o superusuário do Railway é usado **uma única vez**, para criar o faisca_migrator e o faisca_app,
  e nunca pela aplicação;
- o `railway.json` roda `npm run db:deploy` (faisca_migrator) no pre-deploy de cada versão. Por
  isso o `prisma` fica em `dependencies`;
- o `TRUST_PROXY_HOPS` é confirmado com `LOG_LEVEL=debug`: o log `Proxies na frente da API` mostra
  quantos endereços chegam no `X-Forwarded-For`, sem mostrar os IPs. Com o valor errado, o rate
  limit trata todo mundo como uma pessoa só.

## Observações de versões

- **TypeScript fixado em `~6.0`**: o typescript-eslint ainda não suporta o TypeScript 7.
- **`allowScripts` no package.json**: o npm 11 bloqueia scripts de instalação por padrão.
  Só esbuild (usado pelo tsx) e Prisma estão liberados. Ao atualizar essas versões, rode
  `npm install-scripts approve <pacote>` de novo.
