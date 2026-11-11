import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { PasswordField, TextField } from '../components/ui/text-field';
import { getApiError, resendConfirmation } from '../features/auth/auth-api';
import { AuthLayout } from '../features/auth/auth-layout';
import { readAccountDeleted } from '../features/auth/account-deleted';
import { readLoggedOutEverywhere } from '../features/auth/logged-out-everywhere';
import { readSessionEnded } from '../features/auth/session-ended';
import type { TwoFactorLoginStep } from '../features/auth/two-factor-api';
import { TwoFactorLogin } from '../features/auth/two-factor-login';
import { SESSION_ENDED_KEY, safeNextPath, useLogin } from '../features/auth/use-session';
import { validateEmail } from '../features/auth/validation';
import { inviteState, readInviteToken } from '../features/links/invite-state';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Vindo do convite: o token volta para /convite junto com a pessoa, depois do login.
  const location = useLocation();
  const invite = inviteState(readInviteToken(location.state));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const login = useLogin();
  // Com 2FA, a senha certa abre o passo do código (DEC-092); a sessão só abre depois dele.
  const [twoFactor, setTwoFactor] = useState<TwoFactorLoginStep | null>(null);
  const [restartMessage, setRestartMessage] = useState('');
  const restartRef = useRef<HTMLDivElement>(null);

  // Voltou do passo do código porque ele venceu: o foco vai para o aviso, que diz por quê.
  useEffect(() => {
    if (restartMessage) restartRef.current?.focus();
  }, [restartMessage]);
  // Acabou de excluir a conta (DEC-035): o aviso some quando a pessoa tenta entrar.
  const accountDeleted = readAccountDeleted(location.state) && login.isIdle;
  // Acabou de sair de todos os aparelhos (DEC-085): some do mesmo jeito.
  const loggedOutEverywhere = readLoggedOutEverywhere(location.state) && login.isIdle;
  // A sessão terminou sem a pessoa pedir, por exemplo por "Sair de todos" em outro aparelho (DEC-088).
  const sessionEnded = readSessionEnded(location.state) && login.isIdle;
  const sessionEndedRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const arrivedFromEndedSession = readSessionEnded(location.state);

  // A pessoa não pediu para sair: o foco vai para o aviso, para o leitor de tela dizer por quê. A
  // marca é apagada aqui, para não reaparecer numa saída que ela mesma pedir depois.
  useEffect(() => {
    if (!arrivedFromEndedSession) return;
    sessionEndedRef.current?.focus();
    queryClient.removeQueries({ queryKey: SESSION_ENDED_KEY, exact: true });
  }, [arrivedFromEndedSession, queryClient]);
  const resend = useMutation({ mutationFn: resendConfirmation });

  const apiError = login.error ? getApiError(login.error) : null;
  const notConfirmed = apiError?.code === 'EMAIL_NOT_CONFIRMED';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = {
      email: validateEmail(email),
      password: password ? undefined : 'Informe sua senha.',
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    resend.reset();
    setRestartMessage('');
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (result) => {
          if ('twoFactor' in result) setTwoFactor(result.twoFactor);
          else goToApp();
        },
      },
    );
  }

  function goToApp() {
    navigate(safeNextPath(searchParams.get('next')), { replace: true, state: invite });
  }

  if (twoFactor) {
    return (
      <AuthLayout title="Confirme que é você">
        <TwoFactorLogin
          step={twoFactor}
          onDone={goToApp}
          onRestart={(message) => {
            setTwoFactor(null);
            setPassword('');
            login.reset();
            setRestartMessage(message ?? '');
          }}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Que bom te ver" description="Entre para continuar seus registros.">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {accountDeleted && <Alert>Sua conta foi excluída. Obrigado por ter usado o Faísca.</Alert>}
        {loggedOutEverywhere && <Alert>Pronto, você saiu de todos os aparelhos. Entre de novo para continuar.</Alert>}
        {sessionEnded && (
          <div ref={sessionEndedRef} tabIndex={-1} className="rounded-md focus:outline-none">
            <Alert>Sua sessão terminou. Entre de novo para continuar.</Alert>
          </div>
        )}
        {restartMessage && (
          <div ref={restartRef} tabIndex={-1} className="rounded-md focus:outline-none">
            <Alert tone="attention">{restartMessage}</Alert>
          </div>
        )}
        {apiError && !notConfirmed && <Alert tone="attention">{apiError.message}</Alert>}

        {notConfirmed && (
          <Alert tone="attention">
            <div className="flex flex-col gap-3">
              <p>{apiError.message}</p>
              {resend.isSuccess ? (
                <p>Enviamos um novo link. Pode levar alguns minutos para chegar.</p>
              ) : (
                <div>
                  <Button
                    variant="secondary"
                    disabled={resend.isPending}
                    onClick={() => resend.mutate(email.trim())}
                  >
                    Reenviar e-mail de confirmação
                  </Button>
                </div>
              )}
              {resend.isError && <p>{getApiError(resend.error).message}</p>}
            </div>
          </Alert>
        )}

        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <PasswordField
          label="Senha"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />

        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>

      <div className="flex flex-col gap-2 text-sm">
        <Link to="/esqueci-a-senha" className={linkClass}>
          Esqueci minha senha
        </Link>
        <p className="text-muted">
          Ainda não tem conta?{' '}
          <Link to="/cadastro" state={invite} className={linkClass}>
            Criar conta
          </Link>
        </p>
        <Link to="/privacidade" className={`${linkClass} self-start`}>
          Aviso de privacidade
        </Link>
      </div>
    </AuthLayout>
  );
}
