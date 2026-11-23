import { useEffect } from 'react';
import { useSession } from '../auth/use-session';

export const highlights = {
  palette: 'Cor da paleta',
  ocean: 'Azul oceano',
  lavender: 'Roxo lavanda',
  terracotta: 'Terracota',
} as const;
export type Highlight = keyof typeof highlights;
const storageKey = (id: string) => `faisca:highlight:${id}`;

export function readHighlight(id: string): Highlight {
  try {
    const value = localStorage.getItem(storageKey(id));
    if (value && Object.hasOwn(highlights, value)) return value as Highlight;
  } catch {
    // A cor da paleta é o padrão quando o navegador bloqueia o armazenamento.
  }
  return 'palette';
}

function applyHighlight(value: Highlight) {
  document.documentElement.dataset.highlight = value;
}

export function saveHighlight(id: string, value: Highlight) {
  if (value === 'palette') localStorage.removeItem(storageKey(id));
  else localStorage.setItem(storageKey(id), value);
  applyHighlight(value);
}

export function useHighlightFromSession() {
  const { data: user } = useSession();
  const id = user?.id;
  useEffect(() => {
    applyHighlight(id ? readHighlight(id) : 'palette');
  }, [id]);
}
