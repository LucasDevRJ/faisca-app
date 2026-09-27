import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Separado do vite.config.ts para os testes não carregarem o plugin do PWA.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    css: false,
    // Os testes digitam formulários inteiros com o userEvent, no StrictMode e com os arquivos
    // em paralelo. Alguns passam dos 5 s padrão na máquina local e no CI.
    testTimeout: 15_000,
  },
});
