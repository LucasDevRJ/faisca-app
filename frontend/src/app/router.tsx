import { createBrowserRouter } from 'react-router';
import { GuestOnly, RequireAuth } from '../features/auth/route-guards';
import { CheckEmailPage } from '../pages/check-email-page';
import { ConfirmEmailPage } from '../pages/confirm-email-page';
import { ErrorPage } from '../pages/error-page';
import { ForgotPasswordPage } from '../pages/forgot-password-page';
import { HomePage } from '../pages/home-page';
import { LoginPage } from '../pages/login-page';
import { NotFoundPage } from '../pages/not-found-page';
import { ResetPasswordPage } from '../pages/reset-password-page';
import { SignupPage } from '../pages/signup-page';

// Caminhos em pt-BR, os mesmos usados nos links dos e-mails (backend/src/modules/auth/auth.emails.ts).
export const routes = [
  {
    path: '/',
    errorElement: <ErrorPage />,
    children: [
      {
        element: <RequireAuth />,
        children: [{ index: true, element: <HomePage /> }],
      },
      {
        element: <GuestOnly />,
        children: [
          { path: 'entrar', element: <LoginPage /> },
          { path: 'cadastro', element: <SignupPage /> },
          { path: 'esqueci-a-senha', element: <ForgotPasswordPage /> },
        ],
      },
      // Abertas pelos links do e-mail: funcionam com ou sem sessão.
      { path: 'verifique-seu-email', element: <CheckEmailPage /> },
      { path: 'confirmar-email', element: <ConfirmEmailPage /> },
      { path: 'redefinir-senha', element: <ResetPasswordPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
