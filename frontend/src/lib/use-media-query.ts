import { useSyncExternalStore } from 'react';

// Acompanha uma media query (ex.: a largura da tela). Sem matchMedia (testes, SSR), devolve false.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = typeof window !== 'undefined' ? window.matchMedia?.(query) : undefined;
      media?.addEventListener('change', onChange);
      return () => media?.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia?.(query).matches) || false,
    () => false,
  );
}
