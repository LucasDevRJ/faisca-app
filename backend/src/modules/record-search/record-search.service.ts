import { addDays, dateOnlyToDate, dateToDateOnly, startOfDayInAppZone, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { coversArea, type PrivacyArea } from '../auth/privacy.js';
import type { RecordSearchInput, SearchType } from './record-search.schema.js';
import type { SharedArea } from '../../generated/prisma/client.js';

type Access = { sharedAreas: SharedArea[]; patientPrivacyVersion: string | null; therapistPrivacyVersion: string | null };
type SearchResult = {
  id: string; type: SearchType; date: string; title: string; titleMatch: { start: number; length: number } | null;
  excerpt: string; excerptField: string | null; matchStart: number; matchLength: number; content: Record<string, unknown>;
  intensity: number[]; emotions: string[]; updatedAt: Date; unread?: boolean; unreadEligible?: boolean;
};

const rules: Record<SearchType, { shared?: SharedArea; privacy?: PrivacyArea; mark?: string }> = {
  ACTIVITY: { shared: 'ACTIVITIES' }, THOUGHT_RECORD: { shared: 'THOUGHT_RECORDS', privacy: 'thoughtRecords', mark: 'thoughtRecordId' },
  TENSION_EPISODE: { shared: 'TENSION_EPISODES', privacy: 'tensionEpisodes', mark: 'tensionEpisodeId' },
  ACTION: { shared: 'ACTIONS', privacy: 'actions', mark: 'actionId' }, ABOUT_ME: { shared: 'ABOUT_ME', privacy: 'aboutMe', mark: 'aboutId' },
  PLAN_ENTRY: { shared: 'PLANS', privacy: 'plans', mark: 'planEntryId' }, TASK: { shared: 'TASKS', privacy: 'tasks', mark: 'taskId' },
  SLEEP_MOOD: { shared: 'SLEEP_MOOD', privacy: 'sleepMood' }, MEDICATION: { shared: 'MEDICATION', privacy: 'medication' },
};

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function stem(value: string) {
  const normalized = normalize(value);
  return normalized.length > 4 ? normalized.replace(/[ao]$/, '') : normalized;
}

function termsOf(value: string) {
  return (normalize(value).match(/[\p{L}\p{N}]+/gu) ?? []).map(stem);
}

type Field = { key: string; text: string };
type Match = { start: number; length: number };

const EMOTION_LABELS: Record<string, string> = {
  TRISTEZA: 'Tristeza', ANSIEDADE: 'Ansiedade', MEDO: 'Medo', RAIVA: 'Raiva', CULPA: 'Culpa', VERGONHA: 'Vergonha',
  FRUSTRACAO: 'Frustração', SOLIDAO: 'Solidão', ALEGRIA: 'Alegria', ALIVIO: 'Alívio', OUTRA: 'Outra',
};
const RESPONSE_LABELS: Record<string, string> = {
  RESPONDIDA: 'Respondida', NAO_CONSEGUI: 'Não consegui fazer', NAO_FAZ_SENTIDO: 'Não faz sentido para mim agora',
};
const WORD_CHAR = /[\p{L}\p{N}]/u;
const EXCERPT_BEFORE = 60;
const EXCERPT_SIZE = 160;

// Acha a primeira ocorrência de um dos termos e devolve a palavra inteira em que ela cai, com o
// índice no texto original, para a interface realçar sem inserir HTML.
function findWord(text: string, terms: string[]): Match | null {
  let normalized = '';
  const offsets: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const fragment = normalize(text[index]!);
    normalized += fragment;
    for (let n = 0; n < fragment.length; n += 1) offsets.push(index);
  }
  // Só vale a ocorrência no começo de uma palavra, como na comparação da busca ("ana" não acha "banana").
  const firstAtWordStart = (term: string) => {
    for (let index = normalized.indexOf(term); index >= 0; index = normalized.indexOf(term, index + 1)) {
      if (index === 0 || !WORD_CHAR.test(normalized[index - 1]!)) return index;
    }
    return -1;
  };
  const hits = terms.map(firstAtWordStart).filter((index) => index >= 0).sort((a, b) => a - b);
  if (!hits.length) return null;
  let start = offsets[hits[0]!] ?? 0;
  let end = start;
  while (start > 0 && WORD_CHAR.test(text[start - 1]!)) start -= 1;
  while (end < text.length && WORD_CHAR.test(text[end]!)) end += 1;
  return { start, length: Math.max(1, end - start) };
}

