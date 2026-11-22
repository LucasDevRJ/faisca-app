import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { TextField } from '../components/ui/text-field';
import { getApiError } from '../features/auth/auth-api';
import { SEARCH_TYPES, searchPatientRecords, searchTherapistPatientRecords, type RecordSearchInput, type SearchResult, type SearchType } from '../features/record-search/record-search-api';
import { todayInAppZone } from '../features/activities/week';

const TITLES: Record<SearchType, string> = {
  ACTIVITY: 'Atividades', THOUGHT_RECORD: 'Pensamentos', TENSION_EPISODE: 'Tensão', ACTION: 'Ação',
  ABOUT_ME: 'Sobre mim', PLAN_ENTRY: 'Meus Planos', TASK: 'Tarefas', SLEEP_MOOD: 'Sono e humor', MEDICATION: 'Remédio do dia',
};
const BACK_CLASS = 'inline-flex min-h-11 self-start items-center font-medium text-primary-text underline underline-offset-4';
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });

function dateLabel(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00.000Z`));
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function contentValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object') {
        const emotion = item as Record<string, unknown>;
        return `${String(emotion.label ?? emotion.emotion)} · intensidade ${String(emotion.intensity)}${emotion.intensityAfter === null || emotion.intensityAfter === undefined ? '' : ` · depois ${String(emotion.intensityAfter)}`}`;
      }
      return String(item);
    }).join('; ');
  }
  if (value === null || value === undefined || value === '') return '';
  const labels: Record<string, string> = {
    PLANEJADA: 'Planejada', PENDENTE: 'Pendente', CONCLUIDA: 'Concluída', NAO_REALIZADA: 'Não realizada',
    AVALIADA: 'Avaliada', PRAZER: 'Prazer', CONEXAO: 'Conexão', REALIZACAO: 'Realização',
    TOMOU: 'Tomou como combinado', ESQUECEU_ALGUM: 'Esqueceu algum', NAO_TOMOU: 'Hoje não tomou',
    RESPONDIDA: 'Respondida', NAO_CONSEGUI: 'Não consegui fazer', NAO_FAZ_SENTIDO: 'Não faz sentido para mim agora',
  };
  return labels[String(value)] ?? String(value);
}

function fieldLabel(key: string) {
  const labels: Record<string, string> = {
    name: 'Registro', status: 'Situação', observation: 'Observação', wantBefore: 'Vontade antes', pleasure: 'Prazer',
    achievement: 'Realização', situation: 'Situação', automaticThought: 'Pensamento automático', beliefLevel: 'Crença',
    emotions: 'Emoções', behavior: 'O que fiz', consequence: 'O que aconteceu depois', alternativeExplanation: 'Explicação alternativa',
    tensionLevel: 'Tensão', vocalizeUrge: 'Vontade de vocalizar', category: 'Tipo', expectation: 'Expectativa antes',
    aboutMe: 'Sobre mim', goals: 'O que gostaria de trabalhar', habits: 'Hábitos', planId: 'Plano', questions: 'Perguntas',
    answers: 'Respostas', entryTime: 'Horário', title: 'Título', description: 'Tarefa combinada', responseText: 'Resposta',
    responseStatus: 'Como foi', moodWord: 'Palavra para o dia', sleepQuality: 'Sono', mood: 'Humor', bedTime: 'Hora em que deitou',
    wakeTime: 'Hora em que acordou', medication: 'Remédio',
  };
  return labels[key] ?? key;
}

// Os resultados vêm do mais novo para o mais antigo. Quando são de mais de um ano, um título com o
// ano separa cada grupo (DEC-120); de um ano só, a lista segue sem título.
function ResultsByYear({ results }: { results: SearchResult[] }) {
  const groups: { year: string; items: SearchResult[] }[] = [];
  for (const result of results) {
    const year = result.date.slice(0, 4);
    const last = groups.at(-1);
    if (last?.year === year) last.items.push(result);
    else groups.push({ year, items: [result] });
  }
  const grouped = groups.length > 1;
  // Com o título do ano (h3), o título de cada cartão desce para h4, para a ordem dos títulos fazer sentido.
  const cards = (items: SearchResult[]) =>
    items.map((result) => <ResultCard key={`${result.type}:${result.id}`} result={result} nested={grouped} />);
  if (!grouped) return <>{cards(results)}</>;
  return (
    <>
      {groups.map((group) => (
        <section key={group.year} aria-labelledby={`search-year-${group.year}`} className="flex flex-col gap-3">
          <h3 id={`search-year-${group.year}`} className="border-b border-border pb-1 pt-2 text-lg font-semibold">
            {group.year}
          </h3>
          {cards(group.items)}
        </section>
      ))}
    </>
  );
}

function ResultCard({ result, nested = false }: { result: SearchResult; nested?: boolean }) {
  const Heading = nested ? 'h4' : 'h2';
  const start = Math.max(0, Math.min(result.matchStart, result.excerpt.length));
  const end = Math.max(start, Math.min(start + result.matchLength, result.excerpt.length));
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Heading className="font-semibold">{TITLES[result.type]}</Heading>
        <span className="text-sm text-muted">{dateLabel(result.date)}</span>
        {result.unread && <span className="rounded-full border border-border px-2 py-0.5 text-sm text-primary-text">Para ler</span>}
      </div>
      <p className="font-medium break-words">{result.title}</p>
      <p className="break-words text-muted">
        {result.excerpt.slice(0, start)}<mark className="rounded-sm bg-primary/20 text-text">{result.excerpt.slice(start, end)}</mark>{result.excerpt.slice(end)}
      </p>
      <details className="rounded-md border border-border px-3 py-2">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary-text">Abrir registro completo</summary>
        <dl className="grid gap-3 pt-2 sm:grid-cols-2">
          {Object.entries(result.content).map(([key, value]) => {
            const text = contentValue(value);
            return text ? <div key={key} className="min-w-0 break-words"><dt className="text-sm text-muted">{fieldLabel(key)}</dt><dd>{text}</dd></div> : null;
          })}
        </dl>
      </details>
    </article>
  );
}

export function RecordSearchPage({ audience = 'patient' }: { audience?: 'patient' | 'therapist' }) {
  const { patientId = '' } = useParams();
  const today = todayInAppZone();
  const [term, setTerm] = useState('');
  const [from, setFrom] = useState(() => addDays(today, -89));
  const [to, setTo] = useState(today);
  const [emotion, setEmotion] = useState('');
  const [minIntensity, setMinIntensity] = useState('');
  const [types, setTypes] = useState<SearchType[]>([]);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [lastInput, setLastInput] = useState<RecordSearchInput | null>(null);
  const search = async (input: RecordSearchInput) => audience === 'therapist'
    ? searchTherapistPatientRecords(patientId, input)
    : searchPatientRecords(input);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function runSearch(input: RecordSearchInput, append = false) {
    setPending(true);
    setError(null);
    if (!append) {
      setResults([]);
      setHasMore(false);
      setTotal(0);
      setLastInput(null);
    }
    try {
      const response = await search(input);
      setResults((current) => append ? [...current, ...response.results] : response.results);
      setHasMore(response.hasMore);
      setTotal(response.total);
      setLastInput(input);
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setPending(false);
    }
  }
  const back = audience === 'therapist' ? `/pacientes/${patientId}` : '/registros';
  return (
    <section className="flex flex-col gap-5">
      <Link to={back} className={BACK_CLASS}>‹ Voltar para os registros</Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold sm:text-4xl">Buscar nos registros</h1>
        <p className="text-muted">Encontre um assunto nos registros por texto, período, emoção ou intensidade.</p>
      </header>
      <form className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-soft" onSubmit={(event) => {
        event.preventDefault();
        const input: RecordSearchInput = {
          term: term.trim(), types, from, to, page: 1, pageSize: 20,
          ...(emotion.trim() && { emotion: emotion.trim() }),
          ...(minIntensity !== '' && { minIntensity: Number(minIntensity) }),
          ...(audience === 'therapist' && onlyUnread && { onlyUnread: true }),
        };
        void runSearch(input);
      }}>
        <TextField label="O que você quer encontrar?" value={term} onChange={(event) => setTerm(event.target.value)} required maxLength={120} />
        <fieldset className="flex flex-col gap-2">
          <legend className="font-medium">Tipos de registro</legend>
          <p className="text-sm text-muted">Sem marcar nenhum, a busca considera todos os tipos disponíveis.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {SEARCH_TYPES.map((type) => <label key={type} className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3">
              <input type="checkbox" checked={types.includes(type)} onChange={(event) => setTypes((current) => event.target.checked ? [...current, type] : current.filter((item) => item !== type))} />
              {TITLES[type]}
            </label>)}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="De" type="date" value={from} max={today} onChange={(event) => setFrom(event.target.value)} />
          <TextField label="Até" type="date" value={to} max={today} onChange={(event) => setTo(event.target.value)} />
          <TextField label="Emoção" value={emotion} onChange={(event) => setEmotion(event.target.value)} hint="Por exemplo: ansiedade ou tristeza." />
          <TextField label="Intensidade mínima" type="number" min={0} max={10} value={minIntensity} onChange={(event) => setMinIntensity(event.target.value)} hint="De 0 a 10." />
        </div>
        {audience === 'therapist' && <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={onlyUnread} onChange={(event) => setOnlyUnread(event.target.checked)} />
          Só registros para ler
        </label>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || !term.trim()}>{pending ? 'Buscando…' : 'Buscar'}</Button>
          <span className="text-sm text-muted">O termo não fica salvo no seu histórico.</span>
        </div>
        {error && <Alert tone="attention">{error}</Alert>}
      </form>
      {results.length > 0 && <section aria-labelledby="search-results-title" className="flex flex-col gap-3">
        <h2 id="search-results-title" className="text-xl font-semibold">Resultados</h2>
        <p className="text-sm text-muted">{total} {total === 1 ? 'registro encontrado' : 'registros encontrados'}</p>
        <ResultsByYear results={results} />
        {hasMore && <Button variant="secondary" disabled={pending} onClick={() => lastInput && void runSearch({ ...lastInput, page: lastInput.page + 1 }, true)}>Carregar mais</Button>}
      </section>}
      {results.length === 0 && lastInput && !pending && !error && <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">Nenhum registro encontrado com esses critérios.</p>}
    </section>
  );
}
