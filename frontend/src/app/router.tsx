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
import { PrivacyPage } from '../pages/privacy-page';
import { PatientsPage } from '../pages/patients-page';
import { RecordsPage } from '../pages/records-page';
import { EditThoughtRecordPage, NewThoughtRecordPage } from '../pages/thought-record-form-page';
import { ThoughtsPage } from '../pages/thoughts-page';
import { EditTensionEpisodePage, NewTensionEpisodePage } from '../pages/tension-episode-form-page';
import { TensionPage } from '../pages/tension-page';
import { ResetPasswordPage } from '../pages/reset-password-page';
import { SignupPage } from '../pages/signup-page';
import { AppLayout } from './app-layout';
import { PatientTabsLayout } from './patient-tabs-layout';

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
                  // Atividades, Pensamentos e Tensão em abas (DEC-040, DEC-043).
                  {
                    element: <PatientTabsLayout />,
                    children: [
                      { path: 'registros', element: <RecordsPage /> },
                      { path: 'pensamentos', element: <ThoughtsPage /> },
                      { path: 'tensao', element: <TensionPage /> },
                    ],
                  },
                  { path: 'pensamentos/novo', element: <NewThoughtRecordPage /> },
                  { path: 'pensamentos/:id/editar', element: <EditThoughtRecordPage /> },
                  { path: 'tensao/novo', element: <NewTensionEpisodePage /> },
                  { path: 'tensao/:id/editar', element: <EditTensionEpisodePage /> },
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
      // Pública: o cadastro linka para cá antes de existir conta (DEC-036).
      { path: 'privacidade', element: <PrivacyPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
