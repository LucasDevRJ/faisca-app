import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from '../components/ui/button-styles';
import { Alert } from '../components/ui/alert';
import { confirmEmail, getApiError } from '../features/auth/auth-api';
import { AuthLayout } from '../features/auth/auth-layout';
import { useLinkToken } from '../features/auth/use-link-token';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

// Aberta pelo link do e-mail. Confirma por POST (DEC-025) e não cria sessão:
// depois de confirmar, a pessoa entra pelo botão.
export function ConfirmEmailPage() {
  const token = useLinkToken();
  const mutation = useMutation({ mutationFn: confirmEmail });
  const { mutate } = mutation;
  // O token vale uma vez: o ref impede um segundo envio (ex.: efeito duplo do StrictMode).
  const sent = useRef(false);

  useEffect(() => {
    if (token && !sent.current) {
      sent.current = true;
      mutate(token);
    }
  }, [token, mutate]);

  if (!token) {
    return (
      <AuthLayout title="Link incompleto">
        <p>Este endereço não tem o código de confirmação. Abra o link direto do e-mail do Faísca.</p>
        <Link to="/entrar" className={linkClass}>
          Ir para entrar
        </Link>
      </AuthLayout>
    );
  }

  if (mutation.isSuccess) {
    return (
      <AuthLayout title="E-mail confirmado" description="Tudo pronto! Agora é só entrar na sua conta.">
        <Link
          to="/entrar"
          className={buttonClasses()}
        >
          Entrar
        </Link>
      </AuthLayout>
    );
  }

  if (mutation.isError) {
    const { code, message } = getApiError(mutation.error);
    return (
      <AuthLayout title="Não deu para confirmar">
        <Alert tone="attention">
          {code === 'INVALID_TOKEN'
            ? 'Este link já foi usado ou expirou. Se você já confirmou, é só entrar. Se não, entre com seu e-mail e senha para receber um link novo.'
            : message}
        </Alert>
        <Link to="/entrar" className={linkClass}>
          Ir para entrar
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Confirmando seu e-mail…">
      <p className="text-muted" aria-busy="true">
        Só um instante.
      </p>
    </AuthLayout>
  );
}
