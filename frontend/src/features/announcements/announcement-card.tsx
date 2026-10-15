import { useId, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/button';
import type { SessionUser } from '../auth/auth-api';
import { useMarkAnnouncementSeen, useSession } from '../auth/use-session';

// Card de Novidades (DEC-054, DEC-055): avisa uma melhoria uma vez, até a pessoa tocar em
// "Entendi". O "já vi" fica na API, para valer em todos os aparelhos. Os textos ficam aqui, por id;
// um id que o front não conhece não mostra nada.
type AnnouncementText = {
  title: string;
  // Texto para quem usa como paciente e para quem atende como terapeuta. Quem tem os dois perfis
  // vê os dois.
  patient: ReactNode;
  therapist: ReactNode;
  // Atalho para a parte nova, no perfil de paciente.
  link?: { to: string; label: string };
};

const ANNOUNCEMENTS: Record<string, AnnouncementText> = {
  '2026-10-explicacao-alternativa': {
    title: 'Novidade no Registro de Pensamentos ✨',
    patient: (
      <>
        <p>
          Agora você pode escrever uma <strong>explicação alternativa</strong>: outro jeito de olhar para a situação.
          Se quiser, depois diz <strong>como se sente agora</strong> em cada emoção.
        </p>
        <p>
          É opcional. Se a alternativa só vier depois, tudo bem: você pode adicioná-la ao registro até a hora da sua
          próxima consulta.
        </p>
      </>
    ),
    therapist: (
      <p>
        Nos registros dos seus pacientes, o Registro de Pensamentos agora pode trazer a{' '}
        <strong>explicação alternativa</strong> e a intensidade das emoções depois dela (antes → agora). Quando a
        alternativa é adicionada depois do dia do registro, aparece a data em que entrou.
      </p>
    ),
    link: { to: '/pensamentos', label: 'Ver meus pensamentos' },
  },
};

export function AnnouncementCard() {
  const { data: user } = useSession();
  const id = user?.pendingAnnouncement;
  const text = id ? ANNOUNCEMENTS[id] : undefined;
  if (!user || !id || !text) return null;
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
      <h2 id={titleId} className="font-heading text-xl font-bold">
        {text.title}
      </h2>
      <div className="flex flex-col gap-2">
        {patient && text.patient}
        {therapist && text.therapist}
      </div>
      <div className="flex flex-wrap gap-3">
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
      </div>
    </section>
  );
}
