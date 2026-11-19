import { formatDayMonth } from '../activities/week';
import { EMOTION_LABEL } from '../thought-records/thought-record-labels';
import { formatSleep } from '../daily-check-ins/check-in-labels';
import type { PeriodSummary } from './summary-api';

// Textos do resumo do período (DEC-100), aprovados pelo usuário. Só números, sem interpretação: a
// comparação vem neutra, "(antes: 6,1)", sem seta, cor ou "piorou". Uma área sem nenhum registro no
// período não aparece.

export type SummaryArea =
  | 'activities'
  | 'thoughtRecords'
  | 'tensionEpisodes'
  | 'actions'
  | 'plans'
  | 'sleepMood'
  | 'medication';

export type SummaryBlock = { area: SummaryArea; title: string; lines: string[] };

export const AREA_TITLE: Record<SummaryArea, string> = {
  activities: 'Atividades',
  thoughtRecords: 'Pensamentos',
  tensionEpisodes: 'Tensão',
  actions: 'Ação',
  plans: 'Meus Planos',
  sleepMood: 'Sono e humor',
  medication: 'Remédio',
};

// O "Ver registros" de cada bloco, com alvo de toque de 44 px.
export const summaryLinkClass =
  'inline-flex min-h-11 items-center self-start font-medium text-primary-text underline underline-offset-4';

const scoreFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Média com uma casa decimal ("7,0"); sem valor, um travessão.
export function formatScore(value: number | null): string {
  return value === null ? '—' : scoreFormat.format(value);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// "(antes: 25)", ou nada quando o período anterior não tem o que comparar.
function before(value: string | null): string {
  return value === null ? '' : ` (antes: ${value})`;
}

// "(antes: 3,8 · 6,1 · 6,5)": só quando alguma das médias anteriores existe.
function beforeScores(values: (number | null)[]): string {
  return values.every((value) => value === null) ? '' : before(values.map(formatScore).join(' · '));
}

function beforeScore(value: number | null): string {
  return value === null ? '' : before(formatScore(value));
}

export function periodLine(summary: PeriodSummary): string {
  const { period, previousPeriod } = summary;
  return `${formatDayMonth(period.from)} a ${formatDayMonth(period.to)} · comparado com ${formatDayMonth(
    previousPeriod.from,
  )} a ${formatDayMonth(previousPeriod.to)}`;
}

export function daysLine(summary: PeriodSummary): string {
  const { current, previous } = summary.daysWithRecords;
  return `Dias com registro: ${current}${before(String(previous))}`;
}

export function summaryBlocks(summary: PeriodSummary): SummaryBlock[] {
  const blocks: SummaryBlock[] = [];

  const activities = summary.activities;
  if (activities) {
    const { current: now, previous: old } = activities;
    if (now.done + now.notDone + now.open > 0) {
      const lines = [
        `${plural(now.done, 'feita', 'feitas')}, ${plural(now.notDone, 'não realizada', 'não realizadas')}, ${plural(
          now.open,
          'ainda aberta',
          'ainda abertas',
        )}`,
      ];
      if (now.done > 0) {
        lines.push(
          `Nas feitas, em média: vontade antes ${formatScore(now.avgWantBefore)} · prazer ${formatScore(
            now.avgPleasure,
          )} · realização ${formatScore(now.avgAchievement)}${beforeScores([
            old.avgWantBefore,
            old.avgPleasure,
            old.avgAchievement,
          ])}`,
        );
      }
      blocks.push({ area: 'activities', title: AREA_TITLE.activities, lines });
    }
  }

  const thoughts = summary.thoughtRecords;
  if (thoughts && thoughts.current.count > 0) {
    const { current: now, previous: old } = thoughts;
    const lines = [`${plural(now.count, 'registro', 'registros')}${before(String(old.count))}`];
    if (now.topEmotions.length > 0) {
      const emotions = now.topEmotions.map((item, index) => {
        const name = item.emotion === 'OUTRA' ? 'outra emoção' : EMOTION_LABEL[item.emotion].toLowerCase();
        const times = plural(item.count, 'vez', 'vezes');
        const intensity = formatScore(item.avgIntensity);
        return index === 0 ? `${name} (${times}, intensidade média ${intensity})` : `${name} (${times}, ${intensity})`;
      });
      lines.push(`Emoções mais presentes: ${emotions.join(' · ')}`);
    }
    lines.push(`O quanto acreditava no pensamento, em média: ${formatScore(now.avgBelief)}${beforeScore(old.avgBelief)}`);
    let alternative = `Com explicação alternativa: ${now.withAlternative} de ${now.count}.`;
    const effect = now.alternativeEffect;
    if (effect && effect.before !== null && effect.after !== null) {
      alternative += ` Nelas, a intensidade das emoções foi de ${formatScore(effect.before)} para ${formatScore(
        effect.after,
      )}, em média.`;
    }
    lines.push(alternative);
    blocks.push({ area: 'thoughtRecords', title: AREA_TITLE.thoughtRecords, lines });
  }

  const tension = summary.tensionEpisodes;
  if (tension && tension.current.count > 0) {
    const { current: now, previous: old } = tension;
    blocks.push({
      area: 'tensionEpisodes',
      title: AREA_TITLE.tensionEpisodes,
      lines: [
        `${plural(now.count, 'episódio', 'episódios')}${before(String(old.count))}`,
        `Tensão média ${formatScore(now.avgTension)}${beforeScore(old.avgTension)} · a maior: ${
          now.maxTension ?? '—'
        } · vontade de vocalizar média ${formatScore(now.avgVocalize)}${beforeScore(old.avgVocalize)}`,
      ],
    });
  }

  const actions = summary.actions;
  if (actions) {
    const { current: now } = actions;
    if (now.evaluated + now.notDone + now.planned > 0) {
      const { PRAZER, CONEXAO, REALIZACAO } = now.byCategory;
      // Só planejadas: "1 planejada", sem "0 avaliadas e 0 não realizadas" na frente.
      const parts: string[] = [];
      if (now.evaluated + now.notDone > 0) {
        let done = `${plural(now.evaluated, 'avaliada', 'avaliadas')} e ${plural(now.notDone, 'não realizada', 'não realizadas')}`;
        if (now.evaluated > 0) done += ` (Prazer ${PRAZER} · Conexão ${CONEXAO} · Realização ${REALIZACAO})`;
        parts.push(done);
      }
      if (now.planned > 0) parts.push(plural(now.planned, 'planejada', 'planejadas'));
      const lines = [parts.join(' · ')];
      if (now.evaluated > 0) {
        lines.push(
          `Esperava ${formatScore(now.avgExpectation)} em média; depois, prazer ${formatScore(
            now.avgPleasure,
          )} e realização ${formatScore(now.avgAchievement)}`,
        );
      }
      blocks.push({ area: 'actions', title: AREA_TITLE.actions, lines });
    }
  }

  const plans = summary.plans;
  if (plans && plans.current.entries > 0) {
    const { current: now } = plans;
    blocks.push({
      area: 'plans',
      title: AREA_TITLE.plans,
      lines: [`${plural(now.entries, 'registro', 'registros')} em ${plural(now.plans, 'plano', 'planos')}`],
    });
  }

  // Sono e humor (DEC-108): o gráfico do período fica no cartão, junto deste bloco.
  const sleepMood = summary.sleepMood;
  if (sleepMood && (sleepMood.current.nights > 0 || sleepMood.current.moodDays > 0)) {
    const { current: now, previous: old } = sleepMood;
    const lines: string[] = [];
    if (now.nights > 0) {
      const hours = now.avgSleepMinutes === null ? '—' : formatSleep(now.avgSleepMinutes);
      const oldHours = old.avgSleepMinutes === null ? null : formatSleep(old.avgSleepMinutes);
      lines.push(
        `Sono: ${plural(now.nights, 'noite registrada', 'noites registradas')} · ${hours} em média${before(oldHours)}` +
          (now.avgSleepQuality === null ? '' : ` · nota do sono ${formatScore(now.avgSleepQuality)}${beforeScore(old.avgSleepQuality)}`),
      );
    }
    if (now.moodDays > 0) {
      lines.push(
        `Humor: ${plural(now.moodDays, 'dia registrado', 'dias registrados')} · média ${formatScore(now.avgMood)}${beforeScore(
          old.avgMood,
        )} · a menor: ${now.minMood ?? '—'} · a maior: ${now.maxMood ?? '—'}`,
      );
    }
    blocks.push({ area: 'sleepMood', title: AREA_TITLE.sleepMood, lines });
  }

  // Remédio (DEC-107): em quantos dias registrados tomou como combinado, sem nome nem dose.
  const medication = summary.medication;
  if (medication && medication.current.days > 0) {
    const { current: now } = medication;
    blocks.push({
      area: 'medication',
      title: AREA_TITLE.medication,
      lines: [
        `${now.days === 1 ? 'No dia registrado' : `Nos ${now.days} dias registrados`}: como combinado ${now.taken} · esqueceu algum ${now.forgotSome} · não tomou ${now.notTaken}`,
      ],
    });
  }

  return blocks;
}

// Alguma área chegou (liberada e com aceite)? Sem nenhuma, o cartão nem aparece.
export function hasAnyArea(summary: PeriodSummary): boolean {
  return [
    summary.activities,
    summary.thoughtRecords,
    summary.tensionEpisodes,
    summary.actions,
    summary.plans,
    summary.sleepMood,
    summary.medication,
  ].some(
    (area) => area !== null,
  );
}
