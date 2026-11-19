import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { createRecordLink, deleteRecordLink, fetchRecordLinkCandidates, fetchRecordLinks, type LinkedRecordType, type RecordSummary } from './record-links-api';
import { formatRecordDate, recordTitlePreview } from './record-links-format';

const TYPE_LABEL: Record<LinkedRecordType, string> = {
  ACTIVITY: 'Atividade', THOUGHT_RECORD: 'Pensamento', TENSION_EPISODE: 'Episódio de tensão', ACTION: 'Ação',
  PLAN: 'Plano', PLAN_ENTRY: 'Registro de plano', TASK: 'Tarefa', SLEEP_MOOD: 'Sono e humor', MEDICATION: 'Remédio do dia',
};

// Relações são metadados do paciente: a profissional recebe somente a versão filtrada pelo servidor.
export function RecordLinksPanel({ type, id, repetitionHref, patientId, readOnly = false }: { type: LinkedRecordType; id: string; repetitionHref?: string; patientId?: string; readOnly?: boolean }) {
  const [candidates, setCandidates] = useState<RecordSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [editing, setEditing] = useState(false);
  const [expandRange, setExpandRange] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const linksQuery = useQuery({
    queryKey: ['record-links', type, id, patientId],
    queryFn: () => fetchRecordLinks(type, id, readOnly ? patientId : undefined),
    enabled: !readOnly || Boolean(patientId),
  });
  const links = linksQuery.data ?? [];
  if (readOnly && links.length === 0 && !linksQuery.isError) return null;
  async function start(range?: { from?: string; to?: string }) {
    try { setBusy(true); setError(''); setCandidates(await fetchRecordLinkCandidates(type, id, range?.from, range?.to)); setEditing(true); }
    catch { setError('Não foi possível buscar outros registros.'); }
    finally { setBusy(false); }
  }
  async function add() {
    const target = candidates.find((item) => `${item.type}:${item.id}` === selected);
    if (!target) return;
    try { setBusy(true); setError(''); await createRecordLink(type, id, target); await queryClient.invalidateQueries({ queryKey: ['record-links'] }); setEditing(false); setSelected(''); }
    catch { setError('Não foi possível ligar esses registros.'); }
    finally { setBusy(false); }
  }
  async function remove(linkId: string) {
    try { setBusy(true); setError(''); await deleteRecordLink(linkId); await queryClient.invalidateQueries({ queryKey: ['record-links'] }); }
    catch { setError('Não foi possível remover a ligação.'); }
    finally { setBusy(false); }
  }
  const selectedCandidate = candidates.find((item) => `${item.type}:${item.id}` === selected);
  return <section aria-label="Registros ligados" className="flex flex-col gap-2 border-t border-border pt-3">
    <h5 className="font-medium">Registros relacionados</h5>
    {links.map((link) => {
      const other = link.source.id === id && link.source.type === type ? link.target : link.source;
      return <div key={link.id} className="flex items-start justify-between gap-2 text-sm">
        <p className="min-w-0 break-words"><span className="text-muted">{link.kind === 'REPETITION' ? 'Repetição · ' : ''}{TYPE_LABEL[other.type]} · {formatRecordDate(other.date)}</span><br />{other.title}{other.measure && <span className="block text-muted">{other.measure}</span>}</p>
        {!readOnly && <Button variant="ghost" className="px-2" disabled={busy} onClick={() => void remove(link.id)}>Desligar</Button>}
      </div>;
    })}
    {repetitionHref && !readOnly && <a className="self-start font-medium text-primary-text underline underline-offset-4" href={repetitionHref}>Isso aconteceu de novo</a>}
    {!readOnly && (editing ? <div className="flex flex-col gap-2 sm:flex-row">
      <select aria-label="Registro para ligar" className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-bg px-3" value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">Escolha um registro</option>
        {candidates.map((item) => <option key={`${item.type}:${item.id}`} aria-label={`${TYPE_LABEL[item.type]} · ${formatRecordDate(item.date)} · ${item.title}`} value={`${item.type}:${item.id}`}>{TYPE_LABEL[item.type]} · {formatRecordDate(item.date)} · {recordTitlePreview(item.title)}</option>)}
      </select><Button variant="secondary" disabled={!selected || busy} onClick={() => void add()}>Ligar</Button>
      <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancelar</Button>
    </div> : <Button variant="secondary" className="self-start" disabled={busy} onClick={() => void start()}>Ligar a outro registro</Button>)}
    {selectedCandidate && <p className="min-w-0 break-words text-sm text-muted"><span className="font-medium">Texto completo do registro:</span> {selectedCandidate.title}</p>}
    {!readOnly && editing && candidates.length === 0 && <p className="text-sm text-muted">Não encontramos registros nesse período.</p>}
    {!readOnly && editing && <div className="flex flex-col gap-2 rounded-md bg-bg p-3">
      <Button variant="ghost" className="self-start px-2" onClick={() => setExpandRange((value) => !value)}>
        {expandRange ? 'Ocultar período' : 'Buscar em outro período'}
      </Button>
      {expandRange && <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">De<input aria-label="De" type="date" className="min-h-11 rounded-md border border-border bg-surface px-3" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">Até<input aria-label="Até" type="date" className="min-h-11 rounded-md border border-border bg-surface px-3" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <Button variant="secondary" disabled={!from || !to || from > to} onClick={() => void start({ from, to })}>Buscar</Button>
      </div>}
    </div>}
    {(error || linksQuery.isError) && <p role="alert" className="text-sm text-attention-text">{error || 'Não foi possível carregar as ligações.'}</p>}
  </section>;
}
