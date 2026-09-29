import { createBrowserRouter } from 'react-router';
import { GuestOnly, HomeRedirect, RequireAuth, RequireProfile } from '../features/auth/route-guards';
import { CheckEmailPage } from '../pages/check-email-page';
import { AppointmentsPage } from '../pages/appointments-page';
import { AccountPage } from '../pages/account-page';
import { ConfirmEmailPage } from '../pages/confirm-email-page';
import { InvitePage } from '../pages/invite-page';
import { ErrorPage } from '../pages/error-page';
import { ForgotPasswordPage } from '../pages/forgot-password-page';
import { LoginPage } from '../pages/login-page';
import { NotFoundPage } from '../pages/not-found-page';
import { PatientPage } from '../pages/patient-page';
import { PatientsPage } from '../pages/patients-page';
import { RecordsPage } from '../pages/records-page';
import { ResetPasswordPage } from '../pages/reset-password-page';
import { SignupPage } from '../pages/signup-page';
import { AppLayout } from './app-layout';

// Caminhos em pt-BR, os mesmos usados nos links dos e-mails (backend/src/modules/auth/auth.emails.ts).
export const routes = [
  {
    path: '/',
    errorElement: <ErrorPage />,
    children: [
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <HomeRedirect /> },
          {
            element: <AppLayout />,
            children: [
              { path: 'conta', element: <AccountPage /> },
              {
                element: <RequireProfile profile="patient" />,
                children: [
                  { path: 'registros', element: <RecordsPage /> },
                  { path: 'consultas', element: <AppointmentsPage /> },
                ],
              },
              {
                element: <RequireProfile profile="therapist" />,
                children: [
                  { path: 'pacientes', element: <PatientsPage /> },
                  { path: 'pacientes/:patientId', element: <PatientPage /> },
                ],
              },
            ],
          },
        ],
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
      { path: 'convite', element: <InvitePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
