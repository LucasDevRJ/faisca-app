import { useEffect, useState, type FormEvent } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { highlights, readHighlight, saveHighlight, type Highlight } from './highlight';

export function HighlightSetting({ userId, highContrast }: { userId: string; highContrast: boolean }) {
  const [saved, setSaved] = useState(() => readHighlight(userId));
  const [draft, setDraft] = useState(saved);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (highContrast || draft === saved) return;
    const root = document.documentElement;
    root.dataset.highlightPreview = draft;
    return () => { delete root.dataset.highlightPreview; };
  }, [draft, highContrast, saved]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (highContrast || draft === saved) return;
    try {
      saveHighlight(userId, draft);
      setSaved(draft);
      setFailed(false);
      setStatus(draft === 'palette' ? 'Cor da paleta restaurada.' : 'Cor de destaque salva.');
    } catch {
      setFailed(true);
    }
  }

  return (
    <section aria-labelledby="highlight-title" className="flex flex-col gap-3">
      <h2 id="highlight-title" className="text-xl font-semibold">Cor de destaque</h2>
      <p id="highlight-hint" className="text-muted">
        {highContrast ? 'A paleta Alto contraste usa suas próprias cores.'
          : 'Veja a prévia nos botões e links. A escolha salva vale neste navegador.'}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <fieldset disabled={highContrast} aria-describedby="highlight-hint">
          <legend className="sr-only">Escolha a cor de destaque</legend>
          {(Object.keys(highlights) as Highlight[]).map((value) => (
            <label key={value} className="flex min-h-11 items-center gap-2">
              <input type="radio" name="highlight" checked={draft === value} onChange={() => {
                setDraft(value);
                setStatus('');
                setFailed(false);
              }} />
              {highlights[value]}
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={highContrast || draft === saved} className="self-start">Salvar cor de destaque</Button>
        {failed && <Alert tone="attention">Não foi possível salvar a cor neste navegador.</Alert>}
        <p role="status">{status}</p>
      </form>
    </section>
  );
}