// Trecho de um campo só, em volta da palavra encontrada, sem cortar palavras no meio. As quebras de
// linha viram espaço (um caractere por outro, para o índice do realce continuar valendo).
function excerptOf(text: string, word: Match) {
  const flat = text.replace(/\s/g, ' ');
  let start = Math.max(0, word.start - EXCERPT_BEFORE);
  let end = Math.min(flat.length, Math.max(start + EXCERPT_SIZE, word.start + word.length));
  if (start > 0) {
    const space = flat.indexOf(' ', start);
    start = space >= 0 && space < word.start ? space + 1 : start;
  }
  if (end < flat.length) {
    const space = flat.lastIndexOf(' ', end);
    end = space > word.start + word.length ? space : end;
  }
  // Tira os espaços das pontas mexendo nos índices (e não com trim), para o realce não se deslocar.
  while (start < word.start && flat[start] === ' ') start += 1;
  while (end > word.start + word.length && flat[end - 1] === ' ') end -= 1;
  // As reticências só aparecem quando ficou texto de fora (e não só espaço).
  const prefix = flat.slice(0, start).trim() ? '…' : '';
  return {
    excerpt: `${prefix}${flat.slice(start, end)}${flat.slice(end).trim() ? '…' : ''}`,
    matchStart: word.start - start + prefix.length,
    matchLength: word.length,
  };
}

function makeResult(input: {
  id: string; type: SearchType; date: string; title: string; titleKey?: string; fields: Field[]; content: Record<string, unknown>;
  intensity?: number[]; emotions?: string[]; updatedAt: Date;
  unreadEligible?: boolean;
}, terms: string[]): SearchResult | null {
  const fields = input.fields.filter((field) => field.text);
  const normalized = termsOf(fields.map((field) => field.text).join('\n'));
  if (!terms.every((term) => normalized.some((value) => value === term || (value.length > 4 && value.startsWith(term))))) return null;
  // O título já aparece no cartão: o trecho vem do primeiro outro campo com a palavra, com o nome dele.
  const titleMatch = input.titleKey ? findWord(input.title, terms) : null;
  let excerpt = { excerpt: '', matchStart: 0, matchLength: 0 };
  let excerptField: string | null = null;
  for (const field of fields) {
    if (field.key === input.titleKey) continue;
    const word = findWord(field.text, terms);
    if (word) {
      excerpt = excerptOf(field.text, word);
      excerptField = field.key;
      break;
    }
  }
  return { id: input.id, type: input.type, date: input.date, title: input.title, titleMatch, content: input.content,
    excerpt: excerpt.excerpt, excerptField, matchStart: excerpt.matchStart, matchLength: excerpt.matchLength,
    intensity: input.intensity ?? [], emotions: input.emotions ?? [], updatedAt: input.updatedAt, unreadEligible: input.unreadEligible ?? true };
}

