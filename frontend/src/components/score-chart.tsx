import { Bar, BarChart, LabelList, Legend, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { formatShortDay } from '../features/activities/week';
import { useMediaQuery } from '../lib/use-media-query';

// Três notas de 0 a 10 por item (atividade ou ação). No celular, barras horizontais (DEC-044): o
// nome inteiro numa linha própria, com o dia ao lado, e o gráfico cresce para baixo. A partir do
// tablet (768px), as colunas lado a lado (DEC-047). Uma só cor (sálvia) em três intensidades, com o
// valor escrito em cada barra: a leitura não depende de distinguir cores. A tabela logo abaixo é a
// versão para leitor de tela.

const COLORS = ['var(--color-score-4)', 'var(--color-score-7)', 'var(--color-score-10)'] as const;

export type ScoreChartItem = { id: string; name: string; date: string; values: [number, number, number] };

type ScoreChartProps = {
  title: string;
  subtitle: string;
  // Nome das três séries, na ordem dos valores.
  labels: [string, string, string];
  // "Atividade", "Ação": o cabeçalho da primeira coluna da tabela.
  itemLabel: string;
  caption: string;
  items: ScoreChartItem[];
};

// A partir daqui, as colunas ganham rolagem lateral em vez de espremer os nomes.
const MAX_WITHOUT_SCROLL = 8;
const WIDTH_PER_ITEM = 96;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function shortName(name: string) {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

function ColumnChart({ items, labels }: { items: ScoreChartItem[]; labels: ScoreChartProps['labels'] }) {
  const data = items.map((item) => ({ id: item.id, name: shortName(item.name), s0: item.values[0], s1: item.values[1], s2: item.values[2] }));
  const minWidth = items.length > MAX_WITHOUT_SCROLL ? items.length * WIDTH_PER_ITEM : undefined;
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
            {labels.map((label, i) => (
              <Bar
                key={label}
                dataKey={`s${i}`}
                name={label}
                fill={COLORS[i]}
                radius={[4, 4, 0, 0]}
                isAnimationActive={animate}
              >
                <LabelList dataKey={`s${i}`} position="top" fill="var(--color-text)" fontSize={12} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BarList({ items, labels }: { items: ScoreChartItem[]; labels: ScoreChartProps['labels'] }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      {/* Legenda na ordem das barras, com o texto na cor do texto. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {labels.map((label, i) => (
          <li key={label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: COLORS[i] }} />
            {label}
          </li>
        ))}
      </ul>

      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1.5">
            <p className="text-sm">
              <span className="font-medium">{item.name}</span>
              <span className="text-muted"> · {formatShortDay(item.date)}</span>
            </p>
            <div className="flex flex-col gap-0.5">
              {item.values.map((value, i) => (
                <div key={labels[i]} className="flex items-center gap-2">
                  {/* A trilha mostra até onde vai o 10. */}
                  <div className="h-2.5 flex-1 overflow-hidden rounded-r bg-border">
                    <div className="h-full rounded-r" style={{ width: `${value * 10}%`, backgroundColor: COLORS[i] }} />
                  </div>
                  <span className="w-5 text-right text-xs font-medium tabular-nums">{value}</span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScoreChart({ title, subtitle, labels, itemLabel, caption, items }: ScoreChartProps) {
  const wide = useMediaQuery('(min-width: 768px)');
  if (items.length === 0) return null;

  return (
    <figure className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-soft">
      <figcaption>
        <h3 className="text-xl font-semibold">{title}</h3>
        <p className="text-sm text-muted">{subtitle}</p>
      </figcaption>

      {wide ? <ColumnChart items={items} labels={labels} /> : <BarList items={items} labels={labels} />}

      {/* sr-only numa div: uma tabela ignora a largura de 1px e vazaria para fora da tela. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{itemLabel}</th>
              {labels.map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <th scope="row">
                  {item.name}, {formatShortDay(item.date)}
                </th>
                {item.values.map((value, i) => (
                  <td key={labels[i]}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
