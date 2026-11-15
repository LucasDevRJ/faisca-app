import { AppError } from '../../errors/app-error.js';
import type { HomeworkTask, Prisma, SharedArea } from '../../generated/prisma/client.js';
import { todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { loadAgenda } from '../appointments/appointments.service.js';
import { scheduledSessionsFrom, type Session } from '../appointments/sessions.js';
import { deadlineFor, deadlineInstant, effectiveDeadline } from '../thought-records/thought-records.service.js';
import { TASKS_MAX, type CreateTaskInput, type UpdateTaskInput, type TaskResponseInput } from './tasks.schema.js';

type Db = Prisma.TransactionClient;
const include = { agreedLink: { select: { kind: true, therapist: { select: { name: true } } } } } as const;
type Task = Prisma.HomeworkTaskGetPayload<{ include: typeof include }>;
const missing = () => new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
const forbidden = () => new AppError(403, 'FORBIDDEN', 'Você não tem acesso a esta tarefa.');
const locked = () => new AppError(409, 'TASK_RESPONSE_FINAL', 'A resposta ficou final na consulta e não pode mais ser alterada.');
const answered = () => new AppError(409, 'TASK_ALREADY_ANSWERED', 'Esta tarefa já tem resposta. Você pode editar a resposta até a próxima consulta.');

// O prazo parte da primeira resposta, inclusive quando registrada depois de uma consulta.
async function deadline(db: Db, task: HomeworkTask, loadedSessions?: Session[]) {
  if (!task.respondedAt) return null;
  const sessions = loadedSessions ?? scheduledSessionsFrom(await loadAgenda(db, task.userId), todayInAppZone(task.respondedAt), todayInAppZone());
  const value = effectiveDeadline(task.responseDeadlineAt, deadlineFor(sessions, task.respondedAt));
  return value ? deadlineInstant(value) : null;
}
function toPublicTask(task: Task, at: Date | null) {
  return {
    id: task.id, title: task.title, description: task.description,
    agreedWith: task.agreedLink ? { kind: task.agreedLink.kind, name: task.agreedLink.therapist.name } : null,
    agreedLinkId: task.agreedLinkId,
    responseStatus: task.responseStatus, responseText: task.responseText,
    respondedAt: task.respondedAt?.toISOString() ?? null,
    responseDeadline: at?.toISOString() ?? null,
    responseEditable: task.respondedAt === null || at === null || new Date() < at,
    createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString(),
  };
}
export type PublicTask = ReturnType<typeof toPublicTask>;

// Não revela a agenda nem o nome de outra profissional através da área Tarefas.
export function taskForProfessional(task: PublicTask, areas: SharedArea[]): PublicTask {
  return { ...task, agreedWith: null, agreedLinkId: null,
    ...(!areas.includes('APPOINTMENTS') && { responseDeadline: null, responseEditable: false }) };
}
async function owned(db: Db, userId: string, id: string) {
  const task = await db.homeworkTask.findUnique({ where: { id }, include });
  if (!task) throw missing();
  if (task.userId !== userId) throw forbidden();
  return task;
}
async function assertLink(db: Db, userId: string, id: string | null | undefined) {
  if (!id) return;
  if (!await db.therapistLink.findFirst({ where: { id, patientId: userId, revokedAt: null } })) throw forbidden();
}

// Congelamentos concorrentes só podem encurtar o prazo, mesmo preservando updatedAt.
export async function freezeTaskDeadline(tx: Db, task: Pick<HomeworkTask, 'id' | 'updatedAt'>, at: Date) {
  return tx.homeworkTask.updateMany({
    where: { id: task.id, updatedAt: task.updatedAt, OR: [{ responseDeadlineAt: null }, { responseDeadlineAt: { gt: at } }] },
    data: { responseDeadlineAt: at, updatedAt: task.updatedAt },
  });
}

export function createTasksService() {
  async function list(userId: string, ids?: string[], freeze = false) {
    return prisma.$transaction(async (tx) => {
      const tasks = await tx.homeworkTask.findMany({ where: { userId, ...(ids && { id: { in: ids } }) }, include, orderBy: { createdAt: 'desc' } });
      const bases = tasks.flatMap((task) => task.respondedAt ? [task.respondedAt] : []);
      const oldest = bases.length ? new Date(Math.min(...bases.map((at) => at.getTime()))) : new Date();
      const sessions = bases.length ? scheduledSessionsFrom(await loadAgenda(tx, userId), todayInAppZone(oldest), todayInAppZone()) : [];
      const result: PublicTask[] = [];
      for (const task of tasks) {
        const at = await deadline(tx, task, sessions);
        // Só no contexto do paciente: ler como profissional nunca grava no registro.
        if (freeze && at && (!task.responseDeadlineAt || at < task.responseDeadlineAt)) {
          await freezeTaskDeadline(tx, task, at);
        }
        result.push(toPublicTask(task, at));
      }
      return result;
    });
  }
  async function create(userId: string, input: CreateTaskInput) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
      if (await tx.homeworkTask.count({ where: { userId } }) >= TASKS_MAX) throw new AppError(409, 'TASKS_LIMIT', 'Você chegou ao limite de tarefas desta conta.');
      await assertLink(tx, userId, input.agreedLinkId);
      return toPublicTask(await tx.homeworkTask.create({ data: { ...input, userId }, include }), null);
    });
  }
  // A trava serializa edição, exclusão e resposta: não apaga uma resposta que entrou em paralelo.
  async function change<T>(userId: string, id: string, run: (tx: Db, task: Task) => Promise<T>) {
    return prisma.$transaction(async (tx) => {
      await owned(tx, userId, id);
      await tx.$queryRaw`SELECT id FROM "HomeworkTask" WHERE id = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
      return run(tx, await owned(tx, userId, id));
    });
  }
  async function update(userId: string, id: string, input: UpdateTaskInput) {
    return change(userId, id, async (tx, task) => {
      if (task.respondedAt) throw answered();
      await assertLink(tx, userId, input.agreedLinkId);
      return toPublicTask(await tx.homeworkTask.update({ where: { id, userId }, data: input, include }), null);
    });
  }
  async function remove(userId: string, id: string) {
    await change(userId, id, async (tx, task) => {
      if (task.respondedAt) throw answered();
      await tx.homeworkTask.delete({ where: { id, userId } });
    });
  }
  async function respond(userId: string, id: string, input: TaskResponseInput) {
    return change(userId, id, async (tx, task) => {
      const respondedAt = task.respondedAt ?? new Date();
      const at = await deadline(tx, { ...task, respondedAt });
      if (at && new Date() >= at) throw locked();
      const saved = await tx.homeworkTask.update({ where: { id, userId }, data: {
        ...input, responseText: input.responseText ?? null, respondedAt, responseDeadlineAt: at,
      }, include });
      return toPublicTask(saved, at);
    });
  }
  return { list, create, update, remove, respond };
}
