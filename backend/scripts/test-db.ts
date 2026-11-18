import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Banco de testes (DEC-026): mesmo Postgres de dev, banco separado `faisca_test`.
// Usado pelo Vitest (globalSetup) e pelo Playwright (tests/). Nunca roda em produção.

export const DEFAULT_TEST_DATABASE = 'faisca_test';

// Com mais de um agente rodando os testes ao mesmo tempo, cada um usa o próprio banco
// (FAISCA_TEST_DB=faisca_test_claude, por exemplo; tabela no AGENTS.md, DEC-109). Sem a variável,
// o de sempre (CI e quem não configurou nada). Só aceita nomes que começam com faisca_test e têm só
// letras minúsculas, números e "_": nunca aponta para o banco de dev nem para o de produção, e o nome
// entra no CREATE DATABASE sem risco de injeção.
export function testDatabaseName(value = process.env.FAISCA_TEST_DB): string {
  if (!value) return DEFAULT_TEST_DATABASE;
  if (!/^faisca_test(_[a-z0-9]+)*$/.test(value) || value.length > 63) {
    throw new Error('FAISCA_TEST_DB precisa começar com faisca_test e ter só letras minúsculas, números e "_".');
  }
  return value;
}

function loadEnv() {
  // No CI as variáveis vêm do workflow; localmente, do backend/.env.
  if (existsSync('.env')) process.loadEnvFile('.env');
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

// Mesmos usuários e senhas de dev (faisca_app e faisca_migrator), apontando para o faisca_test.
export function testDatabaseUrls() {
  loadEnv();
  const { DATABASE_URL, MIGRATION_DATABASE_URL, NODE_ENV } = process.env;
  if (NODE_ENV === 'production') throw new Error('Banco de testes não roda em produção.');
  if (!DATABASE_URL || !MIGRATION_DATABASE_URL) {
    throw new Error('Defina DATABASE_URL e MIGRATION_DATABASE_URL no backend/.env (veja o .env.example).');
  }
  return {
    // Conexão ao banco principal, só para criar o faisca_test se ele não existir.
    adminUrl: MIGRATION_DATABASE_URL,
    migratorUrl: withDatabase(MIGRATION_DATABASE_URL, testDatabaseName()),
    appUrl: withDatabase(DATABASE_URL, testDatabaseName()),
  };
}

// Cria o banco de testes (se preciso) e aplica as migrations nele, como faisca_migrator.
export async function prepareTestDatabase() {
  const { adminUrl, migratorUrl } = testDatabaseUrls();
  const database = testDatabaseName();

  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });
  try {
    const rows = await admin.$queryRaw<unknown[]>`
      SELECT 1 FROM pg_database WHERE datname = ${database}`;
    if (rows.length === 0) {
      // Nome conferido em testDatabaseName (só [a-z0-9_]): não há entrada livre neste SQL.
      await admin.$executeRawUnsafe(`CREATE DATABASE ${database}`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, MIGRATION_DATABASE_URL: migratorUrl },
  });
}
