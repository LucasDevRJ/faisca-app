import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogActions, DialogFooter, DialogForm } from '../../components/ui/dialog';
import { TextAreaField } from '../../components/ui/text-field';
import { NOTICE_MAX, noticeApiMessage, noticeBodyError, type Notice } from './notices-api';
import { useDeleteNotice, useUpdateNotice } from './use-notices';

export function EditNoticeDialog({ notice, onClose }: { notice: Notice; onClose: (saved: boolean) => void }) {
  const update = useUpdateNotice();
  const [body, setBody] = useState(notice.body);
  const [fieldError, setFieldError] = useState<string>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = noticeBodyError(body);
    setFieldError(error);
    if (error) return;
    update.mutate({ id: notice.id, body: body.trim() }, { onSuccess: () => onClose(true) });
  }

  return (
    <Dialog title="Editar aviso" description="A mudança aparece para todos os seus pacientes." onClose={() => onClose(false)}>
      <DialogForm onSubmit={handleSubmit} error={update.error ? noticeApiMessage(update.error) : null}>
        <TextAreaField
          label="Aviso"
          rows={6}
          limit={NOTICE_MAX}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          error={fieldError}
        />
        <DialogActions submitLabel="Salvar" pending={update.isPending} onCancel={() => onClose(false)} />
      </DialogForm>
    </Dialog>
  );
}

export function DeleteNoticeDialog({ notice, onClose }: { notice: Notice; onClose: (deleted: boolean) => void }) {
  const remove = useDeleteNotice();

  return (
    <Dialog
      title="Apagar este aviso?"
      description="Ele some para todos os seus pacientes. Não dá para desfazer."
      onClose={() => onClose(false)}
    >
      <DialogForm
        onSubmit={(event) => {
          event.preventDefault();
          remove.mutate(notice.id, { onSuccess: () => onClose(true) });
        }}
        error={remove.error ? noticeApiMessage(remove.error) : null}
      >
        <DialogFooter>
          <Button variant="secondary" onClick={() => onClose(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={remove.isPending}>
            {remove.isPending ? 'Apagando…' : 'Apagar aviso'}
          </Button>
        </DialogFooter>
      </DialogForm>
    </Dialog>
  );
}
