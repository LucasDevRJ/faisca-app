import { CATEGORIES, CATEGORY_TEXT, doneByCategory, slotsPerCategory } from './action-labels';
import type { Action } from './actions-api';

// Meta do ciclo (DEC-052): um espaço por ação de cada tipo (dois no ciclo de 14 dias ou mais). O
// espaço se preenche com uma ação feita. Sem número de "faltam", sem cor de alerta: só o que já foi.
export function CycleGoal({ actions, range }: { actions: Action[]; range: { from: string; to: string } }) {
  const slots = slotsPerCategory(range);
  const done = doneByCategory(actions);

  return (
    <section aria-labelledby="cycle-goal-title" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft">
      <h3 id="cycle-goal-title" className="font-semibold">
        Neste ciclo
      </h3>
      <ul className="grid gap-2 sm:grid-cols-3">
        {CATEGORIES.map((category) => {
          const filled = Math.min(done[category], slots);
          return (
            <li key={category} className="flex items-center justify-between gap-3 rounded-md bg-bg px-3 py-2">
              <span>{CATEGORY_TEXT[category].label}</span>
              <span
                className="flex gap-1.5"
                role="img"
                aria-label={`${CATEGORY_TEXT[category].label}: ${filled} de ${slots} ${slots === 1 ? 'feita' : 'feitas'}`}
              >
                {Array.from({ length: slots }, (_, i) => (
                  <span
                    key={i}
                    className={`size-4 rounded-full border-2 border-primary ${i < filled ? 'bg-primary' : 'bg-transparent'}`}
                  />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
