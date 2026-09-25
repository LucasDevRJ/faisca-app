#!/bin/sh
# Cria os dois usuários do Faísca (DEC-003). Roda como superusuário, só na criação do banco local.
# No Railway, os mesmos comandos são executados manualmente (ver backend/README.md).
# O CI também usa este script, com PGHOST/PGPASSWORD apontando para o service do Postgres.
set -eu

psql -v ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-faisca}" \
  -v migrator_password="$FAISCA_MIGRATOR_PASSWORD" \
  -v app_password="$FAISCA_APP_PASSWORD" <<'SQL'
-- faisca_migrator: dono do banco, altera a estrutura (DDL). Usado só pelo prisma migrate.
-- CREATEDB é necessário só localmente, para o shadow database do `prisma migrate dev`.
CREATE ROLE faisca_migrator LOGIN CREATEDB PASSWORD :'migrator_password';

-- faisca_app: só lê e grava dados (DML). Usado pela API em runtime.
CREATE ROLE faisca_app LOGIN PASSWORD :'app_password';

-- O dono do banco também é dono do schema public (pg_database_owner, Postgres 15+).
ALTER DATABASE faisca OWNER TO faisca_migrator;

-- Só os dois usuários do Faísca conectam; o resto das permissões vem da migration 0000.
REVOKE ALL ON DATABASE faisca FROM PUBLIC;
GRANT CONNECT ON DATABASE faisca TO faisca_app;
SQL
