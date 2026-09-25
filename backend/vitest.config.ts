import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Valores fictícios só para o env.ts validar. Os testes atuais não acessam o banco.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      FRONTEND_URL: 'http://localhost:5173',
      DATABASE_URL: 'postgresql://faisca_app:test@localhost:5432/faisca_test',
    },
  },
});
