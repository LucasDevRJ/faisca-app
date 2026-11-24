// Recorta um texto longo em volta do realce, sem cortar palavras, para a palavra encontrada nunca
// ficar escondida pelo limite de linhas (ex.: título de um Pensamento muito longo, #305).
export function cropAround(text: string, match: { start: number; length: number }, size = 140) {
  if (text.length <= size) return { text, start: match.start };
  let from = Math.max(0, match.start - Math.floor(size / 3));
  let to = Math.min(text.length, Math.max(from + size, match.start + match.length));
  if (from > 0) {
    const space = text.indexOf(' ', from);
    if (space >= 0 && space < match.start) from = space + 1;
  }
  if (to < text.length) {
    const space = text.lastIndexOf(' ', to);
    if (space > match.start + match.length) to = space;
  }
  const prefix = from > 0 ? '…' : '';
  return { text: `${prefix}${text.slice(from, to)}${to < text.length ? '…' : ''}`, start: match.start - from + prefix.length };
}
