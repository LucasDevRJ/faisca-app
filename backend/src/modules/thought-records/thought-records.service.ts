import { AppError } from '../../errors/app-error.js';
import type { Prisma, ThoughtRecord, ThoughtRecordEmotion } from '../../generated/prisma/client.js';
import { dateOnlyToDate, dateToDateOnly, startOfDayInAppZone, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import {
  EMOTIONS,
  type CreateThoughtRecordInput,
  type EmotionInput,
  type ListThoughtRecordsQuery,
  type UpdateThoughtRecordInput,
} from './thought-records.schema.js';

// Registro de Pensamentos (SPEC, "Registro de Pensamentos"; DEC-039).

type RecordWithEmotions = ThoughtRecord & { emotions: ThoughtRecordEmotion[] };

export type PublicThoughtRecord = {
  id: string;
  situationDate: string;
  situation: string;
  automaticThought: string;
  beliefLevel: number;
  emotions: { emotion: ThoughtRecordEmotion['emotion']; intensity: number; otherLabel: string | null }[];
  behavior: string;
  consequence: string;
  // Ainda dá para editar ou excluir: foi registrado hoje (São Paulo). O "hoje" fica na API.
  editable: boolean;
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

// Sem o userId: quem pede já é o dono, ou a terapeuta, que sabe de quem pediu.
export function toPublicThoughtRecord(record: RecordWithEmotions, now: Date = new Date()): PublicThoughtRecord {
  const emotions = [...record.emotions].sort((a, b) => EMOTIONS.indexOf(a.emotion) - EMOTIONS.indexOf(b.emotion));
  return {
    id: record.id,
    situationDate: dateToDateOnly(record.situationDate),
    situation: record.situation,
    automaticThought: record.automaticThought,
    beliefLevel: record.beliefLevel,
    emotions: emotions.map(({ emotion, intensity, otherLabel }) => ({ emotion, intensity, otherLabel })),
    behavior: record.behavior,
    consequence: record.consequence,
    editable: isEditable(record.createdAt, now),
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

const withEmotions = { emotions: true } as const;

function emotionRows(emotions: EmotionInput[]) {
  return emotions.map(({ emotion, intensity, otherLabel }) => ({
    emotion,
    intensity,
    otherLabel: otherLabel ?? null,
  }));
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
  async function list(userId: string, { from, to }: ListThoughtRecordsQuery) {
    const records = await prisma.thoughtRecord.findMany({
      where: { userId, situationDate: { gte: dateOnlyToDate(from), lte: dateOnlyToDate(to) } },
      include: withEmotions,
      // Sem horário: dentro do dia, vale a ordem em que foram registrados.
      orderBy: [{ situationDate: 'asc' }, { createdAt: 'asc' }],
    });
    const now = new Date();
    return records.map((record) => toPublicThoughtRecord(record, now));
  }

  // Um registro só, para a página de edição (DEC-040).
  // Uma leitura só: se o registro sumir no meio (excluído em outra aba), é 404, e não 500.
  async function get(userId: string, id: string) {
    const record = await prisma.thoughtRecord.findUnique({ where: { id }, include: withEmotions });
    if (!record) throw notFound();
    if (record.userId !== userId) throw forbidden();
    return toPublicThoughtRecord(record);
  }

  async function create(userId: string, input: CreateThoughtRecordInput) {
    if (isFutureDate(input.situationDate, todayInAppZone())) throw futureDate();

    const { emotions, situationDate, ...rest } = input;
    const record = await prisma.thoughtRecord.create({
      data: {
        ...rest,
        userId,
        situationDate: dateOnlyToDate(situationDate),
        emotions: { create: emotionRows(emotions) },
      },
      include: withEmotions,
    });
    return toPublicThoughtRecord(record);
  }

  async function update(userId: string, id: string, input: UpdateThoughtRecordInput) {
    const record = await findOwned(userId, id);
    if (!isEditable(record.createdAt)) throw thoughtRecordLocked();
    if (input.situationDate && isFutureDate(input.situationDate, todayInAppZone())) throw futureDate();

    const { emotions, situationDate, ...rest } = input;
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.thoughtRecord.updateMany({
        where: stillEditable(userId, id),
        data: { ...rest, situationDate: situationDate ? dateOnlyToDate(situationDate) : undefined },
      });
      if (count === 0) throw await conflictAfterRace(id, tx);

      // A lista nova substitui a antiga inteira.
      if (emotions) {
        await tx.thoughtRecordEmotion.deleteMany({ where: { recordId: id } });
        await tx.thoughtRecordEmotion.createMany({
          data: emotionRows(emotions).map((row) => ({ ...row, recordId: id })),
        });
      }
    });

    return toPublicThoughtRecord(
      await prisma.thoughtRecord.findUniqueOrThrow({ where: { id }, include: withEmotions }),
    );
  }

  async function remove(userId: string, id: string) {
    const record = await findOwned(userId, id);
    if (!isEditable(record.createdAt)) throw thoughtRecordLocked();

    // As emoções saem em cascata no banco.
    const { count } = await prisma.thoughtRecord.deleteMany({ where: stillEditable(userId, id) });
    if (count === 0) throw await conflictAfterRace(id);
  }

  return { list, get, create, update, remove };
}

export type ThoughtRecordsService = ReturnType<typeof createThoughtRecordsService>;
