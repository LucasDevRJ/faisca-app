import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { THEME_STORAGE_KEY, ThemeContext, type ThemePreference } from './theme-context';

// localStorage aqui guarda só a preferência visual. Token de sessão nunca (fica no cookie httpOnly).
function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);

  useEffect(() => {
    const root = document.documentElement;
    try {
      if (preference === 'system') {
        delete root.dataset.theme;
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        root.dataset.theme = preference;
        localStorage.setItem(THEME_STORAGE_KEY, preference);
      }
    } catch {
      // Sem localStorage a escolha vale só até recarregar a página.
    }
  }, [preference]);

  const value = useMemo(() => ({ preference, setPreference }), [preference]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
