import { defineConfig } from 'vitest/config';
import { testDatabaseUrls } from './scripts/test-db.js';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Cria o faisca_test e aplica as migrations antes de tudo (DEC-026).
    globalSetup: ['scripts/vitest-global-setup.ts'],
    // Os arquivos de teste compartilham o mesmo banco, então rodam um de cada vez.
    fileParallelism: false,
    // O bcrypt (custo 12) é lento de propósito: ~350 ms por senha no CI. Testes de rate limit
    // verificam mais de dez senhas, e o padrão de 5 s ficava no limite.
    testTimeout: 20_000,
    // O beforeEach limpa o banco e cria usuários com senha (bcrypt): no fim da suíte cheia, ele
    // passou dos 10 s padrão em 20 e 21/10/2026 e derrubou o teste seguinte. Mesmo teto dos testes.
    hookTimeout: 20_000,
    // Segredos fictícios, válidos só nos testes. O mailer é trocado por um em memória.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      FRONTEND_URL: 'http://localhost:5173',
      DATABASE_URL: testDatabaseUrls().appUrl,
      JWT_SECRET: 'segredo-ficticio-so-para-testes-0123456789',
      LINK_CODE_SECRET: 'segredo-ficticio-dos-codigos-de-vinculo-0123',
      RESEND_API_KEY: 're_ficticio_testes',
      EMAIL_FROM: 'Faísca <testes@faisca.test>',
    },
  },
});
