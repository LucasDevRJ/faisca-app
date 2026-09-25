// Roda antes do React. Sem escolha salva, o CSS segue o tema do sistema.
// Mantenha a chave igual a THEME_STORAGE_KEY em src/app/theme.tsx.
try {
  var theme = localStorage.getItem('faisca:theme');
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
  }
} catch {
  // localStorage indisponível (modo privado etc.): fica o tema do sistema.
}
