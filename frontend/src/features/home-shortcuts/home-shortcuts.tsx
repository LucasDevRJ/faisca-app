import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { buttonClasses } from '../../components/ui/button-styles';
import { Alert } from '../../components/ui/alert';

const options = {
  thought: { label: 'Novo pensamento', path: '/pensamentos/novo' },
  action: { label: 'Nova ação', path: '/acao/nova' },
  sleep: { label: 'Sono e humor', path: '/sono-humor' },
  messages: { label: 'Abrir mensagens', path: '/mensagens' },
  appointments: { label: 'Minhas consultas', path: '/consultas' },
} as const;
type Shortcut = keyof typeof options;
const limit = 3;
const ids = Object.keys(options) as Shortcut[];

function storageKey(userId: string) {
  return `faisca:home-shortcuts:${userId}`;
}

function readShortcuts(userId: string): Shortcut[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? 'null');
    if (Array.isArray(saved)) {
      return [...new Set(saved.filter((value): value is Shortcut => ids.includes(value)))].slice(0, limit);
    }
  } catch {
    // Sem acesso ao armazenamento, o início usa a configuração padrão.
  }
  return [];
}

export function HomeShortcuts({ userId }: { userId: string }) {
  const [shortcuts] = useState(() => readShortcuts(userId));
  if (!shortcuts.length) return null;
  return (
    <nav aria-label="Meus atalhos" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Meus atalhos</h2>
      <ul className="flex flex-wrap gap-2">
        {shortcuts.map((id) => (
          <li key={id}><Link to={options[id].path} className={buttonClasses('secondary')}>{options[id].label}</Link></li>
        ))}
      </ul>
    </nav>
  );
}

export function HomeShortcutSettings({ userId }: { userId: string }) {
  const [shortcuts, setShortcuts] = useState(() => readShortcuts(userId));
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);

  function save(next: Shortcut[]) {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
      setShortcuts(next);
      setFailed(false);
      setStatus(next.length ? 'Atalhos salvos.' : 'Início restaurado ao padrão.');
    } catch {
      setStatus('');
      setFailed(true);
    }
  }

  return (
    <section aria-labelledby="home-personalization" className="flex flex-col gap-3">
      <h2 id="home-personalization" className="text-2xl font-semibold">Personalizar início</h2>
      <fieldset aria-describedby="home-shortcuts-hint">
        <legend className="font-medium">Meus atalhos</legend>
        <p id="home-shortcuts-hint" className="text-muted">Escolha até três atalhos para Meus registros neste navegador.</p>
        {ids.map((id) => {
          const selected = shortcuts.includes(id);
          return (
            <label key={id} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={selected} disabled={!selected && shortcuts.length >= limit}
                onChange={() => save(selected ? shortcuts.filter((shortcut) => shortcut !== id) : [...shortcuts, id])} />
              {options[id].label}
            </label>
          );
        })}
      </fieldset>
      <Button variant="secondary" className="self-start" disabled={!shortcuts.length} onClick={() => save([])}>
        Voltar ao padrão
      </Button>
      {failed && <Alert tone="attention">Não foi possível salvar os atalhos neste navegador.</Alert>}
      <p role="status" className="text-sm text-muted">{status}</p>
    </section>
  );
}
