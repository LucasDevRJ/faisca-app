import { AppError } from '../../errors/app-error.js';
import { Prisma, type Appointment } from '../../generated/prisma/client.js';
import { dateOnlyToDate, dateToDateOnly, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { AppointmentInput } from './appointments.schema.js';

export type PublicAppointment = {
  id: string;
  appointmentDate: string;
  createdAt: string;
  updatedAt: string;
};

export function toPublicAppointment(appointment: Appointment): PublicAppointment {
  return {
    id: appointment.id,
    appointmentDate: dateToDateOnly(appointment.appointmentDate),
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };
}

// SPEC (Consultas): última = a mais recente com data até hoje; próxima = a mais próxima a
// partir de amanhã. Função pura, para testar as bordas sem banco; os itens podem vir em
// qualquer ordem.
export function lastAndNext<T extends { appointmentDate: string }>(items: T[], today: string) {
  let last: T | null = null;
  let next: T | null = null;
  for (const item of items) {
    // 'AAAA-MM-DD' compara certo como texto.
    if (item.appointmentDate <= today) {
      if (!last || item.appointmentDate > last.appointmentDate) last = item;
    } else if (!next || item.appointmentDate < next.appointmentDate) {
      next = item;
    }
  }
  return { last, next };
}

function notFound() {
  return new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Consulta não encontrada.');
}

// SPEC (Autorização): dado de outra pessoa é 403.
function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso a esta consulta.');
}

function alreadyExists() {
  return new AppError(409, 'APPOINTMENT_EXISTS', 'Você já tem uma consulta nesse dia.');
}

async function findOwned(userId: string, id: string): Promise<Appointment> {
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) throw notFound();
  if (appointment.userId !== userId) throw forbidden();
  return appointment;
}

// Uma consulta por dia (DEC-030) é garantida pelo índice único do banco: vale até para
// duas requisições ao mesmo tempo.
async function withUniqueDate<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw alreadyExists();
    throw err;
  }
}

export function createAppointmentsService() {
  async function list(userId: string) {
    const rows = await prisma.appointment.findMany({
      where: { userId },
      orderBy: { appointmentDate: 'desc' },
    });
    const appointments = rows.map(toPublicAppointment);
    return { appointments, ...lastAndNext(appointments, todayInAppZone()) };
  }

  async function create(userId: string, input: AppointmentInput) {
    const appointment = await withUniqueDate(() =>
      prisma.appointment.create({
        data: { userId, appointmentDate: dateOnlyToDate(input.appointmentDate) },
      }),
    );
    return toPublicAppointment(appointment);
  }

  async function update(userId: string, id: string, input: AppointmentInput) {
    await findOwned(userId, id);
    const appointment = await withUniqueDate(() =>
      prisma.appointment.update({
        where: { id },
        data: { appointmentDate: dateOnlyToDate(input.appointmentDate) },
      }),
    );
    return toPublicAppointment(appointment);
  }

  async function remove(userId: string, id: string) {
    await findOwned(userId, id);
    // deleteMany: se outra requisição apagou antes, não há erro e a resposta é a mesma.
    await prisma.appointment.deleteMany({ where: { id, userId } });
  }

  return { list, create, update, remove };
}

export type AppointmentsService = ReturnType<typeof createAppointmentsService>;
