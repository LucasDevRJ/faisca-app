import { Bar, BarChart, LabelList, Legend, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { Activity } from './activities-api';
import { SCORE_TEXT } from './activity-labels';

// Vontade × prazer × realização das atividades feitas na semana (SPEC, Tela semanal).
// Uma só cor (sálvia) em três intensidades, com o valor escrito em cada barra: a leitura
// não depende de distinguir cores. A tabela logo abaixo é a versão para leitor de tela.

const SERIES = [
  { key: 'wantBefore', color: 'var(--color-score-4)' },
  { key: 'pleasure', color: 'var(--color-score-7)' },
  { key: 'achievement', color: 'var(--color-score-10)' },
] as const;

// A partir daqui, o gráfico ganha rolagem lateral em vez de espremer as barras.
const MAX_WITHOUT_SCROLL = 8;
const WIDTH_PER_ACTIVITY = 96;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function shortName(name: string) {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

export function WeekChart({ activities }: { activities: Activity[] }) {
  const done = activities.filter((a) => a.status === 'CONCLUIDA');
  if (done.length === 0) return null;

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
    <figure className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft">
      <figcaption>
        <h3 className="text-xl font-semibold">Como foram as atividades feitas</h3>
        <p className="text-sm text-muted">Vontade antes, prazer e realização, de 0 a 10.</p>
      </figcaption>

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

      {/* sr-only numa div: uma tabela ignora a largura de 1px e vazaria para fora da tela. */}
      <div className="sr-only">
        <table>
          <caption>Notas das atividades feitas na semana</caption>
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
                <th scope="row">{a.name}</th>
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
