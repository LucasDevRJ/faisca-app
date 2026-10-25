import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { usePaletteFromSession } from '../features/profile/use-profile';
import { createQueryClient } from '../lib/query-client';
import { ThemeProvider } from './theme-provider';

// Antes das telas: assim a prévia da paleta no perfil (que roda depois) prevalece enquanto aberta.
function PaletteSync() {
  usePaletteFromSession();
  return null;
}

export function Providers({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  // useState garante um único QueryClient por montagem do app.
  const [client] = useState(() => queryClient ?? createQueryClient());

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <PaletteSync />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
