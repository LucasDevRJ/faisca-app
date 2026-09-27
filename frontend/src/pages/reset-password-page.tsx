import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from '../components/ui/button-styles';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { PasswordField } from '../components/ui/text-field';
import { getApiError, resetPassword } from '../features/auth/auth-api';
import { AuthLayout } from '../features/auth/auth-layout';
import { useLinkToken } from '../features/auth/use-link-token';
import { SESSION_QUERY_KEY } from '../features/auth/use-session';
import { PASSWORD_MIN, validateNewPassword } from '../features/auth/validation';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

export function ResetPasswordPage() {
  const token = useLinkToken();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({});
  const mutation = useMutation({
    mutationFn: resetPassword,
    // A API derruba todas as sessões abertas; a deste navegador também deixa de valer.
    onSuccess: () => queryClient.setQueryData(SESSION_QUERY_KEY, null),
  });

  if (!token) {
    return (
      <AuthLayout title="Link incompleto">
        <p>Este endereço não tem o código para criar uma nova senha. Abra o link direto do e-mail.</p>
        <Link to="/esqueci-a-senha" className={linkClass}>
          Pedir um link novo
        </Link>
      </AuthLayout>
    );
  }

  if (mutation.isSuccess) {
    return (
      <AuthLayout title="Senha nova criada" description="Por segurança, saímos da sua conta em todos os aparelhos.">
        <Link
          to="/entrar"
          className={buttonClasses()}
        >
          Entrar com a senha nova
        </Link>
      </AuthLayout>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = {
      password: validateNewPassword(password),
      confirmation: confirmation === password ? undefined : 'As duas senhas não estão iguais.',
    };
    setErrors(next);
    if (!next.password && !next.confirmation && token) mutation.mutate({ token, password });
  }

  const apiError = mutation.error ? getApiError(mutation.error) : null;

  return (
    <AuthLayout title="Criar uma nova senha">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {apiError && (
          <Alert tone="attention">
            {apiError.code === 'INVALID_TOKEN' ? (
              <>
                Este link já foi usado ou expirou.{' '}
                <Link to="/esqueci-a-senha" className={linkClass}>
                  Peça um link novo
                </Link>
                .
              </>
            ) : (
              (apiError.fields.password ?? apiError.message)
            )}
          </Alert>
        )}
        <PasswordField
          label="Nova senha"
          autoComplete="new-password"
          hint={`Pelo menos ${PASSWORD_MIN} caracteres.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <PasswordField
          label="Repita a nova senha"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          error={errors.confirmation}
        />
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvando…' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthLayout>
  );
}
