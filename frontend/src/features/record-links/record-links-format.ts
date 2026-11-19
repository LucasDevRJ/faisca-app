const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// A API envia o dia em ISO (AAAA-MM-DD), já sem horário ou fuso.
export function formatRecordDate(date: string): string {
  const match = DATE_ONLY.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

// Prévia local e previsível: usa a primeira frase curta ou um trecho no limite de palavras.
// Não tenta interpretar nem reescrever o conteúdo clínico do registro.
export function recordTitlePreview(title: string, maxLength = 56): string {
  const normalized = title.replace(/\s+/gu, ' ').trim();
  const characters = Array.from(normalized);
  const limit = Math.max(1, Math.floor(maxLength));
  if (characters.length <= limit) return normalized;

  const sentenceEnd = characters.findIndex((character, index) =>
    /[.!?]/u.test(character) && (index === characters.length - 1 || /\s/u.test(characters[index + 1] ?? '')),
  );
  if (sentenceEnd >= 0 && sentenceEnd + 1 <= limit) {
    return characters.slice(0, sentenceEnd + 1).join('');
  }

  const preview = characters.slice(0, limit);
  const lastSpace = preview.lastIndexOf(' ');
  const end = lastSpace >= limit * 0.5 ? lastSpace : limit;
  return `${preview.slice(0, end).join('').trimEnd()}…`;
}
