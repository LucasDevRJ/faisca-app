import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { PasswordField, TextField } from '../components/ui/text-field';
import { getApiError, signup } from '../features/auth/auth-api';
import { AuthLayout } from '../features/auth/auth-layout';
import { PASSWORD_MIN, validateEmail, validateNewPassword } from '../features/auth/validation';
import { readInviteToken } from '../features/links/invite-state';

type Errors = { name?: string; email?: string; password?: string; profiles?: string };

const profileOptions = [
  {
    key: 'patient',
    label: 'Registrar minhas atividades',
    description: 'Para quem faz terapia e quer anotar o dia a dia.',
  },
  {
    key: 'therapist',
    label: 'Acompanhar pacientes',
    description: 'Para terapeutas: ver os registros de quem compartilhar com você.',
  },
] as const;

export function SignupPage() {
  const navigate = useNavigate();
  // Cadastro pelo link do convite: "Acompanhar pacientes" já vem marcado (SPEC, "Convite por e-mail").
  const inviteToken = readInviteToken(useLocation().state);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profiles, setProfiles] = useState({ patient: false, therapist: inviteToken !== null });
  const [errors, setErrors] = useState<Errors>({});
  const mutation = useMutation({ mutationFn: signup });

  const apiError = mutation.error ? getApiError(mutation.error) : null;
  // Erros de campo vindos da API aparecem no próprio campo; os demais, no aviso do topo.
  const shownErrors: Errors = {
    name: errors.name ?? apiError?.fields.name,
    email: errors.email ?? apiError?.fields.email,
    password: errors.password ?? apiError?.fields.password,
    profiles: errors.profiles ?? apiError?.fields.profiles,
  };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Errors = {
      name: name.trim() ? undefined : 'Conta pra gente como podemos te chamar.',
      email: validateEmail(email),
      password: validateNewPassword(password),
      profiles: profiles.patient || profiles.therapist ? undefined : 'Escolha pelo menos uma opção.',
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const cleanEmail = email.trim();
    mutation.mutate(
      { name: name.trim(), email: cleanEmail, password, profiles, ...(inviteToken && { inviteToken }) },
      // O e-mail vai no state da navegação, não na URL, para não ficar no histórico.
      { onSuccess: () => navigate('/verifique-seu-email', { state: { email: cleanEmail } }) },
    );
  }

  return (
    <AuthLayout title="Criar conta" description="Leva só um minutinho.">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {inviteToken && (
          <Alert>Você está criando a conta pelo convite. Depois de confirmar o e-mail, o vínculo é feito sozinho.</Alert>
        )}
        {apiError && apiError.code !== 'VALIDATION_ERROR' && (
          <Alert tone="attention">{apiError.message}</Alert>
        )}

        <TextField
          label="Como podemos te chamar?"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={shownErrors.name}
        />
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={shownErrors.email}
        />
        <PasswordField
          label="Senha"
          autoComplete="new-password"
          hint={`Pelo menos ${PASSWORD_MIN} caracteres.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={shownErrors.password}
        />

        <fieldset
          className="flex flex-col gap-3"
          aria-describedby={shownErrors.profiles ? 'profiles-error' : undefined}
        >
          <legend className="mb-1 font-medium">Como você vai usar o Faísca?</legend>
          <p className="-mt-1 text-sm text-muted">Pode escolher as duas. Dá para mudar depois.</p>
          {profileOptions.map((option) => (
            <label
              key={option.key}
              className="flex cursor-pointer gap-3 rounded-md border border-border p-3 has-checked:border-primary"
            >
              <input
                type="checkbox"
                checked={profiles[option.key]}
                onChange={(e) => setProfiles((p) => ({ ...p, [option.key]: e.target.checked }))}
                className="mt-1 size-4 accent-primary"
              />
              <span className="flex flex-col">
                <span className="font-medium">{option.label}</span>
                <span className="text-sm text-muted">{option.description}</span>
              </span>
            </label>
          ))}
          {shownErrors.profiles && (
            <p id="profiles-error" className="text-sm text-accent-text">
              {shownErrors.profiles}
            </p>
          )}
        </fieldset>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Criando…' : 'Criar conta'}
        </Button>
      </form>

      <p className="text-sm text-muted">
        Já tem conta?{' '}
        <Link to="/entrar" className="font-medium text-primary-text underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
