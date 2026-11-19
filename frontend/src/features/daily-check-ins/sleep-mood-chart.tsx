import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDayHeading, formatDayMonth } from '../activities/week';
import { prefersReducedMotion } from '../profile/accessibility';
import { useAccessibility } from '../profile/use-profile';
import { formatSleep } from './check-in-labels';

// Horas de sono e humor ao longo do período (DEC-108), para o paciente, para a profissional e no
// resumo. Uma cor só (sálvia) em dois tons, como o gráfico da tensão: a leitura não depende só da
// cor (linha contínua × tracejada, legenda) e há uma tabela com os mesmos números.
export type SleepMoodPoint = { date: string; sleepMinutes: number | null; mood: number | null };

const SLEEP_COLOR = 'var(--color-score-10)';
const MOOD_COLOR = 'var(--color-score-6)';

export function SleepMoodChart({ points, title = 'Horas de sono e humor' }: { points: SleepMoodPoint[]; title?: string }) {
  const { reducedMotion } = useAccessibility();
  const withData = points.filter((point) => point.sleepMinutes !== null || point.mood !== null);
  if (withData.length === 0) return null;

  const data = withData.map((point) => ({
    date: point.date,
    hours: point.sleepMinutes === null ? null : Math.round((point.sleepMinutes / 60) * 10) / 10,
    mood: point.mood,
  }));
  const maxHours = Math.max(12, ...data.map((point) => Math.ceil(point.hours ?? 0)));
  const animate = !prefersReducedMotion(reducedMotion);

  return (
    <figure className="flex flex-col gap-3">
      <figcaption>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted">Horas de sono à esquerda e humor, de 0 a 10, à direita.</p>
      </figcaption>

      <div className="h-56" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 0, bottom: 0, left: -20 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatDayMonth(value)}
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
              stroke="var(--color-border)"
              minTickGap={16}
            />
            <YAxis
              yAxisId="hours"
              domain={[0, maxHours]}
              ticks={[0, 4, 8, 12].filter((tick) => tick <= maxHours)}
              tickFormatter={(value: number) => `${value}h`}
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
              stroke="var(--color-border)"
            />
            <YAxis
              yAxisId="mood"
              orientation="right"
              domain={[0, 10]}
              ticks={[0, 5, 10]}
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
              stroke="var(--color-border)"
              width={28}
            />
            <Tooltip
              labelFormatter={(value) => formatDayHeading(String(value))}
              formatter={(value, name) =>
                name === 'Horas de sono' ? [formatSleep(Math.round(Number(value) * 60)), name] : [value, name]
              }
              contentStyle={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                color: 'var(--color-text)',
              }}
            />
            {/* Texto da legenda na cor do texto: o nome na cor da linha clara não teria contraste. */}
            <Legend
              iconSize={12}
              wrapperStyle={{ fontSize: 13 }}
              formatter={(value) => <span style={{ color: 'var(--color-text)' }}>{value}</span>}
            />
            <Line
              yAxisId="hours"
              type="linear"
              dataKey="hours"
              name="Horas de sono"
              stroke={SLEEP_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: SLEEP_COLOR }}
              connectNulls
              legendType="circle"
              isAnimationActive={animate}
            />
            <Line
              yAxisId="mood"
              type="linear"
              dataKey="mood"
              name="Humor"
              stroke={MOOD_COLOR}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3, fill: MOOD_COLOR }}
              connectNulls
              legendType="square"
              isAnimationActive={animate}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary-text underline underline-offset-4">
          Ver os números
        </summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <caption className="sr-only">{title}, por dia</caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 font-medium">
                Dia
              </th>
              <th scope="col" className="py-1 font-medium">
                Sono
              </th>
              <th scope="col" className="py-1 font-medium">
                Humor
              </th>
            </tr>
          </thead>
          <tbody>
            {withData.map((point) => (
              <tr key={point.date} className="border-t border-border">
                <th scope="row" className="py-1 font-normal">
                  {formatDayMonth(point.date)}
                </th>
                <td className="py-1">{point.sleepMinutes === null ? '—' : formatSleep(point.sleepMinutes)}</td>
                <td className="py-1">{point.mood ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
