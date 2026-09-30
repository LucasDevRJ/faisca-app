import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { PasswordField, TextField } from '../components/ui/text-field';
import { getApiError, resendConfirmation } from '../features/auth/auth-api';
import { AuthLayout } from '../features/auth/auth-layout';
import { readAccountDeleted } from '../features/auth/account-deleted';
import { safeNextPath, useLogin } from '../features/auth/use-session';
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
  // Acabou de excluir a conta (DEC-035): o aviso some quando a pessoa tenta entrar.
  const accountDeleted = readAccountDeleted(location.state) && login.isIdle;
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
    login.mutate(
      { email: email.trim(), password },
      { onSuccess: () => navigate(safeNextPath(searchParams.get('next')), { replace: true, state: invite }) },
    );
  }

  return (
    <AuthLayout title="Que bom te ver" description="Entre para continuar seus registros.">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {accountDeleted && <Alert>Sua conta foi excluída. Obrigado por ter usado o Faísca.</Alert>}
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
