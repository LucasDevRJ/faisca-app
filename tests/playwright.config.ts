import { defineConfig, devices } from '@playwright/test';
import { API_PORT, API_URL, WEB_PORT, WEB_URL } from './fixtures/urls.js';

// Testes de API e E2E do Faísca (DEC-026). A API sobe numa porta própria, no banco
// faisca_test, com usuários fictícios e mailer em memória (backend/scripts/e2e-server.ts).
// O front sobe com o Vite repassando /api para essa API, como em dev (DEC-023).
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
    {
      name: 'e2e',
      testDir: './e2e',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: WEB_URL,
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        trace: 'retain-on-failure',
      },
    },
  ],

  webServer: [
    {
      command: 'npm run test:e2e-server',
      cwd: '../backend',
      url: `${API_URL}/health`,
      // Sempre um servidor novo: banco recriado e rate limit zerado a cada execução.
      reuseExistingServer: false,
      timeout: 60_000,
      // Os links dos e-mails apontam para o front de testes.
      env: { E2E_API_PORT: API_PORT, FRONTEND_URL: WEB_URL },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      cwd: '../frontend',
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_PROXY_TARGET: API_URL },
    },
  ],
});
