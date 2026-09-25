import { createBrowserRouter } from 'react-router';
import { ErrorPage } from '../pages/error-page';
import { HomePage } from '../pages/home-page';
import { NotFoundPage } from '../pages/not-found-page';

// As telas reais (login, semana, atividades...) entram aqui junto com cada funcionalidade.
export const routes = [
  {
    path: '/',
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
