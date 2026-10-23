import { AppError } from '../../errors/app-error.js';
import type { Prisma, ThoughtRecord, ThoughtRecordEmotion } from '../../generated/prisma/client.js';
import {
  dateOnlyToDate,
  dateToDateOnly,
  nowTimeInAppZone,
  startOfDayInAppZone,
  todayInAppZone,
} from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { loadAgenda } from '../appointments/appointments.service.js';
import { firstSessionAfter, hasStarted, scheduledSessionsFrom, type Session } from '../appointments/sessions.js';
import {
  EMOTIONS,
  type AddAlternativeInput,
  type CreateThoughtRecordInput,
  type EmotionInput,
  type ListThoughtRecordsQuery,
  type UpdateThoughtRecordInput,
} from './thought-records.schema.js';

// Registro de Pensamentos (SPEC, "Registro de Pensamentos"; DEC-039).

type RecordWithEmotions = ThoughtRecord & { emotions: ThoughtRecordEmotion[] };

// A sessão que fecha o prazo da explicação alternativa (DEC-054): dia e hora em São Paulo.
export type AlternativeDeadline = { date: string; time: string | null };

export type PublicThoughtRecord = {
  id: string;
  situationDate: string;
  situation: string;
  automaticThought: string;
  beliefLevel: number;
  emotions: {
    emotion: ThoughtRecordEmotion['emotion'];
    intensity: number;
    // "Como me sinto agora", depois da alternativa (DEC-054).
    intensityAfter: number | null;
    otherLabel: string | null;
  }[];
  behavior: string;
  consequence: string;
  alternativeExplanation: string | null;
  alternativeAddedAt: string | null;
  // Ainda dá para editar ou excluir: foi registrado hoje (São Paulo). O "hoje" fica na API.
  editable: boolean;
  // A próxima consulta depois do registro, que fecha o prazo para adicionar a alternativa depois
  // do dia; null sem consulta agendada (DEC-054).
  alternativeDeadline: AlternativeDeadline | null;
  // Dá para adicionar a alternativa pela rota própria: passou o dia, ainda está vazia e a consulta
  // ainda não começou.
  canAddAlternative: boolean;
  createdAt: string;
  updatedAt: string;
};

// Editar e excluir só no dia em que o registro foi feito (DEC-039). Função pura para os testes.
export function isEditable(createdAt: Date, now: Date = new Date()): boolean {
  return todayInAppZone(createdAt) === todayInAppZone(now);
}

// A situação já aconteceu: só até hoje.
export function isFutureDate(situationDate: string, today: string): boolean {
  // 'AAAA-MM-DD' compara certo como texto.
  return situationDate > today;
}

// Prazo da explicação alternativa (DEC-054): a primeira consulta agendada que ainda não tinha
// começado quando o registro foi feito. Funções puras, para testar as bordas sem banco.
export function deadlineFor(sessions: Session[], createdAt: Date): AlternativeDeadline | null {
  const session = firstSessionAfter(sessions, todayInAppZone(createdAt), nowTimeInAppZone(createdAt));
  return session && { date: session.date, time: session.time };
}

// O instante em que a consulta começa. Sem hora (avulsa antiga), o começo do dia.
export function deadlineInstant(deadline: AlternativeDeadline): Date {
  const [hours, minutes] = (deadline.time ?? '00:00').split(':').map(Number);
  return new Date(startOfDayInAppZone(deadline.date).getTime() + (hours! * 60 + minutes!) * 60_000);
}

// Vale o que vier primeiro: o prazo congelado no registro ou a consulta pela agenda de agora.
// Desmarcar ou apagar uma consulta que já passou não reabre o prazo; antecipar a consulta encurta.
export function effectiveDeadline(frozen: Date | null, current: AlternativeDeadline | null): AlternativeDeadline | null {
  if (!frozen) return current;
  if (current && deadlineInstant(current) < frozen) return current;
  return { date: todayInAppZone(frozen), time: nowTimeInAppZone(frozen) };
}

// Vale até a hora marcada: consulta às 10:00, dá até as 09:59. Sem hora (avulsa antiga), até o dia
// anterior, como em hasStarted.
export function isBeforeDeadline(deadline: AlternativeDeadline, now: Date = new Date()): boolean {
  return !hasStarted(deadline, todayInAppZone(now), nowTimeInAppZone(now));
}

