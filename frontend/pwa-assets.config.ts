import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Gera os PNGs do PWA a partir do SVG: `npm run icons`.
// O ícone atual é provisório; ao trocar o public/icon.svg, rode o script de novo.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#4F6F58' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#4F6F58' } },
  },
  images: ['public/icon.svg'],
});
