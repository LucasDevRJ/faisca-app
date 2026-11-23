import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { LongText } from '../../components/ui/long-text';
import { createRecordLink, deleteRecordLink, fetchRecordLinks, type LinkedRecordType, type RecordSummary } from './record-links-api';
import { formatRecordDate, recordLinkHref, TYPE_LABEL } from './record-links-format';
import { RecordLinkPicker } from './record-link-picker';

// Relações são metadados do paciente: a profissional recebe somente a versão filtrada pelo servidor.
export function RecordLinksPanel({ type, id, date, repetitionHref, patientId, readOnly = false }: { type: LinkedRecordType; id: string; date?: string; repetitionHref?: string; patientId?: string; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Ao fechar o seletor (ligou ou cancelou), o foco volta para o botão que o abriu.
  const openButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      openButton.current?.focus();
    }
  }, [editing]);
  function closePicker() {
    returnFocus.current = true;
    setEditing(false);
  }
  const queryClient = useQueryClient();
  const linksQuery = useQuery({
    queryKey: ['record-links', type, id, patientId],
    queryFn: () => fetchRecordLinks(type, id, readOnly ? patientId : undefined),
    enabled: !readOnly || Boolean(patientId),
  });
  const links = useMemo(() => linksQuery.data ?? [], [linksQuery.data]);
  const linkedKeys = useMemo(() => new Set(links.flatMap((link) => [link.source, link.target])
    .filter((item) => !(item.type === type && item.id === id)).map((item) => `${item.type}:${item.id}`)), [links, type, id]);
  if (readOnly && links.length === 0 && !linksQuery.isError) return null;
  async function add(target: RecordSummary) {
    try { setBusy(true); setError(''); await createRecordLink(type, id, target); await queryClient.invalidateQueries({ queryKey: ['record-links'] }); closePicker(); }
    catch { setError('Não foi possível ligar esses registros.'); }
    finally { setBusy(false); }
  }
  async function remove(linkId: string) {
    try { setBusy(true); setError(''); await deleteRecordLink(linkId); await queryClient.invalidateQueries({ queryKey: ['record-links'] }); }
    catch { setError('Não foi possível remover a ligação.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Registros ligados" className="flex flex-col gap-2 border-t border-border pt-3">
    <h5 className="font-medium">Registros relacionados</h5>
    {links.map((link) => {
      const other = link.source.id === id && link.source.type === type ? link.target : link.source;
      const current = link.source.id === id && link.source.type === type ? link.source : link.target;
      const observation = other.observation ?? (current.type === 'ACTIVITY' ? current.observation : undefined);
      return <div key={link.id} className="flex items-start justify-between gap-2 text-sm">
        <div className="min-w-0 break-words">
          <Link to={recordLinkHref(other, patientId)} className="block min-h-11 cursor-pointer rounded-sm no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text">
            <span className="block text-muted">{link.kind === 'REPETITION' ? 'Repetição · ' : ''}{TYPE_LABEL[other.type]} · {formatRecordDate(other.date)}</span>
            <span className="block font-medium text-primary-text">{other.title}</span>
            {other.measure && <span className="block text-muted">{other.measure}</span>}
          </Link>
          {observation && <div className="mt-1 text-muted"><span className="font-medium">Anotação:</span> <LongText text={observation} /></div>}
        </div>
        {!readOnly && <Button variant="ghost" className="px-2" disabled={busy} onClick={() => void remove(link.id)}>Desligar</Button>}
      </div>;
    })}
    {repetitionHref && !readOnly && <a className="self-start font-medium text-primary-text underline underline-offset-4" href={repetitionHref}>Isso aconteceu de novo</a>}
    {!readOnly && (editing
      ? <RecordLinkPicker type={type} id={id} date={date} linkedKeys={linkedKeys} busy={busy} onLink={(target) => void add(target)} onCancel={closePicker} />
      : <Button ref={openButton} variant="secondary" className="self-start" disabled={busy} onClick={() => { setError(''); setEditing(true); }}>Ligar a outro registro</Button>)}
    {(error || linksQuery.isError) && <p role="alert" className="text-sm text-attention-text">{error || 'Não foi possível carregar as ligações.'}</p>}
  </section>;
}
