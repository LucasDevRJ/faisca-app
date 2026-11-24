import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { choiceCardClasses, fieldClasses } from '../../components/ui/field-styles';
import { addDays, todayInAppZone } from '../activities/week';
import { fetchCycle } from '../cycle/cycle-api';
import { cropAround } from '../record-search/crop-around';
import { searchPatientRecords, type SearchResult, type SearchType } from '../record-search/record-search-api';
import { fetchRecordLinkCandidates, type LinkedRecordType, type RecordSummary } from './record-links-api';
import { formatRecordDate, recordTitlePreview, TYPE_LABEL } from './record-links-format';
import { loadWindow, newerAnchor, periodIndexOf, periodLabel, windowLabel } from './record-link-window';

// Filtros por tipo (#260). "Plano" junta o plano e os registros dele.
const FILTERS: { label: string; types: LinkedRecordType[] }[] = [
  { label: 'Atividade', types: ['ACTIVITY'] },
  { label: 'Pensamento', types: ['THOUGHT_RECORD'] },
  { label: 'Tensão', types: ['TENSION_EPISODE'] },
  { label: 'Ação', types: ['ACTION'] },
  { label: 'Tarefa', types: ['TASK'] },
  { label: 'Plano', types: ['PLAN', 'PLAN_ENTRY'] },
  { label: 'Sono e humor', types: ['SLEEP_MOOD'] },
  { label: 'Remédio do dia', types: ['MEDICATION'] },
];

// A busca no texto usa a da #152 (termo no corpo do POST, fora dos logs), nos últimos 12 meses.
// "Sobre mim" não é um registro que se liga; o plano sozinho não entra na busca, só os registros dele.
const SEARCHABLE: SearchType[] = ['ACTIVITY', 'THOUGHT_RECORD', 'TENSION_EPISODE', 'ACTION', 'PLAN_ENTRY', 'TASK', 'SLEEP_MOOD', 'MEDICATION'];
const SEARCH_PAGE_SIZE = 20;

type Highlight = { start: number; length: number };
// Na busca, o título e o trecho vêm separados (#305): o trecho é de um campo só e não repete o título.
type Choice = { key: string; summary: RecordSummary; text: string; highlight?: Highlight | null; excerpt?: { text: string; highlight: Highlight } };

function keyOf(item: { type: string; id: string }) {
  return `${item.type}:${item.id}`;
}

function fromSearch(result: SearchResult): Choice {
  const summary: RecordSummary = { type: result.type as LinkedRecordType, id: result.id, date: result.date, title: result.title };
  const title = result.titleMatch ? cropAround(result.title, result.titleMatch, 100) : null;
  return { key: keyOf(summary), summary, text: title?.text ?? result.title,
    highlight: title && result.titleMatch ? { start: title.start, length: result.titleMatch.length } : null,
    ...(result.excerpt && { excerpt: { text: result.excerpt, highlight: { start: result.matchStart, length: result.matchLength } } }) };
}

function Highlighted({ text, highlight }: { text: string; highlight?: Highlight | null }) {
  if (!highlight || highlight.length <= 0) return <>{text}</>;
  const end = highlight.start + highlight.length;
  return <>{text.slice(0, highlight.start)}<mark className="rounded-sm bg-primary/20 text-text">{text.slice(highlight.start, end)}</mark>{text.slice(end)}</>;
}

type PickerProps = {
  // Registro de origem (ligações). Sem ele, o seletor só escolhe um registro (mensagens, DEC-128).
  type?: LinkedRecordType;
  id?: string;
  // Dia do registro de origem: a janela começa no ciclo dele.
  date?: string;
  // Registros já ligados a este (somem da lista).
  linkedKeys: Set<string>;
  busy: boolean;
  onLink: (target: RecordSummary) => void;
  onCancel: () => void;
  // Só estes tipos aparecem (ex.: as áreas liberadas para a profissional da conversa).
  allowedTypes?: LinkedRecordType[];
  legend?: string;
  confirmLabel?: string;
};

