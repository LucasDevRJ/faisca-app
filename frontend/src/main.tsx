import '@fontsource-variable/inter';
import '@fontsource-variable/nunito';
import './styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { Providers } from './app/providers';
import { router } from './app/router';
import { UpdatePrompt } from './app/update-prompt';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Elemento #root não encontrado no index.html.');

createRoot(rootElement).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
      <UpdatePrompt />
    </Providers>
  </StrictMode>,
);
