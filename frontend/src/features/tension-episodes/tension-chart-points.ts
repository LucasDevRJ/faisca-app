import { daysBetween } from '../activities/week';
import type { TensionEpisode } from './tension-episodes-api';

// Pontos do gráfico de tensão (DEC-043), separados do componente para testar as contas.
export type ChartPoint = {
  id: string;
  // Posição no eixo: dias desde o início do período, mais a fração do dia pela hora.
  // Sem hora, o ponto fica no meio do dia.
  x: number;
  episodeDate: string;
  episodeTime: string | null;
  tensionLevel: number;
  vocalizeUrge: number;
};

function dayFraction(time: string | null): number {
  if (!time) return 0.5;
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return (hours * 60 + minutes) / (24 * 60);
}

// Em ordem de tempo: a linha liga os episódios na ordem em que aconteceram.
export function toChartPoints(episodes: TensionEpisode[], from: string): ChartPoint[] {
  return episodes
    .map((e) => ({
      id: e.id,
      x: daysBetween(from, e.episodeDate) + dayFraction(e.episodeTime),
      episodeDate: e.episodeDate,
      episodeTime: e.episodeTime,
      tensionLevel: e.tensionLevel,
      vocalizeUrge: e.vocalizeUrge,
    }))
    .sort((a, b) => a.x - b.x);
}
