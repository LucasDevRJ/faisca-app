import { Bar, BarChart, LabelList, Legend, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { useMediaQuery } from '../../lib/use-media-query';
import type { Activity } from './activities-api';
import { SCORE_TEXT } from './activity-labels';
import { formatShortDay } from './week';

// Vontade × prazer × realização das atividades feitas na semana (SPEC, Tela semanal).
// No celular, barras horizontais (DEC-044): o nome inteiro fica numa linha própria, com o dia ao
// lado, e o gráfico cresce para baixo. A partir do tablet (768px), as colunas lado a lado, como
// antes, porque ali os nomes cabem (DEC-047).
// Uma só cor (sálvia) em três intensidades, com o valor escrito em cada barra: a leitura
// não depende de distinguir cores. A tabela logo abaixo é a versão para leitor de tela.

const SERIES = [
  { key: 'wantBefore', color: 'var(--color-score-4)' },
  { key: 'pleasure', color: 'var(--color-score-7)' },
  { key: 'achievement', color: 'var(--color-score-10)' },
] as const;

// A partir daqui, as colunas ganham rolagem lateral em vez de espremer os nomes.
const MAX_WITHOUT_SCROLL = 8;
const WIDTH_PER_ACTIVITY = 96;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function shortName(name: string) {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

function ColumnChart({ done }: { done: Activity[] }) {
  const data = done.map((a) => ({
    id: a.id,
    name: shortName(a.name),
    wantBefore: a.wantBefore,
    pleasure: a.pleasure,
    achievement: a.achievement,
  }));
  const minWidth = done.length > MAX_WITHOUT_SCROLL ? done.length * WIDTH_PER_ACTIVITY : undefined;
  const animate = !prefersReducedMotion();

  return (
    <div className="overflow-x-auto" aria-hidden="true">
      <div style={{ minWidth }} className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -24 }} accessibilityLayer={false}>
            <XAxis dataKey="name" interval={0} tick={{ fill: 'var(--color-muted)', fontSize: 12 }} />
            <YAxis domain={[0, 10]} ticks={[0, 5, 10]} tick={{ fill: 'var(--color-muted)', fontSize: 12 }} />
            {/* Na ordem das séries (o padrão é alfabética) e com o texto na cor do texto:
                o nome na cor da barra mais clara não teria contraste. */}
            <Legend
              itemSorter={null}
              iconSize={10}
              wrapperStyle={{ fontSize: 13 }}
              formatter={(value) => <span style={{ color: 'var(--color-text)' }}>{value}</span>}
            />
            {SERIES.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={SCORE_TEXT[series.key].label}
                fill={series.color}
                radius={[4, 4, 0, 0]}
                isAnimationActive={animate}
              >
                <LabelList dataKey={series.key} position="top" fill="var(--color-text)" fontSize={12} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// period completa a legenda da tabela: "na semana" (padrão) ou outro período, na visão da terapeuta.
export function WeekChart({ activities, period = 'na semana' }: { activities: Activity[]; period?: string }) {
  const done = activities.filter((a) => a.status === 'CONCLUIDA');
  const wide = useMediaQuery('(min-width: 768px)');
  if (done.length === 0) return null;

  return (
    <figure className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-soft">
      <figcaption>
        <h3 className="text-xl font-semibold">Como foram as atividades feitas</h3>
        <p className="text-sm text-muted">Vontade antes, prazer e realização, de 0 a 10.</p>
      </figcaption>

      {wide ? (
        <ColumnChart done={done} />
      ) : (
        <div aria-hidden="true" className="flex flex-col gap-4">
          {/* Legenda na ordem das barras, com o texto na cor do texto: o nome na cor da barra
            mais clara não teria contraste. */}
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {SERIES.map((series) => (
              <li key={series.key} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: series.color }} />
                {SCORE_TEXT[series.key].label}
              </li>
            ))}
          </ul>

          <ul className="flex flex-col gap-4">
            {done.map((a) => (
              <li key={a.id} className="flex flex-col gap-1.5">
                <p className="text-sm">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted"> · {formatShortDay(a.activityDate)}</span>
                </p>
                <div className="flex flex-col gap-0.5">
                  {SERIES.map((series) => {
                    const value = a[series.key] ?? 0;
                    return (
                      <div key={series.key} className="flex items-center gap-2">
                        {/* A trilha mostra até onde vai o 10. */}
                        <div className="h-2.5 flex-1 overflow-hidden rounded-r bg-border">
                          <div
                            className="h-full rounded-r"
                            style={{
                              width: `${value * 10}%`,
                              backgroundColor: series.color,
                            }}
                          />
                        </div>
                        <span className="w-5 text-right text-xs font-medium tabular-nums">{value}</span>
                      </div>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* sr-only numa div: uma tabela ignora a largura de 1px e vazaria para fora da tela. */}
      <div className="sr-only">
        <table>
          <caption>Notas das atividades feitas {period}</caption>
          <thead>
            <tr>
              <th scope="col">Atividade</th>
              {SERIES.map((series) => (
                <th key={series.key} scope="col">
                  {SCORE_TEXT[series.key].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {done.map((a) => (
              <tr key={a.id}>
                <th scope="row">
                  {a.name}, {formatShortDay(a.activityDate)}
                </th>
                <td>{a.wantBefore}</td>
                <td>{a.pleasure}</td>
                <td>{a.achievement}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
