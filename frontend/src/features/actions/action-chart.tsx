import { ScoreChart } from '../../components/score-chart';
import { SCORE_TEXT } from './action-labels';
import type { Action } from './actions-api';

// Expectativa × prazer × realização das ações feitas no período (DEC-052): o mesmo desenho do
// gráfico das atividades, para comparar o que se esperava com o que aconteceu.
export function ActionChart({ actions, period }: { actions: Action[]; period: string }) {
  const done = actions.filter((a) => a.status === 'AVALIADA');
  return (
    <ScoreChart
      title="Como foram as ações feitas"
      subtitle="O quanto esperava gostar, o prazer e a realização, de 0 a 10."
      labels={['Expectativa', SCORE_TEXT.pleasure.label, SCORE_TEXT.achievement.label]}
      itemLabel="Ação"
      caption={`Notas das ações feitas ${period}`}
      items={done.map((a) => ({
        id: a.id,
        name: a.name,
        date: a.actionDate,
        values: [a.expectation, a.pleasure ?? 0, a.achievement ?? 0],
      }))}
    />
  );
}
