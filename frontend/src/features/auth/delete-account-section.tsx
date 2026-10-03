import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/button';
import { Dialog, DialogFooter, DialogForm } from '../../components/ui/dialog';
import { PasswordField } from '../../components/ui/text-field';
import { accountDeletedState } from './account-deleted';
import { getApiError } from './auth-api';
import { useDeleteAccount } from './use-session';

// SPEC ("Privacidade"), DEC-035: excluir a conta apaga tudo. Fica no fim de "Conta", discreto,
// e só acontece depois de confirmar com a senha.
export function DeleteAccountSection({ isPatient }: { isPatient: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <section aria-labelledby="delete-account-title" className="flex flex-col gap-3 border-t border-border pt-6">
      <h2 id="delete-account-title" className="text-2xl font-semibold">
        Excluir conta
      </h2>
      <p className="text-muted">
        Apaga sua conta e tudo o que está nela. Não dá para desfazer. Veja também o{' '}
        <Link to="/privacidade" className="font-medium text-primary-text underline underline-offset-4">
          aviso de privacidade
        </Link>
        .
      </p>
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Excluir minha conta
        </Button>
      </div>
      {open && <DeleteAccountDialog isPatient={isPatient} onClose={() => setOpen(false)} />}
    </section>
  );
}

function DeleteAccountDialog({ isPatient, onClose }: { isPatient: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const deleteAccount = useDeleteAccount();
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string>();

  const apiError = deleteAccount.error ? getApiError(deleteAccount.error) : null;
  // Senha errada aparece no campo; outros erros (conexão, muitas tentativas), no topo.
  const wrongPassword = apiError?.code === 'INVALID_PASSWORD';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setFieldError('Digite sua senha para confirmar.');
      return;
    }
    setFieldError(undefined);
    deleteAccount.mutate(password, {
      onSuccess: () => navigate('/entrar', { replace: true, state: accountDeletedState }),
    });
  }

  return (
    <Dialog
      title="Excluir sua conta?"
      description={
        <div className="flex flex-col gap-2">
          <p>Tudo isto some de vez, e não dá para recuperar:</p>
          <ul className="list-disc pl-5">
            {isPatient && <li>suas atividades, notas e observações;</li>}
            {isPatient && <li>seu Registro de Pensamentos;</li>}
            {isPatient && <li>seus Episódios de tensão;</li>}
            {isPatient && <li>suas consultas;</li>}
            <li>seus vínculos: quem acompanha você, ou quem você acompanha, perde o acesso na hora.</li>
          </ul>
          <p>Mandamos um e-mail avisando que a conta foi excluída.</p>
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
          <Button type="submit" disabled={deleteAccount.isPending}>
            {deleteAccount.isPending ? 'Excluindo…' : 'Excluir minha conta'}
          </Button>
        </DialogFooter>
      </DialogForm>
    </Dialog>
  );
}
