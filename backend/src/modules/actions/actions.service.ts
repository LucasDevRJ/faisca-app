import { AppError } from '../../errors/app-error.js';
import type { BehavioralAction, Prisma } from '../../generated/prisma/client.js';
import { addDays, dateOnlyToDate, dateToDateOnly, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type {
  CreateActionInput,
  EvaluateActionInput,
  ListActionsQuery,
  NotDoneActionInput,
  UpdateActionInput,
} from './actions.schema.js';

// Ação (SPEC, "Ação"; DEC-051).

// Planejar vai de hoje até 7 dias à frente; registrar algo já feito, até 7 dias atrás.
export const PLAN_AHEAD_DAYS = 7;
export const RECORD_BACK_DAYS = 7;

export type PublicAction = {
  id: string;
  actionDate: string;
  name: string;
  category: BehavioralAction['category'];
  status: BehavioralAction['status'];
  expectation: number;
  pleasure: number | null;
  achievement: number | null;
  observation: string | null;
  createdAt: string;
  updatedAt: string;
};

// Sem o userId: quem pede já é o dono, ou a terapeuta, que sabe de quem pediu.
export function toPublicAction(action: BehavioralAction): PublicAction {
  return {
    id: action.id,
    actionDate: dateToDateOnly(action.actionDate),
    name: action.name,
    category: action.category,
    status: action.status,
    expectation: action.expectation,
    pleasure: action.pleasure,
    achievement: action.achievement,
    observation: action.observation,
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
  };
}

function notFound() {
  return new AppError(404, 'ACTION_NOT_FOUND', 'Ação não encontrada.');
}

// SPEC (Autorização): dado de outra pessoa é 403.
function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso a esta ação.');
}

// Avaliada e não realizada são finais, como as atividades concluídas (DEC-051): 409, e não 403.
function finalized() {
  return new AppError(409, 'ACTION_FINALIZED', 'Esta ação já foi avaliada ou marcada como não realizada.');
}

// Planejar: de hoje até PLAN_AHEAD_DAYS à frente. Funções puras, para testar as bordas sem banco.
export function planDateError(date: string, today: string): string | null {
  if (date < today) return 'Planeje para hoje ou para um dia que ainda vai chegar.';
  if (date > addDays(today, PLAN_AHEAD_DAYS)) return `Planeje para até ${PLAN_AHEAD_DAYS} dias à frente.`;
  return null;
}

// Registrar o que já foi feito: de RECORD_BACK_DAYS atrás até hoje.
export function recordDateError(date: string, today: string): string | null {
  if (date > today) return 'O que já foi feito precisa ser de hoje ou de um dia anterior.';
  if (date < addDays(today, -RECORD_BACK_DAYS)) {
    return `Dá para registrar o que foi feito nos últimos ${RECORD_BACK_DAYS} dias.`;
  }
  return null;
}

function assertDate(error: string | null) {
  if (error) throw new AppError(400, 'DATE_OUT_OF_RANGE', error);
}

async function findOwned(userId: string, id: string): Promise<BehavioralAction> {
  const action = await prisma.behavioralAction.findUnique({ where: { id } });
  if (!action) throw notFound();
  if (action.userId !== userId) throw forbidden();
  return action;
}

async function findPlanned(userId: string, id: string): Promise<BehavioralAction> {
  const action = await findOwned(userId, id);
  if (action.status !== 'PLANEJADA') throw finalized();
  return action;
}

// Avaliar ou marcar como não realizada: só a partir do dia da ação.
function assertDayArrived(action: BehavioralAction) {
  if (dateToDateOnly(action.actionDate) > todayInAppZone()) {
    throw new AppError(400, 'ACTION_NOT_YET', 'Dá para contar como foi a partir do dia da ação.');
  }
}

// Explica uma escrita condicional que não alterou nada.
async function conflictAfterRace(id: string): Promise<AppError> {
  const exists = await prisma.behavioralAction.findUnique({ where: { id }, select: { id: true } });
  return exists ? finalized() : notFound();
}

// Escrita condicional: só vale se a ação ainda está planejada no momento em que grava. O userId
// repete a conferência do findOwned: segunda linha de defesa da regra 1.
async function writePlanned(userId: string, id: string, data: Prisma.BehavioralActionUpdateManyMutationInput) {
  const { count } = await prisma.behavioralAction.updateMany({ where: { id, userId, status: 'PLANEJADA' }, data });
  if (count === 0) throw await conflictAfterRace(id);
  return toPublicAction(await prisma.behavioralAction.findUniqueOrThrow({ where: { id } }));
}

export function createActionsService() {
  async function list(userId: string, { from, to }: ListActionsQuery) {
    const actions = await prisma.behavioralAction.findMany({
      where: { userId, actionDate: { gte: dateOnlyToDate(from), lte: dateOnlyToDate(to) } },
      orderBy: [{ actionDate: 'asc' }, { createdAt: 'asc' }],
    });
    return actions.map(toPublicAction);
  }

  async function get(userId: string, id: string) {
    return toPublicAction(await findOwned(userId, id));
  }

  async function create(userId: string, input: CreateActionInput) {
    const today = todayInAppZone();
    assertDate(
      input.status === 'PLANEJADA' ? planDateError(input.actionDate, today) : recordDateError(input.actionDate, today),
    );
    const { actionDate, ...rest } = input;
    const action = await prisma.behavioralAction.create({
      data: { ...rest, userId, actionDate: dateOnlyToDate(actionDate) },
    });
    return toPublicAction(action);
  }

  async function update(userId: string, id: string, input: UpdateActionInput) {
    const action = await findPlanned(userId, id);
    // Mudar o dia segue a janela de planejar; mudar só o resto vale mesmo com o dia já passado.
    if (input.actionDate !== undefined && input.actionDate !== dateToDateOnly(action.actionDate)) {
      assertDate(planDateError(input.actionDate, todayInAppZone()));
    }
    const { actionDate, ...rest } = input;
    return writePlanned(userId, id, { ...rest, actionDate: actionDate ? dateOnlyToDate(actionDate) : undefined });
  }

  async function evaluate(userId: string, id: string, input: EvaluateActionInput) {
    assertDayArrived(await findPlanned(userId, id));
    return writePlanned(userId, id, {
      status: 'AVALIADA',
      pleasure: input.pleasure,
      achievement: input.achievement,
      observation: input.observation ?? null,
    });
  }

  async function notDone(userId: string, id: string, input: NotDoneActionInput) {
    assertDayArrived(await findPlanned(userId, id));
    return writePlanned(userId, id, { status: 'NAO_REALIZADA', observation: input.observation ?? null });
  }

  async function remove(userId: string, id: string) {
    await findPlanned(userId, id);
    const { count } = await prisma.behavioralAction.deleteMany({ where: { id, userId, status: 'PLANEJADA' } });
    if (count === 0) throw await conflictAfterRace(id);
  }

  return { list, get, create, update, evaluate, notDone, remove };
}

export type ActionsService = ReturnType<typeof createActionsService>;
