import { ScoreChart } from '../../components/score-chart';
import type { Activity } from './activities-api';
import { SCORE_TEXT } from './activity-labels';

// Vontade × prazer × realização das atividades feitas no período (SPEC, Tela de registros).
// O desenho (barras no celular, colunas a partir do tablet) fica no ScoreChart (DEC-044, DEC-047).

// period completa a legenda da tabela: "na semana" (padrão), "no ciclo" ou outro período.
export function WeekChart({ activities, period = 'na semana' }: { activities: Activity[]; period?: string }) {
  const done = activities.filter((a) => a.status === 'CONCLUIDA');
  return (
    <ScoreChart
      title="Como foram as atividades feitas"
      subtitle="Vontade antes, prazer e realização, de 0 a 10."
      labels={[SCORE_TEXT.wantBefore.label, SCORE_TEXT.pleasure.label, SCORE_TEXT.achievement.label]}
      itemLabel="Atividade"
      caption={`Notas das atividades feitas ${period}`}
      items={done.map((a) => ({
        id: a.id,
        name: a.name,
        date: a.activityDate,
        values: [a.wantBefore ?? 0, a.pleasure ?? 0, a.achievement ?? 0],
      }))}
    />
  );
}
