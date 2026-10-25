import { useEffect, useId } from 'react';
import { Link, useLocation } from 'react-router';
import { Button } from '../components/ui/button';
import { buttonClasses } from '../components/ui/button-styles';
import { announcementsFor, type AnnouncementText } from '../features/announcements/announcement-texts';
import { useMarkAnnouncementSeen, useSession } from '../features/auth/use-session';

const longDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// "O que há de novo" (DEC-060): todas as novidades da pessoa, da mais nova para a mais antiga.
// O card de Novidades mostra uma por vez; aqui dá para rever as que já passaram. Abrir a página
// não conta como "Entendi": o card some aqui, e a pendente traz o selo "Nova" e o próprio
// "Entendi". /novidades#<id> abre direto numa novidade (link das mensagens, #82).
export function AnnouncementsPage() {
  const { data: user } = useSession();
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.focus();
  }, [hash]);

  if (!user) return null;
  const list = announcementsFor(user.profiles);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link to="/conta" className="self-start font-medium text-primary-text underline underline-offset-4">
          ‹ Conta
        </Link>
        <h1 className="text-4xl font-bold">O que há de novo</h1>
        <p className="text-muted">As melhorias do Faísca, da mais nova para a mais antiga.</p>
      </div>

      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
          Ainda não há novidades.
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {list.map(([id, text]) => (
            <li key={id}>
              <Entry id={id} text={text} isNew={user.pendingAnnouncement === id} profiles={user.profiles} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

type EntryProps = {
  id: string;
  text: AnnouncementText;
  isNew: boolean;
  profiles: { patient: boolean; therapist: boolean };
};

function Entry({ id, text, isNew, profiles }: EntryProps) {
  const titleId = useId();
  const markSeen = useMarkAnnouncementSeen();

  return (
    <article
      id={id}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft focus:ring-2 focus:ring-primary focus:outline-hidden"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted">
          <time dateTime={text.date}>{longDate.format(new Date(`${text.date}T00:00:00Z`))}</time>
        </p>
        {isNew && (
          <span className="rounded-full border border-primary px-2 text-xs font-medium text-primary-text">Nova</span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <h2 id={titleId} className="text-xl font-bold">
          {text.title}
        </h2>
        {text.icon && (
          <span aria-hidden="true" className="text-xl">
            {text.icon}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {profiles.patient && text.patient}
        {profiles.therapist && text.therapist}
      </div>
      {markSeen.isError && (
        <p role="alert" className="text-sm text-accent-text">
          Não deu para registrar agora. Tente de novo em instantes.
        </p>
      )}
      {(isNew || (profiles.patient && text.link)) && (
        <div className="flex flex-wrap gap-3">
          {isNew && (
            <Button disabled={markSeen.isPending} onClick={() => markSeen.mutate(id)}>
              Entendi
            </Button>
          )}
          {profiles.patient && text.link && (
            <Link to={text.link.to} className={buttonClasses('secondary')}>
              {text.link.label}
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