// Sem o userId: quem pede já é o dono, ou a terapeuta, que sabe de quem pediu.
export function toPublicThoughtRecord(
  record: RecordWithEmotions,
  sessions: Session[],
  now: Date = new Date(),
): PublicThoughtRecord {
  const emotions = [...record.emotions].sort((a, b) => EMOTIONS.indexOf(a.emotion) - EMOTIONS.indexOf(b.emotion));
  const editable = isEditable(record.createdAt, now);
  const alternativeDeadline = effectiveDeadline(record.alternativeDeadlineAt, deadlineFor(sessions, record.createdAt));
  return {
    id: record.id,
    situationDate: dateToDateOnly(record.situationDate),
    situation: record.situation,
    automaticThought: record.automaticThought,
    beliefLevel: record.beliefLevel,
    emotions: emotions.map(({ emotion, intensity, intensityAfter, otherLabel }) => ({
      emotion,
      intensity,
      intensityAfter,
      otherLabel,
    })),
    behavior: record.behavior,
    consequence: record.consequence,
    alternativeExplanation: record.alternativeExplanation,
    alternativeAddedAt: record.alternativeAddedAt?.toISOString() ?? null,
    editable,
    alternativeDeadline,
    canAddAlternative:
      !editable &&
      record.alternativeExplanation === null &&
      alternativeDeadline !== null &&
      isBeforeDeadline(alternativeDeadline, now),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function notFound() {
  return new AppError(404, 'THOUGHT_RECORD_NOT_FOUND', 'Registro não encontrado.');
}

// SPEC (Autorização): dado de outra pessoa é 403.
function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso a este registro.');
}

// 409 e não 403, como na atividade finalizada: a pessoa tem permissão; é o prazo que acabou.
export function thoughtRecordLocked() {
  return new AppError(
    409,
    'THOUGHT_RECORD_LOCKED',
    'Este registro só podia ser alterado no dia em que foi feito.',
  );
}

function futureDate() {
  return new AppError(400, 'DATE_IN_FUTURE', 'A situação precisa ser de hoje ou de um dia anterior.');
}

// 409, como o registro travado: a pessoa tem permissão; é o estado do registro que não deixa.
function alternativeAlreadySet() {
  return new AppError(409, 'ALTERNATIVE_ALREADY_SET', 'Este registro já tem uma explicação alternativa.');
}

function noNextAppointment() {
  return new AppError(
    409,
    'NO_NEXT_APPOINTMENT',
    'Agende a sua próxima consulta para poder adicionar a explicação alternativa.',
  );
}

function alternativeDeadlinePassed() {
  return new AppError(
    409,
    'ALTERNATIVE_DEADLINE_PASSED',
    'A explicação alternativa podia ser adicionada até a hora da consulta seguinte ao registro.',
  );
}

function needsAlternative() {
  return new AppError(400, 'ALTERNATIVE_REQUIRED', 'Para dizer como se sente agora, escreva a explicação alternativa.');
}

function emotionsMismatch() {
  return new AppError(400, 'EMOTIONS_MISMATCH', 'Reavalie todas as emoções deste registro, uma vez cada.');
}

const withEmotions = { emotions: true } as const;

function emotionRows(emotions: EmotionInput[]) {
  return emotions.map(({ emotion, intensity, intensityAfter, otherLabel }) => ({
    emotion,
    intensity,
    intensityAfter: intensityAfter ?? null,
    otherLabel: otherLabel ?? null,
  }));
}

// As sessões agendadas desde o registro mais antigo, para o prazo de cada um (DEC-054). Uma
// leitura da agenda por pedido, e não uma por registro.
async function sessionsSince(userId: string, records: Pick<ThoughtRecord, 'createdAt'>[]): Promise<Session[]> {
  if (records.length === 0) return [];
  const oldest = records.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
  return scheduledSessionsFrom(await loadAgenda(prisma, userId), todayInAppZone(oldest.createdAt), todayInAppZone());
}

// Congela o prazo dos registros que ainda não têm (os de antes do prazo congelado e os feitos sem
// consulta agendada) na primeira vez que a paciente os vê com uma consulta pela frente (DEC-054).
// Depois disso, mexer no passado da agenda também não reabre o prazo deles. Escrita condicional:
// nunca troca um prazo já congelado. Só na leitura da paciente; a da terapeuta não grava nada.
async function freezeMissingDeadlines(records: ThoughtRecord[], sessions: Session[]) {
  for (const record of records) {
    if (record.alternativeDeadlineAt !== null || record.alternativeExplanation !== null) continue;
    const deadline = deadlineFor(sessions, record.createdAt);
    if (!deadline) continue;
    const at = deadlineInstant(deadline);
    // O updatedAt fica como estava: congelar o prazo não muda o registro, e a marca de leitura da
    // terapeuta compara com o updatedAt para saber se ele mudou depois de lido (DEC-057).
    // Só congela se o registro não mudou desde a leitura: senão, voltaria o updatedAt de uma
    // edição feita no meio e a terapeuta a veria como lida. Fica para a próxima leitura.
    const { count } = await prisma.thoughtRecord.updateMany({
      where: { id: record.id, alternativeDeadlineAt: null, updatedAt: record.updatedAt },
      data: { alternativeDeadlineAt: at, updatedAt: record.updatedAt },
    });
    if (count === 0) continue;
    record.alternativeDeadlineAt = at;
  }
}

// A data em que a alternativa entrou: marcada quando aparece, mantida quando o texto muda e apagada
// junto com ela (DEC-054).
function alternativeChange(record: ThoughtRecord, alternative: string | null | undefined) {
  if (alternative === undefined) return {};
  if (alternative === null) return { alternativeExplanation: null, alternativeAddedAt: null };
  return { alternativeExplanation: alternative, alternativeAddedAt: record.alternativeAddedAt ?? new Date() };
}

async function findOwned(userId: string, id: string): Promise<ThoughtRecord> {
  const record = await prisma.thoughtRecord.findUnique({ where: { id } });
  if (!record) throw notFound();
  if (record.userId !== userId) throw forbidden();
  return record;
}

// Escrita condicional (como na DEC-028): só vale se o registro ainda é de hoje no momento em que
// grava. Fecha a janela de uma requisição que passa da conferência pouco antes da meia-noite.
// O userId repete a conferência do findOwned: segunda linha de defesa da regra 1.
function stillEditable(userId: string, id: string): Prisma.ThoughtRecordWhereInput {
  return { id, userId, createdAt: { gte: startOfDayInAppZone(todayInAppZone()) } };
}

// Explica uma escrita condicional que não alterou nada. Dentro de uma transação, lê por ela.
async function conflictAfterRace(id: string, db: Prisma.TransactionClient = prisma): Promise<AppError> {
  const exists = await db.thoughtRecord.findUnique({ where: { id }, select: { id: true } });
  return exists ? thoughtRecordLocked() : notFound();
}

export function createThoughtRecordsService() {
  // freezeDeadlines: só na leitura da própria paciente (veja freezeMissingDeadlines).
  async function list(userId: string, { from, to }: ListThoughtRecordsQuery, { freezeDeadlines = false } = {}) {
    const records = await prisma.thoughtRecord.findMany({
      where: { userId, situationDate: { gte: dateOnlyToDate(from), lte: dateOnlyToDate(to) } },
      include: withEmotions,
      // Sem horário: dentro do dia, vale a ordem em que foram registrados.
      orderBy: [{ situationDate: 'asc' }, { createdAt: 'asc' }],
    });
    const now = new Date();
    const sessions = await sessionsSince(userId, records);
    if (freezeDeadlines) await freezeMissingDeadlines(records, sessions);
    return records.map((record) => toPublicThoughtRecord(record, sessions, now));
  }

  // Um registro só, para a página de edição (DEC-040).
  // Uma leitura só: se o registro sumir no meio (excluído em outra aba), é 404, e não 500.
  async function get(userId: string, id: string) {
    const record = await prisma.thoughtRecord.findUnique({ where: { id }, include: withEmotions });
    if (!record) throw notFound();
    if (record.userId !== userId) throw forbidden();
    const sessions = await sessionsSince(userId, [record]);
    // Rota só da paciente: congela como na lista.
    await freezeMissingDeadlines([record], sessions);
    return toPublicThoughtRecord(record, sessions);
  }

  async function create(userId: string, input: CreateThoughtRecordInput) {
    if (isFutureDate(input.situationDate, todayInAppZone())) throw futureDate();

    // O prazo da alternativa fica congelado agora: a próxima consulta deste momento (DEC-054).
    const createdAt = new Date();
    const sessions = await sessionsSince(userId, [{ createdAt }]);
    const deadline = deadlineFor(sessions, createdAt);

    const { emotions, situationDate, ...rest } = input;
    const record = await prisma.thoughtRecord.create({
      data: {
        ...rest,
        userId,
        situationDate: dateOnlyToDate(situationDate),
        createdAt,
        alternativeAddedAt: rest.alternativeExplanation === undefined ? null : createdAt,
        alternativeDeadlineAt: deadline && deadlineInstant(deadline),
        emotions: { create: emotionRows(emotions) },
      },
      include: withEmotions,
    });
    return toPublicThoughtRecord(record, sessions);
  }

  async function update(userId: string, id: string, input: UpdateThoughtRecordInput) {
    const record = await findOwned(userId, id);
    if (!isEditable(record.createdAt)) throw thoughtRecordLocked();
    if (input.situationDate && isFutureDate(input.situationDate, todayInAppZone())) throw futureDate();

    // A reavaliação depende da alternativa que vai ficar: a que veio ou a que já estava (DEC-054).
    const { emotions, situationDate, alternativeExplanation, ...rest } = input;
    const finalAlternative =
      alternativeExplanation === undefined ? record.alternativeExplanation : alternativeExplanation;
    if (finalAlternative === null && emotions?.some((e) => e.intensityAfter !== undefined)) throw needsAlternative();

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.thoughtRecord.updateMany({
        where: stillEditable(userId, id),
        data: {
          ...rest,
          situationDate: situationDate ? dateOnlyToDate(situationDate) : undefined,
          ...alternativeChange(record, alternativeExplanation),
          // Explícito: as emoções ficam noutra tabela, e uma edição só delas não mudaria o
          // updatedAt. A marca de leitura da terapeuta depende dele (DEC-057).
          updatedAt: new Date(),
        },
      });
      if (count === 0) throw await conflictAfterRace(id, tx);

      // A lista nova substitui a antiga inteira.
      if (emotions) {
        await tx.thoughtRecordEmotion.deleteMany({ where: { recordId: id } });
        await tx.thoughtRecordEmotion.createMany({
          data: emotionRows(emotions).map((row) => ({ ...row, recordId: id })),
        });
      } else if (finalAlternative === null) {
        // Sem alternativa, não há "como me sinto agora".
        await tx.thoughtRecordEmotion.updateMany({ where: { recordId: id }, data: { intensityAfter: null } });
      }
    });

    const updated = await prisma.thoughtRecord.findUniqueOrThrow({ where: { id }, include: withEmotions });
    return toPublicThoughtRecord(updated, await sessionsSince(userId, [updated]));
  }

  // Explicação alternativa depois do dia do registro (DEC-054): uma vez só, até a hora da próxima
  // consulta. No dia do registro também vale, como no PATCH.
  async function addAlternative(userId: string, id: string, input: AddAlternativeInput) {
    const record = await prisma.thoughtRecord.findUnique({ where: { id }, include: withEmotions });
    if (!record) throw notFound();
    if (record.userId !== userId) throw forbidden();
    if (record.alternativeExplanation !== null) throw alternativeAlreadySet();

    if (!isEditable(record.createdAt)) {
      const deadline = effectiveDeadline(
        record.alternativeDeadlineAt,
        deadlineFor(await sessionsSince(userId, [record]), record.createdAt),
      );
      if (!deadline) throw noNextAppointment();
      if (!isBeforeDeadline(deadline)) throw alternativeDeadlinePassed();
    }

    const { emotionsAfter } = input;
    if (emotionsAfter) {
      const recorded = new Set(record.emotions.map((e) => e.emotion));
      const same = emotionsAfter.length === recorded.size && emotionsAfter.every((e) => recorded.has(e.emotion));
      if (!same) throw emotionsMismatch();
    }

    await prisma.$transaction(async (tx) => {
      // Escrita condicional: dois envios ao mesmo tempo gravam uma vez só.
      const { count } = await tx.thoughtRecord.updateMany({
        where: { id, userId, alternativeExplanation: null },
        data: { alternativeExplanation: input.alternativeExplanation, alternativeAddedAt: new Date() },
      });
      if (count === 0) throw alternativeAlreadySet();
      for (const { emotion, intensityAfter } of emotionsAfter ?? []) {
        await tx.thoughtRecordEmotion.updateMany({ where: { recordId: id, emotion }, data: { intensityAfter } });
      }
    });

    const updated = await prisma.thoughtRecord.findUniqueOrThrow({ where: { id }, include: withEmotions });
    return toPublicThoughtRecord(updated, await sessionsSince(userId, [updated]));
  }

  async function remove(userId: string, id: string) {
    const record = await findOwned(userId, id);
    if (!isEditable(record.createdAt)) throw thoughtRecordLocked();

    // As emoções saem em cascata no banco.
    const { count } = await prisma.thoughtRecord.deleteMany({ where: stillEditable(userId, id) });
    if (count === 0) throw await conflictAfterRace(id);
  }

  // Registros escolhidos por id, de qualquer data, na ordem da lista: a visão "Não lidos" da
  // terapeuta (DEC-057). Só leitura: não congela prazos.
  async function listByIds(userId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const records = await prisma.thoughtRecord.findMany({
      where: { userId, id: { in: ids } },
      include: withEmotions,
      orderBy: [{ situationDate: 'asc' }, { createdAt: 'asc' }],
    });
    const now = new Date();
    const sessions = await sessionsSince(userId, records);
    return records.map((record) => toPublicThoughtRecord(record, sessions, now));
  }

  return { list, listByIds, get, create, update, addAlternative, remove };
}

export type ThoughtRecordsService = ReturnType<typeof createThoughtRecordsService>;
