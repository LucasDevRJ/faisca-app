import { useId, type CSSProperties } from 'react';

type ScoreFieldProps = {
  label: string;
  // null = ainda não escolhida. O slider não "sugere" um valor: a pessoa precisa mexer.
  value: number | null;
  onChange: (value: number) => void;
  minLabel: string;
  maxLabel: string;
  error?: string;
};

// Nota inteira de 0 a 10 (SPEC). Slider grande com legendas nos extremos (frontend/CLAUDE.md).
// A cor do número varia só em intensidade, na escala de sálvia; nunca vermelho/verde.
export function ScoreField({ label, value, onChange, minLabel, maxLabel, error }: ScoreFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const legendId = `${id}-legend`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <output htmlFor={id} className="font-heading text-2xl font-bold tabular-nums" aria-live="polite">
          {value ?? '—'}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        // Sem valor escolhido, o polegar fica no meio, mas a tela mostra "—" até a pessoa mexer.
        value={value ?? 5}
        onChange={(e) => onChange(Number(e.target.value))}
        // Clicar no polegar sem arrastar também conta como escolha do valor do meio.
        // (No teclado, as setas já disparam o onChange.)
        onPointerUp={(e) => value === null && onChange(Number(e.currentTarget.value))}
        aria-valuetext={value === null ? 'ainda não escolhida' : `${value} de 10`}
        aria-invalid={error ? true : undefined}
        aria-describedby={[legendId, error && errorId].filter(Boolean).join(' ')}
        data-empty={value === null ? '' : undefined}
        // Quanto do trilho aparece preenchido (ver .score-range no index.css).
        style={{ '--fill': `${(value ?? 0) * 10}%` } as CSSProperties}
        className="score-range"
      />
      <div id={legendId} className="flex justify-between text-sm text-muted">
        <span>0 · {minLabel}</span>
        <span>10 · {maxLabel}</span>
      </div>
      {error && (
        <p id={errorId} className="text-sm text-accent-text">
          {error}
        </p>
      )}
    </div>
  );
}
