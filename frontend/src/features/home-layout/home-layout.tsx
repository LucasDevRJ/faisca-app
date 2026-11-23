import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';

import { defaults, destinations, layoutKey, readHomeLayout, titles, type Layout } from './home-layout-storage';

export function HomeLayoutSettings({ userId }: { userId: string }) {
  const [layout, setLayout] = useState(() => readHomeLayout(userId));
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const moveFocus = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    moveFocus.current?.focus();
    moveFocus.current = null;
  }, [layout]);

  function save(next: Layout, message = 'Início atualizado.') {
    try {
      localStorage.setItem(layoutKey(userId), JSON.stringify(next));
      setLayout(next);
      setFailed(false);
      setStatus(message);
    } catch {
      moveFocus.current = null;
      setStatus('');
      setFailed(true);
    }
  }

  function move(index: number, step: number, button: HTMLButtonElement) {
    const target = index + step;
    if (target < 0 || target >= layout.order.length) return;
    const order = [...layout.order];
    [order[index], order[target]] = [order[target]!, order[index]!];
    if (document.activeElement === button) moveFocus.current = button;
    save({ ...layout, order }, `${titles[layout.order[index]!]} agora está na posição ${target + 1}.`);
  }

  return (
    <section aria-labelledby="home-layout-title" className="flex flex-col gap-3">
      <h2 id="home-layout-title" className="text-xl font-semibold">Cartões do início</h2>
      <p className="text-muted">Escolha o que aparece e em que ordem em Meus registros, neste navegador.</p>
      <ul className="flex flex-col gap-2">
        {layout.order.map((card, index) => (
          <li key={card} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3">
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={!layout.hidden.includes(card)} onChange={() => save({
                ...layout,
                hidden: layout.hidden.includes(card) ? layout.hidden.filter((item) => item !== card) : [...layout.hidden, card],
              })} />
              {titles[card]}
            </label>
            <div className="flex flex-wrap gap-1">
              <Button variant="ghost" aria-label={`Subir: ${titles[card]}`} aria-disabled={index === 0}
                onClick={(event) => move(index, -1, event.currentTarget)}>Subir</Button>
              <Button variant="ghost" aria-label={`Descer: ${titles[card]}`} aria-disabled={index === layout.order.length - 1}
                onClick={(event) => move(index, 1, event.currentTarget)}>Descer</Button>
            </div>
            {layout.hidden.includes(card) && (
              <Link to={destinations[card]} className="inline-flex min-h-11 items-center text-primary-text underline underline-offset-4">
                Abrir {titles[card]}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={layout.collapseChart}
          onChange={(event) => save({ ...layout, collapseChart: event.target.checked })} />
        Começar com o gráfico de atividades recolhido
      </label>
      <Button variant="secondary" className="self-start" onClick={() => save(defaults, 'Cartões restaurados ao padrão.')}>
        Restaurar cartões ao padrão
      </Button>
      {failed && <Alert tone="attention">Não foi possível salvar a organização neste navegador.</Alert>}
      <p role="status" className="text-sm text-muted">{status}</p>
    </section>
  );
}
