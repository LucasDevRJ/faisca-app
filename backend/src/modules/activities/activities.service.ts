import { AppError } from '../../errors/app-error.js';
import type { Activity, ActivityStatus, Prisma } from '../../generated/prisma/client.js';
import { dateOnlyToDate, dateToDateOnly, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type {
  CompleteActivityInput,
  CreateActivityInput,
  ListActivitiesQuery,
  NotDoneActivityInput,
  StartActivityInput,
  UpdateActivityInput,
} from './activities.schema.js';

// Máquina de estados da SPEC (Atividades > Transições). É o único lugar que decide
// mudança de status. Funções puras, sem banco, exportadas para os testes de unidade.

export const FINAL_STATUSES: readonly ActivityStatus[] = ['CONCLUIDA', 'NAO_REALIZADA'];
export const EDITABLE_STATUSES: readonly ActivityStatus[] = ['PLANEJADA', 'PENDENTE'];

// De onde cada transição pode partir.
export const TRANSITIONS = {
  start: { from: ['PLANEJADA'], to: 'PENDENTE' },
  complete: { from: ['PENDENTE'], to: 'CONCLUIDA' },
  notDone: { from: ['PLANEJADA', 'PENDENTE'], to: 'NAO_REALIZADA' },
} as const satisfies Record<string, { from: readonly ActivityStatus[]; to: ActivityStatus }>;

export type TransitionName = keyof typeof TRANSITIONS;

export function isFinal(status: ActivityStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

// DEC-012: 409 e não 403. A pessoa tem permissão; é o estado do registro que não deixa.
export function activityFinalized() {
  return new AppError(
    409,
    'ACTIVITY_FINALIZED',
    'Esta atividade já foi finalizada e não pode mais ser alterada.',
  );
}

export function invalidTransition(message = 'Esta mudança de estado não é permitida.') {
  return new AppError(409, 'INVALID_TRANSITION', message);
}

// Editar ou excluir: só enquanto a atividade não é final.
export function assertEditable(status: ActivityStatus): void {
  if (isFinal(status)) throw activityFinalized();
}

export function assertTransition(status: ActivityStatus, transition: TransitionName): void {
  assertEditable(status);
  const allowed: readonly ActivityStatus[] = TRANSITIONS[transition].from;
  if (!allowed.includes(status)) throw invalidTransition();
}

// CONCLUIDA e NAO_REALIZADA falam de algo que já aconteceu (ou não): só até hoje (DEC-028).
export function isFutureDate(activityDate: string, today: string): boolean {
  // 'AAAA-MM-DD' compara certo como texto.
  return activityDate > today;
}

export type PublicActivity = {
  id: string;
  name: string;
  activityDate: string;
  status: Activity['status'];
  wantBefore: number | null;
  pleasure: number | null;
  achievement: number | null;
  observation: string | null;
  createdAt: string;
  updatedAt: string;
};

// Sem o userId: quem pede já é o dono (e, no futuro, a terapeuta sabe de quem pediu).
export function toPublicActivity(activity: Activity): PublicActivity {
  return {
    id: activity.id,
    name: activity.name,
    activityDate: dateToDateOnly(activity.activityDate),
    status: activity.status,
    wantBefore: activity.wantBefore,
    pleasure: activity.pleasure,
    achievement: activity.achievement,
    observation: activity.observation,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  };
}

function notFound() {
  return new AppError(404, 'ACTIVITY_NOT_FOUND', 'Atividade não encontrada.');
}

// SPEC (Autorização): dado de outra pessoa é 403.
function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso a esta atividade.');
}

function futureDateOnCreate() {
  return new AppError(
    400,
    'DATE_IN_FUTURE',
    'Uma atividade concluída precisa ter data de hoje ou de um dia anterior.',
  );
}

function futureDateOnTransition() {
  return new AppError(
    409,
    'DATE_IN_FUTURE',
    'Este dia ainda não chegou. Dá para registrar como foi a partir do dia da atividade.',
  );
}

async function findOwned(userId: string, id: string): Promise<Activity> {
  const activity = await prisma.activity.findUnique({ where: { id } });
  if (!activity) throw notFound();
  if (activity.userId !== userId) throw forbidden();
  return activity;
}

// Explica um update condicional que não alterou nada: outra requisição mudou a atividade
// entre a leitura e a escrita.
async function conflictAfterRace(id: string): Promise<AppError> {
  const current = await prisma.activity.findUnique({ where: { id }, select: { status: true } });
  if (!current) return notFound();
  if (isFinal(current.status)) return activityFinalized();
  return new AppError(
    409,
    'ACTIVITY_CHANGED',
    'Esta atividade mudou enquanto você editava. Atualize a tela e tente de novo.',
  );
}

// Update condicional (DEC-028): só grava se o estado e a data ainda são os que foram
// validados. Duas requisições ao mesmo tempo não conseguem alterar um registro já final.
async function guardedUpdate(
  activity: Activity,
  data: Prisma.ActivityUpdateManyMutationInput,
): Promise<PublicActivity> {
  const { count } = await prisma.activity.updateMany({
    where: { id: activity.id, status: activity.status, activityDate: activity.activityDate },
    data,
  });
  if (count === 0) throw await conflictAfterRace(activity.id);
  return toPublicActivity(await prisma.activity.findUniqueOrThrow({ where: { id: activity.id } }));
}

export function createActivitiesService() {
  async function list(userId: string, { from, to }: ListActivitiesQuery) {
    const activities = await prisma.activity.findMany({
      where: { userId, activityDate: { gte: dateOnlyToDate(from), lte: dateOnlyToDate(to) } },
      // A SPEC não tem horário: dentro do dia, vale a ordem em que foram registradas.
      orderBy: [{ activityDate: 'asc' }, { createdAt: 'asc' }],
    });
    return activities.map(toPublicActivity);
  }

  async function create(userId: string, input: CreateActivityInput) {
    if (input.status === 'CONCLUIDA' && isFutureDate(input.activityDate, todayInAppZone())) {
      throw futureDateOnCreate();
    }

    const activity = await prisma.activity.create({
      data: { ...input, userId, activityDate: dateOnlyToDate(input.activityDate) },
    });
    return toPublicActivity(activity);
  }

  async function update(userId: string, id: string, input: UpdateActivityInput) {
    const activity = await findOwned(userId, id);
    assertEditable(activity.status);

    // Dar vontade a uma PLANEJADA é a transição "start", não uma edição.
    if (input.wantBefore !== undefined && activity.status !== 'PENDENTE') {
      throw invalidTransition('A vontade só pode ser alterada em uma atividade pendente.');
    }

    return guardedUpdate(activity, {
      name: input.name,
      wantBefore: input.wantBefore,
      activityDate: input.activityDate ? dateOnlyToDate(input.activityDate) : undefined,
    });
  }

  async function transition(
    userId: string,
    id: string,
    name: TransitionName,
    data: Prisma.ActivityUpdateManyMutationInput,
  ) {
    const activity = await findOwned(userId, id);
    assertTransition(activity.status, name);

    const target = TRANSITIONS[name].to;
    if (isFinal(target) && isFutureDate(dateToDateOnly(activity.activityDate), todayInAppZone())) {
      throw futureDateOnTransition();
    }

    return guardedUpdate(activity, { ...data, status: target });
  }

  const start = (userId: string, id: string, input: StartActivityInput) =>
    transition(userId, id, 'start', { wantBefore: input.wantBefore });

  const complete = (userId: string, id: string, input: CompleteActivityInput) =>
    transition(userId, id, 'complete', {
      pleasure: input.pleasure,
      achievement: input.achievement,
      observation: input.observation ?? null,
    });

  const notDone = (userId: string, id: string, input: NotDoneActivityInput) =>
    transition(userId, id, 'notDone', { observation: input.observation ?? null });

  async function remove(userId: string, id: string) {
    const activity = await findOwned(userId, id);
    assertEditable(activity.status);

    // Mesmo cuidado do guardedUpdate: só apaga se ainda não for final.
    const { count } = await prisma.activity.deleteMany({
      where: { id, status: { in: [...EDITABLE_STATUSES] } },
    });
    if (count === 0) throw await conflictAfterRace(id);
  }

  return { list, create, update, start, complete, notDone, remove };
}

export type ActivitiesService = ReturnType<typeof createActivitiesService>;
