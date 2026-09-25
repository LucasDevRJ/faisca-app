import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// A CLI do Prisma (migrate, studio) usa sempre o faisca_migrator (DDL).
// A API em runtime usa o faisca_app (DML), via adapter em src/lib/prisma.ts.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Vazio é aceito no `prisma generate`, que não conecta no banco.
    url: process.env.MIGRATION_DATABASE_URL ?? '',
  },
});
