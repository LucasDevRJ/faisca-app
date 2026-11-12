import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { buttonClasses } from '../../components/ui/button-styles';
import { firstName, KIND_LABEL } from './professional-labels';
import { useLinkStatus, useMarkLinkSeen } from './use-links';

// Aviso de novo vínculo no topo de "Meus registros" (SPEC, "Regras comuns"): mostra nome, tipo e
// e-mail de quem passou a acompanhar o paciente até ele tocar em "Entendi". A profissional nova
// começa sem ver nada (DEC-097): o aviso leva a Conta, onde o paciente escolhe o que ela vê.
export function NewLinkNotice() {
  const { data } = useLinkStatus();
  const markSeen = useMarkLinkSeen();
  const unseen = (data?.links ?? []).filter((link) => !link.seen);

  if (unseen.length === 0) return null;

  return (
    <section
      aria-labelledby="new-link-title"
      className="flex flex-col gap-3 rounded-lg border-l-4 border-primary bg-surface p-4 shadow-soft"
    >
      <h2 id="new-link-title" className="text-lg font-semibold">
        Novo vínculo
      </h2>
      {unseen.map((link) => (
        <p key={link.id}>
          <strong>{link.therapist.name}</strong> ({KIND_LABEL[link.kind].toLowerCase()},{' '}
          <span className="break-all">{link.therapist.email}</span>) agora acompanha você no Faísca.{' '}
          {link.sharedAreas.length === 0 &&
            `${firstName(link.therapist.name)} ainda não vê nada: escolha em Conta o que pode ver.`}
        </p>
      ))}
      <p>Se não reconhece, você pode desfazer o vínculo na sua conta.</p>
      <div className="grid grid-cols-2 gap-3 sm:flex">
        <Button disabled={markSeen.isPending} onClick={() => markSeen.mutate()}>
          Entendi
        </Button>
        <Link to="/conta" className={buttonClasses('secondary')}>
          Ver minha conta
        </Link>
      </div>
    </section>
  );
}