export function createRecordSearchService() {
  async function search(actorId: string, patientId: string, request: RecordSearchInput, access?: Access, patientPrivacyVersion?: string | null) {
    const today = todayInAppZone();
    const to = request.to ?? today;
    const from = request.from ?? addDays(today, -89);
    const dateFilter = { gte: dateOnlyToDate(from), lte: dateOnlyToDate(to) };
    const timestampFilter = { gte: startOfDayInAppZone(from), lt: startOfDayInAppZone(addDays(to, 1)) };
    const enabled = (type: SearchType) => {
      const rule = rules[type];
      if (request.types?.length && !request.types.includes(type)) return false;
      if (access) {
        if (rule.shared && !access.sharedAreas.includes(rule.shared)) return false;
        if (rule.privacy && (!coversArea(access.patientPrivacyVersion, rule.privacy) || !coversArea(access.therapistPrivacyVersion, rule.privacy))) return false;
      } else if (rule.privacy && !coversArea(patientPrivacyVersion ?? null, rule.privacy)) return false;
      return true;
    };
    const terms = termsOf(request.term);
    if (!terms.length) return { results: [], page: request.page, pageSize: request.pageSize, total: 0, hasMore: false };
    const candidates: SearchResult[] = [];
    const add = (row: SearchResult | null) => { if (row) candidates.push(row); };

    if (enabled('ACTIVITY')) {
      const rows = await prisma.activity.findMany({ where: { userId: patientId, activityDate: dateFilter }, select: { id: true, name: true, activityDate: true, createdAt: true, updatedAt: true, status: true, observation: true, wantBefore: true, pleasure: true, achievement: true }, orderBy: [{ activityDate: 'desc' }, { createdAt: 'desc' }] });
      for (const row of rows) add(makeResult({ id: row.id, type: 'ACTIVITY', date: dateToDateOnly(row.activityDate), title: row.name, titleKey: 'name',
        fields: [{ key: 'name', text: row.name }, { key: 'observation', text: row.observation ?? '' }], content: { name: row.name, status: row.status, observation: row.observation, wantBefore: row.wantBefore, pleasure: row.pleasure, achievement: row.achievement },
        intensity: [row.wantBefore, row.pleasure, row.achievement].filter((value): value is number => value !== null), updatedAt: row.updatedAt }, terms));
    }
    if (enabled('THOUGHT_RECORD')) {
      const rows = await prisma.thoughtRecord.findMany({ where: { userId: patientId, situationDate: dateFilter }, select: { id: true, situationDate: true, situation: true, automaticThought: true, beliefLevel: true, behavior: true, consequence: true, alternativeExplanation: true, updatedAt: true, createdAt: true, emotions: { select: { emotion: true, otherLabel: true, intensity: true, intensityAfter: true } } }, orderBy: [{ situationDate: 'desc' }, { createdAt: 'desc' }] });
      for (const row of rows) add(makeResult({ id: row.id, type: 'THOUGHT_RECORD', date: dateToDateOnly(row.situationDate), title: row.automaticThought, titleKey: 'automaticThought',
        fields: [{ key: 'automaticThought', text: row.automaticThought }, { key: 'situation', text: row.situation }, { key: 'behavior', text: row.behavior },
          { key: 'consequence', text: row.consequence }, { key: 'alternativeExplanation', text: row.alternativeExplanation ?? '' },
          { key: 'emotions', text: row.emotions.map((e) => e.otherLabel ?? EMOTION_LABELS[e.emotion] ?? e.emotion).join(', ') }],
        content: { situation: row.situation, automaticThought: row.automaticThought, beliefLevel: row.beliefLevel, emotions: row.emotions.map((e) => ({ emotion: e.emotion, label: e.otherLabel, intensity: e.intensity, intensityAfter: e.intensityAfter })), behavior: row.behavior, consequence: row.consequence, alternativeExplanation: row.alternativeExplanation },
        intensity: [row.beliefLevel, ...row.emotions.flatMap((e) => [e.intensity, e.intensityAfter].filter((value): value is number => value !== null))], emotions: row.emotions.map((e) => e.otherLabel ?? e.emotion), updatedAt: row.updatedAt }, terms));
    }
    if (enabled('TENSION_EPISODE')) {
      const rows = await prisma.tensionEpisode.findMany({ where: { userId: patientId, episodeDate: dateFilter }, select: { id: true, episodeDate: true, situation: true, behavior: true, consequence: true, tensionLevel: true, vocalizeUrge: true, createdAt: true, updatedAt: true }, orderBy: [{ episodeDate: 'desc' }, { createdAt: 'desc' }] });
      for (const row of rows) add(makeResult({ id: row.id, type: 'TENSION_EPISODE', date: dateToDateOnly(row.episodeDate), title: row.situation, titleKey: 'situation',
        fields: [{ key: 'situation', text: row.situation }, { key: 'behavior', text: row.behavior }, { key: 'consequence', text: row.consequence }], content: { situation: row.situation, behavior: row.behavior, consequence: row.consequence, tensionLevel: row.tensionLevel, vocalizeUrge: row.vocalizeUrge },
        intensity: [row.tensionLevel, row.vocalizeUrge], updatedAt: row.updatedAt }, terms));
    }
    if (enabled('ACTION')) {
      const rows = await prisma.behavioralAction.findMany({ where: { userId: patientId, actionDate: dateFilter }, select: { id: true, name: true, actionDate: true, category: true, status: true, observation: true, expectation: true, pleasure: true, achievement: true, createdAt: true, updatedAt: true }, orderBy: [{ actionDate: 'desc' }, { createdAt: 'desc' }] });
      for (const row of rows) add(makeResult({ id: row.id, type: 'ACTION', date: dateToDateOnly(row.actionDate), title: row.name, titleKey: 'name',
        fields: [{ key: 'name', text: row.name }, { key: 'observation', text: row.observation ?? '' }], content: { name: row.name, category: row.category, status: row.status, observation: row.observation, expectation: row.expectation, pleasure: row.pleasure, achievement: row.achievement },
        intensity: [row.expectation, row.pleasure, row.achievement].filter((value): value is number => value !== null), updatedAt: row.updatedAt }, terms));
    }
    if (enabled('ABOUT_ME')) {
      const row = await prisma.patientAbout.findUnique({ where: { userId: patientId }, select: { id: true, aboutMe: true, goals: true, habits: true, updatedAt: true } });
      if (row && row.updatedAt >= timestampFilter.gte && row.updatedAt < timestampFilter.lt) add(makeResult({ id: row.id, type: 'ABOUT_ME', date: todayInAppZone(row.updatedAt), title: 'Sobre mim',
        fields: [{ key: 'aboutMe', text: row.aboutMe ?? '' }, { key: 'goals', text: row.goals ?? '' }, { key: 'habits', text: row.habits ?? '' }], content: { aboutMe: row.aboutMe, goals: row.goals, habits: row.habits }, updatedAt: row.updatedAt }, terms));
    }
    if (enabled('PLAN_ENTRY')) {
      const rows = await prisma.planEntry.findMany({ where: { userId: patientId, entryDate: dateFilter }, select: { id: true, planId: true, entryDate: true, entryTime: true, questions: true, answers: true, updatedAt: true, createdAt: true, plan: { select: { title: true } } }, orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }] });
      for (const row of rows) add(makeResult({ id: row.id, type: 'PLAN_ENTRY', date: dateToDateOnly(row.entryDate), title: row.plan.title, titleKey: 'planTitle',
        fields: [{ key: 'planTitle', text: row.plan.title }, ...row.answers.map((text) => ({ key: 'answers', text })), ...row.questions.map((text) => ({ key: 'questions', text }))], content: { planId: row.planId, questions: row.questions, answers: row.answers, entryTime: row.entryTime }, updatedAt: row.updatedAt }, terms));
    }
    if (enabled('TASK')) {
      const rows = await prisma.homeworkTask.findMany({ where: { userId: patientId, createdAt: timestampFilter }, select: { id: true, createdAt: true, title: true, description: true, responseText: true, responseStatus: true, respondedAt: true, updatedAt: true }, orderBy: { createdAt: 'desc' } });
      for (const row of rows) add(makeResult({ id: row.id, type: 'TASK', date: todayInAppZone(row.createdAt), title: row.title ?? 'Tarefa', ...(row.title && { titleKey: 'title' }),
        fields: [{ key: 'title', text: row.title ?? '' }, { key: 'description', text: row.description }, { key: 'responseText', text: row.responseText ?? '' },
          { key: 'responseStatus', text: row.responseStatus ? RESPONSE_LABELS[row.responseStatus] ?? '' : '' }], content: { title: row.title, description: row.description, responseText: row.responseText, responseStatus: row.responseStatus }, updatedAt: row.updatedAt, unreadEligible: row.respondedAt !== null }, terms));
    }
    if (enabled('SLEEP_MOOD') || enabled('MEDICATION')) {
      const rows = await prisma.dailyCheckIn.findMany({ where: { userId: patientId, checkInDate: dateFilter }, select: { id: true, checkInDate: true, moodWord: true, sleepQuality: true, mood: true, bedTime: true, wakeTime: true, medication: true, updatedAt: true }, orderBy: { checkInDate: 'desc' } });
      for (const row of rows) {
        if (enabled('SLEEP_MOOD')) add(makeResult({ id: row.id, type: 'SLEEP_MOOD', date: dateToDateOnly(row.checkInDate), title: 'Sono e humor',
          fields: [{ key: 'moodWord', text: row.moodWord ?? '' }], content: { moodWord: row.moodWord, sleepQuality: row.sleepQuality, mood: row.mood, bedTime: row.bedTime, wakeTime: row.wakeTime }, intensity: [row.sleepQuality, row.mood].filter((value): value is number => value !== null), updatedAt: row.updatedAt }, terms));
        if (enabled('MEDICATION') && row.medication) add(makeResult({ id: row.id, type: 'MEDICATION', date: dateToDateOnly(row.checkInDate), title: 'Remédio do dia',
          fields: [{ key: 'medication', text: row.medication }], content: { medication: row.medication }, updatedAt: row.updatedAt }, terms));
      }
    }

    let unreadIds = new Set<string>();
    if (access) {
      const idsByMark = new Map<string, string[]>();
      for (const result of candidates) {
        const mark = rules[result.type].mark;
        if (mark) idsByMark.set(mark, [...(idsByMark.get(mark) ?? []), result.id]);
      }
      const marks = idsByMark.size
        ? await prisma.readMark.findMany({ where: { therapistId: actorId, patientId,
          OR: [...idsByMark].map(([field, ids]) => ({ [field]: { in: ids } })) as never },
          select: { readAt: true, thoughtRecordId: true, tensionEpisodeId: true, actionId: true, aboutId: true, planEntryId: true, taskId: true },
        })
        : [];
      const readAt = new Map<string, Date>();
      for (const mark of marks) {
        for (const [field, value] of Object.entries({ thoughtRecordId: mark.thoughtRecordId, tensionEpisodeId: mark.tensionEpisodeId, actionId: mark.actionId, aboutId: mark.aboutId, planEntryId: mark.planEntryId, taskId: mark.taskId })) {
          if (value) readAt.set(`${field}:${value}`, mark.readAt);
        }
      }
      unreadIds = new Set(candidates.filter((item) => {
        const field = rules[item.type].mark;
        return item.unreadEligible && field && (!readAt.has(`${field}:${item.id}`) || readAt.get(`${field}:${item.id}`)! < item.updatedAt);
      }).map((item) => item.id));
      for (const item of candidates) item.unread = Boolean(rules[item.type].mark && unreadIds.has(item.id));
    }
    const filtered = candidates.filter((item) => {
      if (request.emotion && !item.emotions.some((value) => normalize(value) === normalize(request.emotion!))) return false;
      if (request.minIntensity !== undefined && !item.intensity.some((value) => value >= request.minIntensity!)) return false;
      if (request.onlyUnread && !unreadIds.has(item.id)) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.getTime() - a.updatedAt.getTime());
    const start = (request.page - 1) * request.pageSize;
    return { results: filtered.slice(start, start + request.pageSize).map(({ intensity: _i, emotions: _e, updatedAt: _u, unreadEligible: _eligible, ...item }) => item),
      page: request.page, pageSize: request.pageSize, total: filtered.length, hasMore: start + request.pageSize < filtered.length };
  }
  return { search };
}
