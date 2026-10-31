import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { LongText } from '../components/ui/long-text';
import { TextAreaField } from '../components/ui/text-field';
import { getApiError } from '../features/auth/auth-api';
import { formatDate } from '../features/links/link-format';
import { DeleteNoticeDialog, EditNoticeDialog } from '../features/notices/notice-dialogs';
import { NOTICE_MAX, noticeApiMessage, noticeBodyError, wasEdited, type Notice } from '../features/notices/notices-api';
import { useCreateNotice, useOwnNotices } from '../features/notices/use-notices';

type OpenDialog = { kind: 'edit' | 'delete'; notice: Notice } | null;

// Mural de avisos da terapeuta (SPEC, "Mural de avisos"; DEC-079, DEC-080): escreve para todos os
// pacientes com vínculo de uma vez. A página diz o que eles veem e o que ela não vê.
export function MuralPage() {
  const notices = useOwnNotices();
  const create = useCreateNotice();
  const [body, setBody] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [status, setStatus] = useState('');
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const listTitle = useRef<HTMLHeadingElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = noticeBodyError(body);
    setFieldError(error);
    if (error) return;
    setStatus('');
    create.mutate(body.trim(), {
      onSuccess: () => {
        setBody('');
        setStatus('Aviso publicado.');
        listTitle.current?.focus();
      },
    });
  }

  // Limpa o aviso de status ao abrir a janela: assim a mesma mensagem duas vezes seguidas ("Aviso
  // apagado.") muda o texto da região e o leitor de tela anuncia de novo.
  function openDialog(next: NonNullable<OpenDialog>) {
    setStatus('');
    setDialog(next);
  }

  // Depois de salvar ou apagar, o botão que abriu a janela pode ter sumido: o foco vai para a lista.
  function closeDialog(message: string | null) {
    setDialog(null);
    if (message) {
      setStatus(message);
      listTitle.current?.focus();
    }
  }

  return (
    <>
      <section className="flex flex-col gap-2">
        <Link to="/pacientes" className="self-start font-medium text-primary-text underline underline-offset-4">
          ‹ Meus pacientes
        </Link>
        <h1 className="text-3xl font-bold sm:text-4xl">Mural de avisos</h1>
        <p className="text-muted sm:text-lg">
          Os avisos aparecem para todos os seus pacientes com vínculo. Eles não veem uns aos outros, e você não vê quem
          leu.
        </p>
      </section>

      <section
        aria-labelledby="new-notice-title"
        className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6"
      >
        <h2 id="new-notice-title" className="text-xl font-semibold">
          Novo aviso
        </h2>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {create.error && <Alert tone="attention">{noticeApiMessage(create.error)}</Alert>}
          <TextAreaField
            label="Aviso"
            hint="Por exemplo: férias, feriados ou mudança de horário."
            rows={4}
            limit={NOTICE_MAX}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            error={fieldError}
          />
          <div>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Publicando…' : 'Publicar'}
            </Button>
          </div>
        </form>
      </section>

      {/* Sempre montado, para o leitor de tela anunciar quando o texto muda. */}
      <p role="status" className="text-primary-text empty:hidden">
        {status}
      </p>

      <section aria-labelledby="published-title" className="flex flex-col gap-3">
        <h2 id="published-title" ref={listTitle} tabIndex={-1} className="text-2xl font-semibold">
          Publicados
        </h2>
        {notices.isPending && <p className="text-muted">Carregando…</p>}
        {notices.isError && <Alert tone="attention">{getApiError(notices.error).message}</Alert>}
        {notices.data?.length === 0 && <p className="text-muted">Nenhum aviso publicado ainda.</p>}
        {notices.data && notices.data.length > 0 && (
          <ul className="flex flex-col gap-3">
            {notices.data.map((notice) => (
              <li key={notice.id}>
                <article
                  aria-label={`Aviso de ${formatDate(notice.createdAt)}`}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft"
                >
                  <p className="text-sm text-muted">
                    {formatDate(notice.createdAt)}
                    {wasEdited(notice) && ` · editado em ${formatDate(notice.updatedAt)}`}
                  </p>
                  <LongText text={notice.body} />
                  <div className="grid grid-cols-2 gap-3 sm:flex">
                    {/* Nome com a data: numa lista de botões do leitor de tela, cada um diz de qual aviso é. */}
                    <Button
                      variant="secondary"
                      aria-label={`Editar o aviso de ${formatDate(notice.createdAt)}`}
                      onClick={() => openDialog({ kind: 'edit', notice })}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="secondary"
                      aria-label={`Apagar o aviso de ${formatDate(notice.createdAt)}`}
                      onClick={() => openDialog({ kind: 'delete', notice })}
                    >
                      Apagar
                    </Button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog?.kind === 'edit' && (
        <EditNoticeDialog notice={dialog.notice} onClose={(saved) => closeDialog(saved ? 'Aviso atualizado.' : null)} />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteNoticeDialog notice={dialog.notice} onClose={(deleted) => closeDialog(deleted ? 'Aviso apagado.' : null)} />
      )}
    </>
  );
}
