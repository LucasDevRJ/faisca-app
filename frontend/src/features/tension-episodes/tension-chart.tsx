import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { addDays, daysBetween, formatDayHeading, formatDayMonth } from '../activities/week';
import { toChartPoints, type ChartPoint } from './tension-chart-points';
import { FIELD_TEXT, formatEpisodeTime } from './tension-episode-labels';
import type { TensionEpisode } from './tension-episodes-api';

// Tensão e vontade de vocalizar ao longo do período (DEC-043), para paciente e terapeuta.
// Uma cor só (sálvia) em dois tons, como manda o frontend/CLAUDE.md. Os dois tons passam no
// validador de paleta (daltonismo, visão normal e contraste ≥ 3:1, nos dois temas), e a leitura
// não depende só da cor: linha contínua × tracejada, círculo × quadrado, legenda e tabela.
const SERIES = [
  { key: 'tensionLevel', color: 'var(--color-score-10)', dash: undefined, shape: 'circle' },
  { key: 'vocalizeUrge', color: 'var(--color-score-6)', dash: '6 4', shape: 'square' },
] as const;

type SeriesKey = (typeof SERIES)[number]['key'];

// A partir daqui, o eixo marca um dia por semana em vez de todos.
const DAILY_TICKS_UP_TO = 14;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

type TensionChartProps = {
  episodes: TensionEpisode[];
  range: { from: string; to: string };
  // Dias de consulta no período: faixa "consulta" no gráfico.
  appointmentDays: string[];
  // Completa a legenda da tabela: "na semana" ou "desde a última consulta".
  period: string;
};

export function TensionChart({ episodes, range, appointmentDays, period }: TensionChartProps) {
  if (episodes.length === 0) return null;

  const days = daysBetween(range.from, range.to) + 1;
  const points = toChartPoints(episodes, range.from);
  const step = days <= DAILY_TICKS_UP_TO ? 1 : 7;
  // Marca no meio de cada dia: o rótulo fica embaixo dos pontos daquele dia.
  const ticks = Array.from({ length: Math.ceil(days / step) }, (_, i) => i * step + 0.5);
  const consultations = appointmentDays
    .filter((day) => day >= range.from && day <= range.to)
    .map((day) => daysBetween(range.from, day));
  const animate = !prefersReducedMotion();

  return (
    <figure className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft">
      <figcaption>
        <h3 className="text-xl font-semibold">Tensão e vontade de vocalizar</h3>
        <p className="text-sm text-muted">Cada ponto é um episódio, de 0 a 10. Toque num ponto para ver os valores.</p>
      </figcaption>

      <div className="h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 16, right: 12, bottom: 0, left: -24 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            {consultations.map((start) => (
              <ReferenceArea
                key={start}
                x1={start}
                x2={start + 1}
                // score-1, e não score-0: no tema escuro, o score-0 quase some no fundo do cartão.
                fill="var(--color-score-1)"
                fillOpacity={0.7}
                label={{ value: 'consulta', position: 'insideTop', fill: 'var(--color-muted)', fontSize: 11 }}
              />
            ))}
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, days]}
              ticks={ticks}
              tickFormatter={(value: number) => formatDayMonth(addDays(range.from, Math.floor(value)))}
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
              stroke="var(--color-border)"
            />
            <YAxis
              domain={[0, 10]}
              ticks={[0, 5, 10]}
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
              stroke="var(--color-border)"
            />
            <Tooltip content={EpisodeTooltip} cursor={{ stroke: 'var(--color-border)' }} />
            {/* Texto da legenda na cor do texto: o nome na cor da linha clara não teria contraste. */}
            <Legend
              itemSorter={null}
              iconSize={12}
              wrapperStyle={{ fontSize: 13 }}
              formatter={(value) => <span style={{ color: 'var(--color-text)' }}>{value}</span>}
            />
            {SERIES.map((series) => (
              <Line
                key={series.key}
                type="linear"
                dataKey={series.key}
                name={FIELD_TEXT[series.key].label}
                stroke={series.color}
                strokeWidth={2}
                strokeDasharray={series.dash}
                legendType={series.shape}
                dot={(props) => <Marker key={`${series.key}-${props.index}`} {...props} shape={series.shape} />}
                activeDot={(props) => <Marker {...props} shape={series.shape} active />}
                isAnimationActive={animate}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* sr-only numa div: uma tabela ignora a largura de 1px e vazaria para fora da tela. */}
      <div className="sr-only">
        <table>
          <caption>Tensão e vontade de vocalizar dos episódios {period}</caption>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Hora</th>
              {SERIES.map((series) => (
                <th key={series.key} scope="col">
                  {FIELD_TEXT[series.key].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id}>
                <th scope="row">{formatDayHeading(p.episodeDate)}</th>
                <td>{p.episodeTime ?? 'sem horário'}</td>
                <td>{p.tensionLevel}</td>
                <td>{p.vocalizeUrge}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

type MarkerProps = {
  cx?: number;
  cy?: number;
  stroke?: string;
  shape: 'circle' | 'square';
  active?: boolean;
};

// Marcadores de 8px (10px em foco), com anel na cor da superfície para separar pontos que se
// sobrepõem. Círculo = tensão; quadrado = vontade de vocalizar.
function Marker({ cx, cy, stroke, shape, active = false }: MarkerProps) {
  if (cx === undefined || cy === undefined) return null;
  const size = active ? 10 : 8;
  const common = { fill: stroke, stroke: 'var(--color-surface)', strokeWidth: 2 };
  return shape === 'circle' ? (
    <circle cx={cx} cy={cy} r={size / 2} {...common} />
  ) : (
    <rect x={cx - size / 2} y={cy - size / 2} width={size} height={size} rx={1.5} {...common} />
  );
}

function EpisodeTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const point = payload?.[0]?.payload as ChartPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-soft">
      <p className="font-medium first-letter:uppercase">{formatDayHeading(point.episodeDate)}</p>
      <p className="text-muted">{formatEpisodeTime(point.episodeTime)}</p>
      {SERIES.map((series) => (
        <p key={series.key} className="tabular-nums">
          {FIELD_TEXT[series.key].label}: <span className="font-semibold">{point[series.key as SeriesKey]}</span>
        </p>
      ))}
    </div>
  );
}
