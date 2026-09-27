import { defineConfig } from 'vitest/config';
import { testDatabaseUrls } from './scripts/test-db.js';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Cria o faisca_test e aplica as migrations antes de tudo (DEC-026).
    globalSetup: ['scripts/vitest-global-setup.ts'],
    // Os arquivos de teste compartilham o mesmo banco, então rodam um de cada vez.
    fileParallelism: false,
    // Segredos fictícios, válidos só nos testes. O mailer é trocado por um em memória.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      FRONTEND_URL: 'http://localhost:5173',
      DATABASE_URL: testDatabaseUrls().appUrl,
      JWT_SECRET: 'segredo-ficticio-so-para-testes-0123456789',
      RESEND_API_KEY: 're_ficticio_testes',
      EMAIL_FROM: 'Faísca <testes@faisca.test>',
    },
  },
});
