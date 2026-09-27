import { useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { getApiError, resendConfirmation } from '../features/auth/auth-api';
import { AuthLayout } from '../features/auth/auth-layout';

// Depois do cadastro. O e-mail chega pelo state da navegação; sem ele (página recarregada
// ou aberta direto), a tela continua útil, só sem o botão de reenviar.
export function CheckEmailPage() {
  const location = useLocation();
  const state = location.state as { email?: unknown } | null;
  const email = typeof state?.email === 'string' ? state.email : null;
  const resend = useMutation({ mutationFn: resendConfirmation });

  return (
    <AuthLayout
      title="Confira seu e-mail"
      description={
        email
          ? `Se estiver tudo certo, enviamos um link de confirmação para ${email}.`
          : 'Se estiver tudo certo, enviamos um link de confirmação para o seu e-mail.'
      }
    >
      <p>Abra a mensagem do Faísca e toque no botão para confirmar. O link vale por 24 horas.</p>
      <p className="text-sm text-muted">Não achou? Dê uma olhada também no spam ou nas promoções.</p>

      {email &&
        (resend.isSuccess ? (
          <Alert>Enviamos de novo. Pode levar alguns minutos para chegar.</Alert>
        ) : (
          <div className="flex flex-col gap-3">
            {resend.isError && <Alert tone="attention">{getApiError(resend.error).message}</Alert>}
            <div>
              <Button variant="secondary" disabled={resend.isPending} onClick={() => resend.mutate(email)}>
                Reenviar e-mail
              </Button>
            </div>
          </div>
        ))}

      <Link to="/entrar" className="font-medium text-primary-text underline underline-offset-4">
        Voltar para entrar
      </Link>
    </AuthLayout>
  );
}
