import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { TextField } from '../components/ui/text-field';
import { forgotPassword, getApiError } from '../features/auth/auth-api';
import { AuthLayout } from '../features/auth/auth-layout';
import { validateEmail } from '../features/auth/validation';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const mutation = useMutation({ mutationFn: forgotPassword });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emailError = validateEmail(email);
    setError(emailError);
    if (!emailError) mutation.mutate(email.trim());
  }

  // A resposta é a mesma exista ou não a conta (DEC-025), e o texto acompanha isso.
  if (mutation.isSuccess) {
    return (
      <AuthLayout title="Confira seu e-mail">
        <p>
          Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. Ele vale por
          1 hora.
        </p>
        <p className="text-sm text-muted">Não achou? Dê uma olhada também no spam ou nas promoções.</p>
        <Link to="/entrar" className={linkClass}>
          Voltar para entrar
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Esqueceu a senha?"
      description="Acontece. Informe seu e-mail e enviamos um link para você criar uma nova."
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {mutation.isError && <Alert tone="attention">{getApiError(mutation.error).message}</Alert>}
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
        />
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Enviando…' : 'Enviar link'}
        </Button>
      </form>
      <Link to="/entrar" className={`text-sm ${linkClass}`}>
        Voltar para entrar
      </Link>
    </AuthLayout>
  );
}
