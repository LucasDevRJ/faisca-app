import { useId } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/ui/button';
import type { SessionUser } from '../auth/auth-api';
import { useMarkAnnouncementSeen, useSession } from '../auth/use-session';
import { ANNOUNCEMENT_TEXTS, isFor, type AnnouncementText } from './announcement-texts';

// Card de Novidades (DEC-054, DEC-055): avisa uma melhoria uma vez, até a pessoa tocar em
// "Entendi". O "já vi" fica na API, para valer em todos os aparelhos. Os textos ficam em
// announcement-texts.tsx; a página "O que há de novo" (DEC-060) mostra todas.
export function AnnouncementCard() {
  const { data: user } = useSession();
  const { pathname } = useLocation();
  const id = user?.pendingAnnouncement;
  const text = id ? ANNOUNCEMENT_TEXTS[id] : undefined;
  // Na página "O que há de novo", a novidade pendente já aparece lá, com o "Entendi".
  if (pathname === '/novidades') return null;
  if (!user || !id || !text || !isFor(text, user.profiles)) return null;
  return <Card user={user} id={id} text={text} />;
}

function Card({ user, id, text }: { user: SessionUser; id: string; text: AnnouncementText }) {
  const titleId = useId();
  const markSeen = useMarkAnnouncementSeen();
  const navigate = useNavigate();
  const { patient, therapist } = user.profiles;

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-accent bg-accent/10 p-4 shadow-soft"
    >
      <div className="flex items-baseline gap-2">
        <h2 id={titleId} className="font-heading text-xl font-bold">
          {text.title}
        </h2>
        {text.icon && (
          <span aria-hidden="true" className="text-xl">
            {text.icon}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {patient && text.patient}
        {therapist && text.therapist}
      </div>
      {markSeen.isError && (
        <p role="alert" className="text-sm text-accent-text">
          Não deu para registrar agora. Tente de novo em instantes.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={markSeen.isPending} onClick={() => markSeen.mutate(id)}>
          Entendi
        </Button>
        {patient && text.link && (
          <Button
            variant="secondary"
            disabled={markSeen.isPending}
            onClick={() => markSeen.mutate(id, { onSuccess: () => navigate(text.link!.to) })}
          >
            {text.link.label}
          </Button>
        )}
        {/* Altura de toque de 44px, como os botões ao lado (no celular ele fica sozinho na linha). */}
        <Link
          to="/novidades"
          className="inline-flex min-h-11 items-center font-medium text-primary-text underline underline-offset-4"
        >
          Ver todas as novidades
        </Link>
      </div>
    </section>
  );
}
