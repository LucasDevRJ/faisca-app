import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Providers } from '../app/providers';
import { routes } from '../app/router';

// Renderiza o app de verdade (rotas + providers) numa URL, sem navegador.
// Com StrictMode, como no main.tsx: efeitos montam, desmontam e montam de novo, e bugs de
// limpeza aparecem aqui também.
// Devolve o router para os testes conferirem para onde a tela navegou.
export function renderRoute(path: string, options: { state?: unknown } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { pathname, search } = new URL(path, 'http://faisca.test');
  const router = createMemoryRouter(routes, {
    initialEntries: [{ pathname, search, state: options.state }],
  });

  const result = render(
    <StrictMode>
      <Providers queryClient={queryClient}>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  );
  return { ...result, router, queryClient };
}
