import { createContext, useContext } from 'react';

// 'system' = segue o tema do sistema operacional (sem data-theme no <html>).
export type ThemePreference = 'system' | 'light' | 'dark';

// Mantenha igual à chave usada em public/theme-init.js.
export const THEME_STORAGE_KEY = 'faisca:theme';

export type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme precisa estar dentro do ThemeProvider.');
  return context;
}
