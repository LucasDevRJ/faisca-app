import { Link } from 'react-router';
import { buttonClasses } from '../../components/ui/button-styles';
import { useLinkStatus } from '../links/use-links';
import { usePatientNotices } from './use-notices';

// Selo dos avisos ainda não vistos (DEC-080): uma palavra, sem número, para não virar cobrança.
export function NewBadge() {
  return (
    <span className="rounded-full border border-primary px-2 py-0.5 text-sm font-medium text-primary-text">Novo</span>
  );
}

// Cartão dos avisos em "Meus registros" (DEC-080): só aparece quando há aviso de quem acompanha.
// Mostra o mais recente, em poucas linhas, e leva à página com todos.
export function NoticesCard() {
  const notices = usePatientNotices();
  const link = useLinkStatus();
  const latest = notices.data?.notices[0];
  const name = link.data?.link?.therapist.name;

  if (!latest) return null;

  return (
    <section
      aria-labelledby="notices-card-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft"
    >
      <h2 id="notices-card-title" className="text-lg font-semibold break-words">
        {name ? `Avisos de ${name}` : 'Avisos'}
      </h2>
      <div className="flex flex-col items-start gap-2">
        {!latest.seen && <NewBadge />}
        <p className="line-clamp-3 break-words whitespace-pre-line">{latest.body}</p>
      </div>
      <Link to="/avisos" className={`${buttonClasses('secondary')} self-start`}>
        Ver avisos
      </Link>
    </section>
  );
}
