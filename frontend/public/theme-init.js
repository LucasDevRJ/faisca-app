// Roda antes do React. Sem escolha salva, o CSS segue o tema do sistema.
// Mantenha a chave igual a THEME_STORAGE_KEY em src/app/theme.tsx.
try {
  var theme = localStorage.getItem('faisca:theme');
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
  }
  // Paleta de cores (DEC-068): a última aplicada neste aparelho. Mantenha a chave igual a
  // PALETTE_STORAGE_KEY em src/features/profile/palettes.ts.
  var palette = localStorage.getItem('faisca:palette');
  if (palette === 'lavanda' || palette === 'oceano' || palette === 'areia' || palette === 'alto-contraste') {
    document.documentElement.dataset.palette = palette;
  }
  // Acessibilidade visual (issue #87): leitura confortável e menos movimento. Mantenha as chaves
  // iguais às de src/features/profile/accessibility.ts.
  if (localStorage.getItem('faisca:comfortable-reading') === 'true') {
    document.documentElement.dataset.comfortableReading = 'true';
  }
  if (localStorage.getItem('faisca:reduced-motion') === 'true') {
    document.documentElement.dataset.reducedMotion = 'true';
  }
} catch {
  // localStorage indisponível (modo privado etc.): fica o tema do sistema e a Sálvia.
}
