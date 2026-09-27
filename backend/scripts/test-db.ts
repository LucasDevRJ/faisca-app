import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Banco de testes (DEC-026): mesmo Postgres de dev, banco separado `faisca_test`.
// Usado pelo Vitest (globalSetup) e pelo Playwright (tests/). Nunca roda em produção.

export const TEST_DATABASE = 'faisca_test';

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
    migratorUrl: withDatabase(MIGRATION_DATABASE_URL, TEST_DATABASE),
    appUrl: withDatabase(DATABASE_URL, TEST_DATABASE),
  };
}

// Cria o faisca_test (se preciso) e aplica as migrations nele, como faisca_migrator.
export async function prepareTestDatabase() {
  const { adminUrl, migratorUrl } = testDatabaseUrls();

  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });
  try {
    const rows = await admin.$queryRaw<unknown[]>`
      SELECT 1 FROM pg_database WHERE datname = ${TEST_DATABASE}`;
    if (rows.length === 0) {
      // Nome fixo e conhecido: não há entrada externa neste SQL.
      await admin.$executeRawUnsafe(`CREATE DATABASE ${TEST_DATABASE}`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, MIGRATION_DATABASE_URL: migratorUrl },
  });
}
