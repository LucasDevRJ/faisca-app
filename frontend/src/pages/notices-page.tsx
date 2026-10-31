import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/ui/alert';
import { LongText } from '../components/ui/long-text';
import { getApiError } from '../features/auth/auth-api';
import { formatDate } from '../features/links/link-format';
import { useLinkStatus } from '../features/links/use-links';
import { wasEdited } from '../features/notices/notices-api';
import { NewBadge } from '../features/notices/notices-card';
import { useMarkNoticesSeen, usePatientNotices } from '../features/notices/use-notices';

// Avisos de quem acompanha o paciente (SPEC, "Mural de avisos"; DEC-079, DEC-080). Ao abrir, os
// novos passam a "já vistos" na API, mas o selo "Novo" continua até a próxima visita.
export function NoticesPage() {
  const notices = usePatientNotices();
  const link = useLinkStatus();
  const markSeen = useMarkNoticesSeen();
  const marked = useRef(false);
  const name = link.data?.link?.therapist.name;

  // Uma vez por visita, só o que ainda não foi visto. O ref segura o StrictMode, que monta duas vezes.
  useEffect(() => {
    const unseen = notices.data?.notices.filter((notice) => !notice.seen).map((notice) => notice.id) ?? [];
    if (marked.current || unseen.length === 0) return;
    marked.current = true;
    markSeen.mutate(unseen);
  }, [notices.data, markSeen]);

  return (
    <>
      <section className="flex flex-col gap-2">
        <Link to="/registros" className="self-start font-medium text-primary-text underline underline-offset-4">
          ‹ Meus registros
        </Link>
        <h1 className="text-3xl font-bold break-words sm:text-4xl">{name ? `Avisos de ${name}` : 'Avisos'}</h1>
      </section>

      {notices.isPending && <p className="text-muted">Carregando…</p>}
      {notices.isError && <Alert tone="attention">{getApiError(notices.error).message}</Alert>}
      {notices.data?.notices.length === 0 && (
        <p className="text-muted">
          {name
            ? `Nenhum aviso por enquanto. Quando ${name} deixar um aviso, ele aparece aqui.`
            : 'Quando alguém acompanhar seus registros, os avisos dessa pessoa aparecem aqui.'}
        </p>
      )}
      {notices.data && notices.data.notices.length > 0 && (
        <ul className="flex flex-col gap-3">
          {notices.data.notices.map((notice) => (
            <li key={notice.id}>
              <article
                aria-label={`Aviso de ${formatDate(notice.createdAt)}`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-soft"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {!notice.seen && <NewBadge />}
                  <p className="text-sm text-muted">
                    {formatDate(notice.createdAt)}
                    {wasEdited(notice) && ` · editado em ${formatDate(notice.updatedAt)}`}
                  </p>
                </div>
                <LongText text={notice.body} />
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
