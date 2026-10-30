import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from '../components/ui/button-styles';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { PasswordField } from '../components/ui/text-field';
import { confirmEmail, getApiError } from '../features/auth/auth-api';
import { AuthLayout } from '../features/auth/auth-layout';
import { useLinkToken } from '../features/auth/use-link-token';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';
// Links soltos, fora de frase: 44 px de altura para o toque.
const standaloneLinkClass = `inline-flex min-h-11 items-center ${linkClass}`;

// Aberta pelo link do e-mail. Confirma por POST (DEC-025) e não cria sessão: depois de
// confirmar, a pessoa entra pelo botão. Pede a senha do cadastro (DEC-072): se outra pessoa se
// cadastrou com o mesmo e-mail, o link dela só confirma com a senha dela, e a conta não fica com
// quem não é dono do e-mail.
export function ConfirmEmailPage() {
  const token = useLinkToken();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const mutation = useMutation({ mutationFn: confirmEmail });
  const enterLink = useRef<HTMLAnchorElement>(null);

  // Confirmado: o formulário some, então o foco vai para o próximo passo, e não para o começo da
  // página (o leitor de tela lê o botão "Entrar").
  useEffect(() => {
    if (mutation.isSuccess) enterLink.current?.focus();
  }, [mutation.isSuccess]);

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
        <Link ref={enterLink} to="/entrar" className={buttonClasses()}>
          Entrar
        </Link>
      </AuthLayout>
    );
  }

  const apiError = mutation.error ? getApiError(mutation.error) : null;
  if (apiError?.code === 'INVALID_TOKEN') {
    return (
      <AuthLayout title="Não deu para confirmar">
        <Alert tone="attention">
          Este link já foi usado ou expirou. Se você já confirmou, é só entrar. Se não, faça o cadastro de novo para
          receber um link novo.
        </Alert>
        <div className="flex flex-wrap gap-x-6">
          <Link to="/entrar" className={standaloneLinkClass}>
            Ir para entrar
          </Link>
          <Link to="/cadastro" className={standaloneLinkClass}>
            Fazer o cadastro
          </Link>
        </div>
      </AuthLayout>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setError('Digite a senha que você escolheu no cadastro.');
      return;
    }
    setError(undefined);
    if (token) mutation.mutate({ token, password });
  }

  // Senha que não confere: o aviso vai no alerta (o leitor de tela anuncia) e o campo fica marcado,
  // para corrigir e tentar de novo (o link não se gasta).
  const fieldError = error ?? (apiError?.code === 'WRONG_SIGNUP_PASSWORD' ? 'Confira a senha e tente de novo.' : undefined);

  return (
    <AuthLayout
      title="Confirme seu e-mail"
      description="Para terminar, digite a senha que você escolheu ao criar a conta."
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {apiError && <Alert tone="attention">{apiError.message}</Alert>}
        <PasswordField
          label="Senha do cadastro"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldError}
        />
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Confirmando…' : 'Confirmar e-mail'}
        </Button>
        <p className="text-sm text-muted">
          Esqueceu a senha?{' '}
          <Link to="/esqueci-a-senha" className={linkClass}>
            Crie uma nova
          </Link>
          : isso também confirma o seu e-mail.
        </p>
      </form>
    </AuthLayout>
  );
}
