// Paletas de cores (DEC-063, DEC-068). A escolha fica na conta (vale em qualquer aparelho); a
// última aplicada também fica no aparelho, só para o app abrir já com ela, sem piscar a Sálvia.

export type Palette = 'SALVIA' | 'LAVANDA' | 'OCEANO' | 'AREIA' | 'ALTO_CONTRASTE';

// Mantenha igual à chave usada em public/theme-init.js.
export const PALETTE_STORAGE_KEY = 'faisca:palette';

export const PALETTE_OPTIONS: { value: Palette; label: string; hint: string; swatch: string }[] = [
  { value: 'SALVIA', label: 'Sálvia', hint: 'Verde suave, a de sempre', swatch: 'bg-swatch-salvia' },
  { value: 'LAVANDA', label: 'Lavanda', hint: 'Roxo suave', swatch: 'bg-swatch-lavanda' },
  { value: 'OCEANO', label: 'Oceano', hint: 'Azul calmo', swatch: 'bg-swatch-oceano' },
  { value: 'AREIA', label: 'Areia', hint: 'Terracota quente', swatch: 'bg-swatch-areia' },
  { value: 'ALTO_CONTRASTE', label: 'Alto contraste', hint: 'Para enxergar com mais facilidade', swatch: 'bg-swatch-alto-contraste' },
];

// "ALTO_CONTRASTE" → "alto-contraste", o valor de data-palette no CSS.
function slug(palette: Palette): string {
  return palette.toLowerCase().replace('_', '-');
}

// Troca as cores do app. persist = false na prévia da escolha: se a pessoa sair sem salvar, o
// aparelho continua com a paleta salva.
export function applyPalette(palette: Palette, { persist = true } = {}) {
  const root = document.documentElement;
  if (palette === 'SALVIA') delete root.dataset.palette;
  else root.dataset.palette = slug(palette);
  if (!persist) return;
  try {
    if (palette === 'SALVIA') localStorage.removeItem(PALETTE_STORAGE_KEY);
    else localStorage.setItem(PALETTE_STORAGE_KEY, slug(palette));
  } catch {
    // Sem localStorage: a paleta chega com a sessão, depois de abrir.
  }
}
