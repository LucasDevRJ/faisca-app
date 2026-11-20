import { daysBetween, formatFullDate } from '../activities/week';
import type { ChangeKind, Medication, MedicationChange, Symptom } from './medications-api';

// Textos de Remédios e o que sinto (DEC-115), aprovados pelo usuário. O Faísca guarda o que a pessoa
// conta e não avalia remédio nem sintoma: nada de "efeito colateral", cobrança ou alerta.

// Os mesmos limites da API e do CHECK da migration (DEC-114).
export const MEDICATION_NAME_MAX = 60;
export const MEDICATION_DOSE_MAX = 40;
export const MEDICATION_SCHEDULE_MAX = 40;
export const CHANGE_NOTE_MAX = 200;
export const SYMPTOM_DESCRIPTION_MAX = 80;
export const SYMPTOM_NOTE_MAX = 500;
export const FIRST_DATE = '1950-01-01';

export const SAFETY_TEXT =
  'O Faísca guarda o que você conta, mas não avalia remédios nem sintomas. Mudanças no remédio, só com quem receitou. Se algo te preocupar, fale com quem receitou. Em emergência, ligue 192 (SAMU).';
export const PRESCRIBER_HINT = 'Mudanças no remédio, só com quem receitou.';

export const INTENSITY_TEXT = { label: 'Intensidade de 0 a 10 (opcional)', min: 'Leve', max: 'Muito forte' } as const;

// "Remédio A · 100 mg · de manhã", só com o que foi anotado.
export function medicationLine(medication: Pick<Medication, 'name' | 'dose' | 'schedule'>): string {
  return [medication.name, medication.dose, medication.schedule].filter(Boolean).join(' · ');
}

// "12/11/2026: mudou a dose para 100 mg"; um segundo COMECOU é "voltou a tomar".
export function changeLine(change: MedicationChange, index: number): string {
  const date = formatFullDate(change.changeDate);
  if (change.kind === 'COMECOU') {
    const verb = index === 0 ? 'começou' : 'voltou a tomar';
    return `${date}: ${verb}${change.dose ? `, ${change.dose}` : ''}`;
  }
  if (change.kind === 'MUDOU_DOSE') return `${date}: mudou a dose${change.dose ? ` para ${change.dose}` : ''}`;
  return `${date}: parou`;
}

const SINCE_ACTION: Record<ChangeKind, { after: string; sameDay: string }> = {
  COMECOU: { after: 'começar', sameDay: 'começou' },
  MUDOU_DOSE: { after: 'mudar a dose de', sameDay: 'mudou a dose de' },
  PAROU: { after: 'parar', sameDay: 'parou' },
};

// "5 dias depois de mudar a dose de Remédio A"; no mesmo dia, "no dia em que mudou a dose de ...".
export function sinceChangeText(symptom: Symptom, medications: Medication[]): string | null {
  const since = symptom.sinceChange;
  if (!since) return null;
  const name = medications.find((medication) => medication.id === since.medicationId)?.name;
  if (!name) return null;
  const action = SINCE_ACTION[since.kind];
  if (since.days === 0) return `no dia em que ${action.sameDay} ${name}`;
  return `${since.days === 1 ? '1 dia' : `${since.days} dias`} depois de ${action.after} ${name}`;
}

// "Desde 10/11/2026 · 5 dias depois de mudar a dose de Remédio A".
export function symptomSince(symptom: Symptom, medications: Medication[]): string {
  const since = sinceChangeText(symptom, medications);
  return [`Desde ${formatFullDate(symptom.startedOn)}`, since].filter(Boolean).join(' · ');
}

// "Passou em 18/11/2026 (durou 9 dias)". Um sintoma que começou e passou no mesmo dia durou 1 dia.
export function symptomEnded(symptom: Symptom): string | null {
  if (!symptom.endedOn) return null;
  const days = daysBetween(symptom.startedOn, symptom.endedOn) + 1;
  return `Passou em ${formatFullDate(symptom.endedOn)} (durou ${days === 1 ? '1 dia' : `${days} dias`})`;
}

// "7 → 5 → 3": a evolução da intensidade, para ler de relance.
export function intensityTrail(symptom: Symptom): string | null {
  if (symptom.checks.length === 0) return null;
  return symptom.checks.map((check) => check.intensity).join(' → ');
}

// As mudanças do período, para as linhas do gráfico de sono e humor: "Mudou a dose de Remédio A".
export function changeMarkers(medications: Medication[], range: { from: string; to: string }) {
  return medications.flatMap((medication) =>
    medication.changes
      .map((change, index) => ({ change, index }))
      .filter(({ change }) => change.changeDate >= range.from && change.changeDate <= range.to)
      .map(({ change, index }) => ({
        date: change.changeDate,
        label:
          change.kind === 'MUDOU_DOSE'
            ? `Mudou a dose de ${medication.name}`
            : change.kind === 'PAROU'
              ? `Parou ${medication.name}`
              : `${index === 0 ? 'Começou' : 'Voltou a tomar'} ${medication.name}`,
      })),
  );
}
