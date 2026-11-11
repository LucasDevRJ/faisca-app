import { AppError } from '../../errors/app-error.js';
import type { Plan, PlanEntry, Prisma } from '../../generated/prisma/client.js';
import {
  dateOnlyToDate,
  dateToDateOnly,
  dateToTimeOnly,
  startOfDayInAppZone,
  timeOnlyToDate,
  todayInAppZone,
} from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { futureMoment, isEditable } from '../tension-episodes/tension-episodes.service.js';
import {
  PLANS_MAX,
  type CreatePlanEntryInput,
  type CreatePlanInput,
  type ListPlanEntriesQuery,
  type UpdatePlanEntryInput,
  type UpdatePlanInput,
} from './plans.schema.js';

// Meus Planos, 1ª entrega (SPEC, "Meus Planos"; DEC-094). Só o paciente escreve; a terapeuta lê
// pelos mesmos services, atrás do requireActiveLink.

export type PublicPlan = {
  id: string;
  title: string;
  questions: string[];
  archived: boolean;
  archivedAt: string | null;
  // Com registros, o plano não pode ser apagado, só encerrado. Não é contador para a tela.
  hasEntries: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PublicPlanEntry = {
  id: string;
  planId: string;
  // O nome atual do plano, para a visão "Para ler", que junta registros de vários planos.
  planTitle: string;
  entryDate: string;
  // 'HH:MM' no relógio de São Paulo, ou null quando a pessoa não informou.
  entryTime: string | null;
  // As perguntas como estavam no registro, e as respostas na mesma ordem ('' = não respondida).
  questions: string[];
  answers: string[];
  // Ainda dá para editar ou excluir: foi registrado hoje (São Paulo), como na Tensão.
  editable: boolean;
  createdAt: string;
  updatedAt: string;
};

type PlanWithCount = Plan & { _count: { entries: number } };
type EntryWithPlan = PlanEntry & { plan: { title: string } };

// Sem o userId: quem pede já é o dono, ou a terapeuta, que sabe de quem pediu.
function toPublicPlan(plan: PlanWithCount): PublicPlan {
  return {
    id: plan.id,
    title: plan.title,
    questions: plan.questions,
    archived: plan.archivedAt !== null,
    archivedAt: plan.archivedAt?.toISOString() ?? null,
    hasEntries: plan._count.entries > 0,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function toPublicPlanEntry(entry: EntryWithPlan, now: Date = new Date()): PublicPlanEntry {
  return {
    id: entry.id,
    planId: entry.planId,
    planTitle: entry.plan.title,
    entryDate: dateToDateOnly(entry.entryDate),
    entryTime: entry.entryTime ? dateToTimeOnly(entry.entryTime) : null,
    questions: entry.questions,
    answers: entry.answers,
    editable: isEditable(entry.createdAt, now),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

const withCount = { _count: { select: { entries: true } } } as const;
const withPlanTitle = { plan: { select: { title: true } } } as const;
// No dia, pela hora; os sem hora vão para o fim, na ordem em que foram registrados.
const entryOrder: Prisma.PlanEntryOrderByWithRelationInput[] = [
  { entryDate: 'asc' },
  { entryTime: { sort: 'asc', nulls: 'last' } },
  { createdAt: 'asc' },
];

function planNotFound() {
  return new AppError(404, 'PLAN_NOT_FOUND', 'Plano não encontrado.');
}

function entryNotFound() {
  return new AppError(404, 'PLAN_ENTRY_NOT_FOUND', 'Registro não encontrado.');
}

// SPEC (Autorização): dado de outra pessoa é 403.
function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso a este registro.');
}

// 409 e não 403: a pessoa tem permissão; é o estado do plano ou o prazo que impede.
export function planEntryLocked() {
  return new AppError(409, 'PLAN_ENTRY_LOCKED', 'Este registro só podia ser alterado no dia em que foi feito.');
}

function planHasEntries() {
  return new AppError(
    409,
    'PLAN_HAS_ENTRIES',
    'Este plano já tem registros e não pode ser apagado. Você pode encerrá-lo: os registros continuam guardados.',
  );
}

function planArchived() {
  return new AppError(409, 'PLAN_ARCHIVED', 'Este plano está encerrado. Reabra o plano para registrar.');
}

function plansLimit() {
  return new AppError(409, 'PLANS_LIMIT', `Dá para ter até ${PLANS_MAX} planos. Apague um plano sem registros para criar outro.`);
}

function answersMismatch() {
  return new AppError(400, 'ANSWERS_MISMATCH', 'Mande uma resposta para cada pergunta do plano.');
}

const FUTURE_MESSAGES = {
  DATE_IN_FUTURE: 'O registro precisa ser de hoje ou de um dia anterior.',
  TIME_IN_FUTURE: 'O registro de hoje precisa ter uma hora que já passou.',
} as const;

function assertNotFuture(entryDate: string, entryTime: string | null) {
  const code = futureMoment(entryDate, entryTime);
  if (code) throw new AppError(400, code, FUTURE_MESSAGES[code]);
}

function timeColumn(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : timeOnlyToDate(value);
}

async function findOwnedPlan(userId: string, id: string): Promise<PlanWithCount> {
  const plan = await prisma.plan.findUnique({ where: { id }, include: withCount });
  if (!plan) throw planNotFound();
  if (plan.userId !== userId) throw forbidden();
  return plan;
}

async function findOwnedEntry(userId: string, id: string): Promise<EntryWithPlan> {
  const entry = await prisma.planEntry.findUnique({ where: { id }, include: withPlanTitle });
  if (!entry) throw entryNotFound();
  if (entry.userId !== userId) throw forbidden();
  return entry;
}

// Escrita condicional (como na DEC-028): só vale se o registro ainda é de hoje no momento em que
// grava. O userId repete a conferência do findOwnedEntry: segunda linha de defesa da regra 1.
function stillEditable(userId: string, id: string): Prisma.PlanEntryWhereInput {
  return { id, userId, createdAt: { gte: startOfDayInAppZone(todayInAppZone()) } };
}

async function conflictAfterRace(id: string): Promise<AppError> {
  const exists = await prisma.planEntry.findUnique({ where: { id }, select: { id: true } });
  return exists ? planEntryLocked() : entryNotFound();
}

export function createPlansService() {
  // Ativos primeiro, depois os encerrados; em cada grupo, do mais novo para o mais antigo.
  async function list(userId: string) {
    const plans = await prisma.plan.findMany({
      where: { userId },
      include: withCount,
      orderBy: [{ archivedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
    });
    return plans.map(toPublicPlan);
  }

  async function get(userId: string, id: string) {
    return toPublicPlan(await findOwnedPlan(userId, id));
  }

  // Trava a conta antes de contar, como nas fotos da Ação: pedidos ao mesmo tempo não passam juntos
  // do teto (achado do revisor-seguranca). NO KEY: não segura quem só grava em outra tabela que
  // aponta para a conta.
  async function create(userId: string, input: CreatePlanInput) {
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
      if ((await tx.plan.count({ where: { userId } })) >= PLANS_MAX) throw plansLimit();
      return tx.plan.create({ data: { ...input, userId }, include: withCount });
    });
    return toPublicPlan(plan);
  }

  // Mudar as perguntas não mexe nos registros: cada um guarda a cópia de quando foi feito.
  async function update(userId: string, id: string, input: UpdatePlanInput) {
    const plan = await findOwnedPlan(userId, id);
    const { archived, ...rest } = input;
    const archivedAt = archived === undefined ? undefined : archived ? (plan.archivedAt ?? new Date()) : null;
    // O userId repete a conferência do findOwnedPlan: segunda linha de defesa da regra 1.
    const { count } = await prisma.plan.updateMany({ where: { id, userId }, data: { ...rest, archivedAt } });
    if (count === 0) throw planNotFound();
    return toPublicPlan(await prisma.plan.findUniqueOrThrow({ where: { id }, include: withCount }));
  }

  // Só sem registros. Trava o plano antes de contar: um registro sendo criado (que segura o plano
  // com FOR SHARE) termina antes, e a contagem, já depois da trava, o enxerga. Sem isso, o registro
  // novo sairia junto em cascata (achado do revisor-seguranca).
  async function remove(userId: string, id: string) {
    const plan = await findOwnedPlan(userId, id);
    if (plan._count.entries > 0) throw planHasEntries();
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Plan" WHERE id = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw planNotFound();
      if ((await tx.planEntry.count({ where: { planId: id } })) > 0) throw planHasEntries();
      await tx.plan.delete({ where: { id } });
    });
  }

  async function listEntries(userId: string, planId: string, { from, to }: ListPlanEntriesQuery) {
    await findOwnedPlan(userId, planId);
    const entries = await prisma.planEntry.findMany({
      where: { planId, userId, entryDate: { gte: dateOnlyToDate(from), lte: dateOnlyToDate(to) } },
      include: withPlanTitle,
      orderBy: entryOrder,
    });
    const now = new Date();
    return entries.map((entry) => toPublicPlanEntry(entry, now));
  }

  async function getEntry(userId: string, id: string) {
    return toPublicPlanEntry(await findOwnedEntry(userId, id));
  }

  // Segura o plano (FOR SHARE) do começo ao fim: quem encerra ou apaga espera o registro terminar,
  // e o registro lê o plano como ele está depois de um encerramento ou exclusão que veio antes
  // (achado do revisor-seguranca).
  async function createEntry(userId: string, planId: string, input: CreatePlanEntryInput) {
    await findOwnedPlan(userId, planId);
    const { entryDate, entryTime = null, answers } = input;
    assertNotFuture(entryDate, entryTime);

    const entry = await prisma.$transaction(async (tx) => {
      const [plan] = await tx.$queryRaw<{ questions: string[]; archivedAt: Date | null }[]>`
        SELECT questions, "archivedAt" FROM "Plan" WHERE id = ${planId}::uuid AND "userId" = ${userId}::uuid FOR SHARE`;
      if (!plan) throw planNotFound();
      if (plan.archivedAt) throw planArchived();
      if (answers.length !== plan.questions.length) throw answersMismatch();
      return tx.planEntry.create({
        data: {
          planId,
          userId,
          entryDate: dateOnlyToDate(entryDate),
          entryTime: timeColumn(entryTime),
          questions: plan.questions,
          answers,
        },
        include: withPlanTitle,
      });
    });
    return toPublicPlanEntry(entry);
  }

  // Editar não depende do plano estar ativo: o prazo é o mesmo dia, como na Tensão.
  async function updateEntry(userId: string, id: string, input: UpdatePlanEntryInput) {
    const entry = await findOwnedEntry(userId, id);
    if (!isEditable(entry.createdAt)) throw planEntryLocked();
    const { entryDate, entryTime, answers } = input;
    if (answers && answers.length !== entry.questions.length) throw answersMismatch();
    // Dia e hora valem juntos: mudar só um deles ainda não pode levar o registro para o futuro.
    if (entryDate !== undefined || entryTime !== undefined) {
      const current = toPublicPlanEntry(entry);
      assertNotFuture(entryDate ?? current.entryDate, entryTime === undefined ? current.entryTime : entryTime);
    }

    const { count } = await prisma.planEntry.updateMany({
      where: stillEditable(userId, id),
      data: {
        entryDate: entryDate ? dateOnlyToDate(entryDate) : undefined,
        entryTime: timeColumn(entryTime),
        answers,
      },
    });
    if (count === 0) throw await conflictAfterRace(id);

    return toPublicPlanEntry(await prisma.planEntry.findUniqueOrThrow({ where: { id }, include: withPlanTitle }));
  }

  async function removeEntry(userId: string, id: string) {
    const entry = await findOwnedEntry(userId, id);
    if (!isEditable(entry.createdAt)) throw planEntryLocked();

    const { count } = await prisma.planEntry.deleteMany({ where: stillEditable(userId, id) });
    if (count === 0) throw await conflictAfterRace(id);
  }

  // Registros escolhidos por id, de qualquer plano e data (visão "Para ler", DEC-057).
  async function listEntriesByIds(userId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const entries = await prisma.planEntry.findMany({
      where: { userId, id: { in: ids } },
      include: withPlanTitle,
      orderBy: entryOrder,
    });
    const now = new Date();
    return entries.map((entry) => toPublicPlanEntry(entry, now));
  }

  return { list, get, create, update, remove, listEntries, getEntry, createEntry, updateEntry, removeEntry, listEntriesByIds };
}

export type PlansService = ReturnType<typeof createPlansService>;
