import { startOfWeek } from '../activities/week';
import type { LinkedRecordType, RecordSummary } from './record-links-api';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function recordAnchorId(id: string): string {
  return `registro-${id}`;
}

export function dayRecordAnchorId(date: string): string {
  return `registro-dia-${date}`;
}

const PATIENT_PATH: Record<LinkedRecordType, string> = {
  ACTIVITY: '/registros', THOUGHT_RECORD: '/pensamentos', TENSION_EPISODE: '/tensao', ACTION: '/acao',
  PLAN: '/planos', PLAN_ENTRY: '/planos', TASK: '/tarefas', SLEEP_MOOD: '/sono-humor', MEDICATION: '/sono-humor',
};

const THERAPIST_TAB: Partial<Record<LinkedRecordType, string>> = {
  THOUGHT_RECORD: 'pensamentos', TENSION_EPISODE: 'tensao', ACTION: 'acao', PLAN: 'planos',
  PLAN_ENTRY: 'planos', TASK: 'tarefas', SLEEP_MOOD: 'sono-humor', MEDICATION: 'sono-humor',
};

export function recordLinkHref(record: RecordSummary, patientId?: string): string {
  const anchor = record.type === 'SLEEP_MOOD' || record.type === 'MEDICATION'
    ? dayRecordAnchorId(record.date)
    : recordAnchorId(record.id);
  const planId = record.type === 'PLAN' ? record.id : record.type === 'PLAN_ENTRY' ? record.parentId : undefined;

  if (patientId) {
    const params = new URLSearchParams({ semana: startOfWeek(record.date), meses: '3', ate: record.date });
    const tab = THERAPIST_TAB[record.type];
    if (tab) params.set('aba', tab);
    if (planId) params.set('plano', planId);
    return `/pacientes/${encodeURIComponent(patientId)}?${params.toString()}#${anchor}`;
  }

  const path = record.type === 'PLAN' || record.type === 'PLAN_ENTRY'
    ? planId ? `/planos/${encodeURIComponent(planId)}` : PATIENT_PATH[record.type]
    : PATIENT_PATH[record.type];
  if (record.type === 'TASK') return `${path}#${anchor}`;
  return `${path}?semana=${startOfWeek(record.date)}#${anchor}`;
}

// A API envia o dia em ISO (AAAA-MM-DD), já sem horário ou fuso.
export function formatRecordDate(date: string): string {
  const match = DATE_ONLY.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

// Prévia local e previsível: usa a primeira frase curta ou um trecho no limite de palavras.
// Não tenta interpretar nem reescrever o conteúdo clínico do registro.
export function recordTitlePreview(title: string, maxLength = 56): string {
  const normalized = title.replace(/\s+/gu, ' ').trim();
  const characters = Array.from(normalized);
  const limit = Math.max(1, Math.floor(maxLength));
  if (characters.length <= limit) return normalized;

  const sentenceEnd = characters.findIndex((character, index) =>
    /[.!?]/u.test(character) && (index === characters.length - 1 || /\s/u.test(characters[index + 1] ?? '')),
  );
  if (sentenceEnd >= 0 && sentenceEnd + 1 <= limit) {
    return characters.slice(0, sentenceEnd + 1).join('');
  }

  const preview = characters.slice(0, limit);
  const lastSpace = preview.lastIndexOf(' ');
  const end = lastSpace >= limit * 0.5 ? lastSpace : limit;
  return `${preview.slice(0, end).join('').trimEnd()}…`;
}
