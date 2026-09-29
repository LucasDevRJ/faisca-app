import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { buttonClasses } from '../../components/ui/button-styles';
import { useLinkStatus, useMarkLinkSeen } from './use-links';

// Aviso de novo vínculo no topo de "Meus registros" (SPEC, "Regras comuns"): mostra nome e
// e-mail de quem passou a ver os registros até o paciente tocar em "Entendi".
export function NewLinkNotice() {
  const { data } = useLinkStatus();
  const markSeen = useMarkLinkSeen();
  const link = data?.link;

  if (!link || link.seen) return null;

  return (
    <section
      aria-labelledby="new-link-title"
      className="flex flex-col gap-3 rounded-lg border-l-4 border-primary bg-surface p-4 shadow-soft"
    >
      <h2 id="new-link-title" className="text-lg font-semibold">
        Novo vínculo
      </h2>
      <p>
        <strong>{link.therapist.name}</strong> (<span className="break-all">{link.therapist.email}</span>) agora
        acompanha seus registros. Se não reconhece, você pode desfazer o vínculo na sua conta.
      </p>
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
