import { useState, type FormEvent } from 'react';
import { Dialog, DialogActions, DialogForm } from '../../components/ui/dialog';
import { TextField } from '../../components/ui/text-field';
import { getApiError } from '../auth/auth-api';
import { validateEmail } from '../auth/validation';
import { useCreateInvite, useRevokeLink } from './use-links';

// Convite por e-mail (SPEC, "Convite por e-mail"): o link vai para o endereço escolhido.
export function InviteDialog({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const create = useCreateInvite();
  const apiError = create.error ? getApiError(create.error) : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validateEmail(email);
    setError(invalid);
    if (invalid) return;
    create.mutate(email.trim(), {
      onSuccess: () => {
        onSent();
        onClose();
      },
    });
  }

  return (
    <Dialog
      title="Convidar por e-mail"
      description="Enviamos um link para esse e-mail. Quem abrir entra (ou cria uma conta) e o vínculo é feito na hora."
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={apiError && !apiError.fields.email ? apiError.message : null}>
        <TextField
          label="E-mail de quem acompanha sua terapia"
          type="email"
          autoComplete="off"
          inputMode="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            create.reset();
          }}
          error={error ?? apiError?.fields.email}
        />
        <DialogActions submitLabel="Enviar convite" pending={create.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

// Desfazer é imediato (SPEC): a confirmação diz isso antes, sem tom de alarme.
export function RevokeLinkDialog({ therapistName, onClose }: { therapistName: string; onClose: () => void }) {
  const revoke = useRevokeLink();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    revoke.mutate(undefined, { onSuccess: onClose });
  }

  return (
    <Dialog
      title="Desfazer o vínculo?"
      description={`${therapistName} deixa de ver seus registros na hora. Se mudar de ideia, dá para criar um vínculo novo depois.`}
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={revoke.error ? getApiError(revoke.error).message : null}>
        <DialogActions submitLabel="Desfazer" pending={revoke.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}
