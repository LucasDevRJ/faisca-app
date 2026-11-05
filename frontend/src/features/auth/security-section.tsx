import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Dialog, DialogFooter, DialogForm } from '../../components/ui/dialog';
import { PasswordField } from '../../components/ui/text-field';
import { getApiError } from './auth-api';
import { loggedOutEverywhereState } from './logged-out-everywhere';
import { SESSION_QUERY_KEY, useChangePassword, useLogoutAll, useSession } from './use-session';
import { PASSWORD_MIN, validateNewPassword } from './validation';

// "Segurança", em Conta (DEC-086): trocar a senha e sair de todos os aparelhos. Fica antes de
// "Excluir conta"; a verificação em duas etapas (#134) e a trava do app (#137) entram aqui depois.
export function SecuritySection() {
  return (
    <section aria-labelledby="security-title" className="flex flex-col gap-5">
      <h2 id="security-title" className="text-2xl font-semibold">
        Segurança
      </h2>
      <ChangePasswordForm />
      <LogoutAll />
    </section>
  );
}

type PasswordErrors = { currentPassword?: string; newPassword?: string };

// Os outros aparelhos saem da conta; este continua conectado (DEC-085).
function ChangePasswordForm() {
  const { data: user } = useSession();
  const change = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [done, setDone] = useState(false);

  const apiError = change.error ? getApiError(change.error) : null;
  // Senha atual errada e senha nova igual à atual aparecem no campo; o resto, no topo.
  const fieldFromApi: PasswordErrors = {
    currentPassword: apiError?.code === 'INVALID_PASSWORD' ? apiError.message : apiError?.fields.currentPassword,
    newPassword: apiError?.code === 'SAME_PASSWORD' ? apiError.message : apiError?.fields.newPassword,
  };
  const topError =
    apiError && !fieldFromApi.currentPassword && !fieldFromApi.newPassword ? apiError.message : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    const next: PasswordErrors = {
      currentPassword: currentPassword ? undefined : 'Digite a senha atual.',
      newPassword: validateNewPassword(newPassword),
    };
    setErrors(next);
    if (next.currentPassword || next.newPassword) return;
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('');
          setNewPassword('');
          setDone(true);
        },
      },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="change-password-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6"
    >
      <h3 id="change-password-title" className="text-xl font-semibold">
        Trocar senha
      </h3>
      {topError && <Alert tone="attention">{topError}</Alert>}
      {/* Para o gerenciador de senhas saber de qual conta é a senha nova. */}
      <input type="text" name="username" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
      <PasswordField
        label="Senha atual"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(event) => {
          setCurrentPassword(event.target.value);
          setDone(false);
          change.reset();
        }}
        error={errors.currentPassword ?? fieldFromApi.currentPassword}
      />
      <PasswordField
        label="Senha nova"
        hint={`Pelo menos ${PASSWORD_MIN} caracteres.`}
        autoComplete="new-password"
        value={newPassword}
        onChange={(event) => {
          setNewPassword(event.target.value);
          setDone(false);
          change.reset();
        }}
        error={errors.newPassword ?? fieldFromApi.newPassword}
      />
      <p className="text-muted">Ao trocar, os outros aparelhos saem da conta. Este continua conectado.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={change.isPending}>
          {change.isPending ? 'Trocando…' : 'Trocar senha'}
        </Button>
        <p role="status" className="text-sm text-muted">
          {done ? 'Pronto, senha trocada.' : ''}
        </p>
      </div>
    </form>
  );
}

function LogoutAll() {
  const [open, setOpen] = useState(false);

  return (
    <div
      role="group"
      aria-labelledby="logout-all-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6"
    >
      <h3 id="logout-all-title" className="text-xl font-semibold">
        Sair de todos os aparelhos
      </h3>
      <p className="text-muted">
        Se você entrou no Faísca em outro celular ou computador, ou acha que alguém pode estar usando a sua conta, saia
        de todos de uma vez. Neste aparelho você também vai precisar entrar de novo.
      </p>
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Sair de todos os aparelhos
        </Button>
      </div>
      {open && <LogoutAllDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

// Pede a senha (DEC-085): quem pegou o celular desbloqueado não expulsa a dona dos outros aparelhos.
function LogoutAllDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logoutAll = useLogoutAll();
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string>();

  const apiError = logoutAll.error ? getApiError(logoutAll.error) : null;
  const wrongPassword = apiError?.code === 'INVALID_PASSWORD';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setFieldError('Digite sua senha para confirmar.');
      return;
    }
    setFieldError(undefined);
    const leave = () => navigate('/entrar', { replace: true, state: loggedOutEverywhereState });
    logoutAll.mutate(password, {
      onSuccess: leave,
      // A rede caiu, mas a sessão já tinha caído (o hook conferiu e limpou o aparelho): sai também.
      onError: () => {
        if (queryClient.getQueryData(SESSION_QUERY_KEY) === null) leave();
      },
    });
  }

  return (
    <Dialog
      title="Sair de todos os aparelhos?"
      description={
        <div className="flex flex-col gap-2">
          <p>
            Todos os aparelhos, inclusive este, vão pedir o e-mail e a senha de novo. Seus registros continuam
            guardados.
          </p>
          <p>Se você acha que alguém sabe a sua senha, troque a senha também, em “Trocar senha”.</p>
        </div>
      }
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={apiError && !wrongPassword ? apiError.message : null}>
        <PasswordField
          label="Sua senha"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldError ?? (wrongPassword ? apiError.message : undefined)}
        />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={logoutAll.isPending}>
            {logoutAll.isPending ? 'Saindo…' : 'Sair de todos'}
          </Button>
        </DialogFooter>
      </DialogForm>
    </Dialog>
  );
}
