import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Prefixo '' carrega também variáveis sem VITE_, que ficam só aqui no Node e não vão para o bundle.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // Service worker próprio (src/sw.ts): controla o que entra em cache e recebe o push depois.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        injectManifest: {
          // Só o shell do app. Respostas da API nunca entram em cache.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          // Fontes: só o alfabeto latino vai para o precache. Os outros (cirílico, grego...)
          // o navegador baixa sob demanda, pelo unicode-range, se algum texto precisar.
          globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-wght-*.woff2'],
        },
        manifest: {
          name: 'Faísca — Registro de Ativação',
          short_name: 'Faísca',
          description: 'Registro de atividades para a ativação comportamental.',
          lang: 'pt-BR',
          start_url: '/',
          display: 'standalone',
          background_color: '#FBF7F1',
          theme_color: '#4F6F58',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    server: {
      port: 5173,
      // Mesmo desenho da produção (vercel.json): o front chama /api no próprio domínio,
      // e o cookie de sessão fica first-party (DEC-023).
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://localhost:3333',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
