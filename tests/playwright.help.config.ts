import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.js';
import { WEB_URL } from './fixtures/urls.js';

// Fluxo da ajuda com provedor fictício. Nenhuma chave ou chamada externa é usada.
export default defineConfig({
  ...base,
  projects: [{ name: 'help', testDir: './help', use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: WEB_URL, locale: 'pt-BR' } }],
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map((server, index) => ({
    ...server,
    timeout: 120_000,
    env: { ...server.env, ...(index === 0 ? { E2E_HELP_MOCK: 'true', HELP_ASSISTANT_ENABLED: 'true', HELP_ASSISTANT_RETENTION_CONFIRMED: 'false' } : { VITE_HELP_ASSISTANT_ENABLED: 'true' }) },
  })),
});
