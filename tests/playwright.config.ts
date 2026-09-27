import { defineConfig } from '@playwright/test';

// Testes de API e E2E do Faísca (DEC-026). A API sobe numa porta própria, no banco
// faisca_test, com usuários fictícios e mailer em memória (backend/scripts/e2e-server.ts).
const API_PORT = process.env.E2E_API_PORT ?? '3334';
export const API_URL = `http://localhost:${API_PORT}`;

export default defineConfig({
  // Os testes compartilham o mesmo banco e o mesmo servidor; um de cada vez evita interferência.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  projects: [
    {
      name: 'api',
      testDir: './api',
      use: { baseURL: API_URL },
    },
    // O projeto 'e2e' (navegador) entra junto com as telas de autenticação.
  ],

  webServer: {
    command: 'npm run test:e2e-server',
    cwd: '../backend',
    url: `${API_URL}/health`,
    // Sempre um servidor novo: banco recriado e rate limit zerado a cada execução.
    reuseExistingServer: false,
    timeout: 60_000,
    env: { E2E_API_PORT: API_PORT },
  },
});