export function RecordLinkPicker({ type, id, date, linkedKeys, busy, onLink, onCancel, allowedTypes, legend = 'Registro para ligar', confirmLabel = 'Ligar' }: PickerProps) {
  const today = todayInAppZone();
  const baseId = useId();
  // Ao abrir, o foco entra no seletor, no primeiro filtro.
  const firstFilter = useRef<HTMLButtonElement>(null);
  useEffect(() => { firstFilter.current?.focus(); }, []);
  const [anchor, setAnchor] = useState(date && date <= today ? date : today);
  const [filters, setFilters] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState('');
  const [jumpDate, setJumpDate] = useState('');
  const [draft, setDraft] = useState('');
  const [term, setTerm] = useState('');
  const [searchPages, setSearchPages] = useState(1);
  const [moving, setMoving] = useState(false);

  const permitted = allowedTypes ? new Set(allowedTypes) : null;
  const filterOptions = permitted ? FILTERS.filter((filter) => filter.types.some((item) => permitted.has(item))) : FILTERS;
  const chosenTypes = filters.size === 0 ? null : new Set(FILTERS.filter((filter) => filters.has(filter.label)).flatMap((filter) => filter.types));
  const allowed = chosenTypes || permitted
    ? new Set((Object.keys(TYPE_LABEL) as LinkedRecordType[]).filter((item) => (!chosenTypes || chosenTypes.has(item)) && (!permitted || permitted.has(item))))
    : null;
  const visible = (item: { type: string; id: string }) =>
    !(item.type === type && item.id === id) && !linkedKeys.has(keyOf(item)) && (!allowed || allowed.has(item.type as LinkedRecordType));

  const windowQuery = useQuery({
    queryKey: ['appointments', 'record-link-window', anchor],
    queryFn: () => loadWindow(anchor, today, (day) => fetchCycle(day)),
    enabled: !term,
  });
  const linkWindow = windowQuery.data;
  const range = linkWindow ? { from: linkWindow.periods[linkWindow.periods.length - 1]!.from, to: linkWindow.periods[0]!.to } : null;
  const candidatesQuery = useQuery({
    queryKey: ['record-links', 'candidates', type, id, range?.from, range?.to],
    queryFn: () => fetchRecordLinkCandidates(type, id, range!.from, range!.to),
    enabled: !term && range !== null,
  });

  const searchTypes = allowed ? SEARCHABLE.filter((item) => allowed.has(item as LinkedRecordType)) : SEARCHABLE;
  const searchQuery = useQuery({
    queryKey: ['record-links', 'search', term, searchTypes.join(','), searchPages],
    queryFn: async () => {
      const pages = await Promise.all(Array.from({ length: searchPages }, (_, index) => searchPatientRecords({
        term, types: searchTypes, from: addDays(today, -365), to: today, page: index + 1, pageSize: SEARCH_PAGE_SIZE,
      })));
      return { results: pages.flatMap((page) => page.results), hasMore: pages[pages.length - 1]!.hasMore };
    },
    enabled: Boolean(term) && searchTypes.length > 0,
    placeholderData: (previous) => previous,
  });

  const browseChoices: Choice[] = (candidatesQuery.data ?? []).filter(visible)
    .map((summary) => ({ key: keyOf(summary), summary, text: summary.title }));
  const searchChoices: Choice[] = (searchQuery.data?.results ?? []).map(fromSearch).filter((choice) => visible(choice.summary));
  const choices = term ? searchChoices : browseChoices;
  const chosen = choices.find((choice) => choice.key === selected);

  function toggleFilter(label: string | null) {
    setSelected('');
    setFilters((current) => {
      if (label === null) return new Set();
      const next = new Set(current);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSelected('');
    setSearchPages(1);
    setTerm(draft.trim());
  }
  function clearSearch() {
    setDraft('');
    setTerm('');
    setSelected('');
  }
  async function goNewer() {
    if (!linkWindow) return;
    setMoving(true);
    try { setAnchor(await newerAnchor(linkWindow, today, (day) => fetchCycle(day))); setSelected(''); }
    finally { setMoving(false); }
  }
  function goOlder() {
    if (!linkWindow?.older) return;
    setAnchor(linkWindow.older);
    setSelected('');
  }
  function jump(event: FormEvent) {
    event.preventDefault();
    if (!jumpDate) return;
    setAnchor(jumpDate > today ? today : jumpDate);
    setSelected('');
  }

  const loading = term ? searchQuery.isPending && searchTypes.length > 0 : windowQuery.isPending || candidatesQuery.isPending;
  const failed = term ? searchQuery.isError : windowQuery.isError || candidatesQuery.isError;
  const noun = linkWindow?.mode === 'week' ? 'Semanas' : 'Ciclos';

  function choiceCard(choice: Choice) {
    return <label key={choice.key} className={`${choiceCardClasses} flex min-h-11 items-start gap-3 p-3`}>
      <input type="radio" name={`${baseId}-registro`} className="mt-1" value={choice.key} checked={selected === choice.key} onChange={() => setSelected(choice.key)} />
      <span className="min-w-0 break-words">
        <span className="block text-sm text-muted">{TYPE_LABEL[choice.summary.type]} · {formatRecordDate(choice.summary.date)}</span>
        <span className="line-clamp-2">
          {choice.highlight ? <Highlighted text={choice.text} highlight={choice.highlight} /> : recordTitlePreview(choice.text, 140)}
        </span>
        {choice.excerpt && <span className="line-clamp-2 text-sm text-muted"><Highlighted text={choice.excerpt.text} highlight={choice.excerpt.highlight} /></span>}
      </span>
    </label>;
  }

  let list: ReactNode = null;
  if (term) {
    list = searchChoices.length > 0
      ? <div className="flex flex-col gap-2">{searchChoices.map(choiceCard)}</div>
      : null;
  } else if (linkWindow) {
    const groups = linkWindow.periods.map((period) => ({ period, items: [] as Choice[] }));
    for (const choice of browseChoices) {
      const index = periodIndexOf(choice.summary.date, linkWindow.periods);
      if (index >= 0) groups[index]!.items.push(choice);
    }
    list = groups.filter((group) => group.items.length > 0).map((group) =>
      <div key={group.period.from} className="flex flex-col gap-2">
        <h6 className="text-sm font-semibold text-muted">{periodLabel(linkWindow.mode, group.period, today)}</h6>
        {group.items.map(choiceCard)}
      </div>);
    if (!groups.some((group) => group.items.length > 0)) list = null;
  }

  return <div className="flex flex-col gap-3 rounded-md bg-bg p-3">
    <div role="group" aria-label="Tipo de registro" className="flex flex-wrap gap-2">
      <Button ref={firstFilter} variant={filters.size === 0 ? 'primary' : 'secondary'} className="px-3 text-sm" aria-pressed={filters.size === 0} onClick={() => toggleFilter(null)}>Todos</Button>
      {filterOptions.map((filter) => <Button key={filter.label} variant={filters.has(filter.label) ? 'primary' : 'secondary'} className="px-3 text-sm" aria-pressed={filters.has(filter.label)} onClick={() => toggleFilter(filter.label)}>{filter.label}</Button>)}
    </div>

    <form role="search" className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={submitSearch}>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">Buscar no texto
        <input type="search" className={`${fieldClasses} min-h-11`} placeholder="café, reunião..." maxLength={120} value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" disabled={!draft.trim()}>Buscar</Button>
        {term && <Button variant="ghost" onClick={clearSearch}>Limpar busca</Button>}
      </div>
    </form>

    {!term && <>
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={jump}>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">Ir para uma data
          <input type="date" className={`${fieldClasses} min-h-11`} max={today} value={jumpDate} onChange={(event) => setJumpDate(event.target.value)} />
        </label>
        <Button type="submit" variant="secondary" disabled={!jumpDate}>Ir</Button>
      </form>
      <div className="flex items-center justify-center gap-1">
        <Button variant="ghost" className="px-3 text-2xl" aria-label={`${noun} anteriores`} disabled={!linkWindow?.older || moving} onClick={goOlder}>‹</Button>
        <p className="min-w-40 text-center font-medium" aria-live="polite">{linkWindow ? windowLabel(linkWindow, today) : ' '}</p>
        <Button variant="ghost" className="px-3 text-2xl" aria-label={`${noun} seguintes`} disabled={!linkWindow?.hasNewer || moving} onClick={() => void goNewer()}>›</Button>
      </div>
    </>}

    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="sr-only">{legend}</legend>
      {loading && <p role="status" className="text-sm text-muted">Carregando registros…</p>}
      {failed && <p role="alert" className="text-sm text-attention-text">Não foi possível buscar outros registros.</p>}
      {!loading && !failed && (list ?? <p className="text-sm text-muted">
        {term ? 'Nada encontrado com essa palavra nos últimos 12 meses.' : `Nenhum registro ${linkWindow?.mode === 'week' ? 'nessas semanas' : 'nesses ciclos'}. Use as setas para ver outros.`}
      </p>)}
      {term && searchQuery.data?.hasMore && <Button variant="secondary" className="self-start" disabled={searchQuery.isFetching} onClick={() => setSearchPages((pages) => pages + 1)}>Ver mais</Button>}
    </fieldset>

    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button disabled={!chosen || busy} onClick={() => chosen && onLink(chosen.summary)}>{confirmLabel}</Button>
      <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancelar</Button>
    </div>
  </div>;
}
