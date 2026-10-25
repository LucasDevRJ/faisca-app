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
} catch {
  // localStorage indisponível (modo privado etc.): fica o tema do sistema e a Sálvia.
}
