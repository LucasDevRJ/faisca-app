import { AppError } from '../../errors/app-error.js';
import { Prisma, type Appointment } from '../../generated/prisma/client.js';
import {
  addDays,
  dateOnlyToDate,
  dateToDateOnly,
  dateToTimeOnly,
  nowTimeInAppZone,
  timeOnlyToDate,
  todayInAppZone,
} from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type {
  AppointmentInput,
  ListAppointmentsQuery,
  PauseInput,
  RescheduleInput,
  ScheduleInput,
} from './appointments.schema.js';
import {
  currentOrUpcomingPause,
  hasStarted,
  lastAndNext,
  ruleDates,
  scheduleOn,
  sessionsBetween,
  therapyStatus,
  upcomingSessions,
  type AgendaData,
  type Session,
} from './sessions.js';

type Db = Prisma.TransactionClient | typeof prisma;

export type PublicAppointment = {
  id: string;
  appointmentDate: string;
  appointmentTime: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toPublicAppointment(appointment: Appointment): PublicAppointment {
  return {
    id: appointment.id,
    appointmentDate: dateToDateOnly(appointment.appointmentDate),
    appointmentTime: appointment.appointmentTime ? dateToTimeOnly(appointment.appointmentTime) : null,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };
}

// Período padrão da lista e quantas sessões entram em "Próximas" (DEC-045).
const DEFAULT_RANGE_DAYS = 91;
const UPCOMING_COUNT = 6;
// Até quando dá para marcar à frente: agenda, pausa e remarcação.
const MAX_AHEAD_DAYS = 365;

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

function sessionNotFound() {
  return new AppError(404, 'SESSION_NOT_FOUND', 'Não há sessão da sua agenda nesse dia.');
}

function noSchedule() {
  return new AppError(409, 'NO_SCHEDULE', 'Você não tem uma agenda em vigor.');
}

function tooFarAhead() {
  return new AppError(400, 'DATE_TOO_FAR', `Escolha uma data em até ${MAX_AHEAD_DAYS} dias.`);
}

async function findOwned(userId: string, id: string): Promise<Appointment> {
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) throw notFound();
  if (appointment.userId !== userId) throw forbidden();
  return appointment;
}

// A unicidade do banco cobre duas avulsas no mesmo dia (DEC-030) e duas regras em vigor
// (índice parcial), até com duas requisições ao mesmo tempo.
async function withUnique<T>(run: () => Promise<T>, conflict: () => AppError = alreadyExists): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict();
    throw err;
  }
}

// Tudo o que define as sessões de um paciente. São poucas linhas por pessoa: carrega tudo e
// calcula na memória (sessions.ts).
async function loadAgenda(db: Db, userId: string) {
  const [schedules, exceptions, pauses, extras] = await Promise.all([
    db.appointmentSchedule.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    db.appointmentException.findMany({ where: { schedule: { userId } } }),
    db.therapyPause.findMany({ where: { userId }, orderBy: { startDate: 'asc' } }),
    db.appointment.findMany({ where: { userId } }),
  ]);
  const data: AgendaData = {
    schedules: schedules.map((s) => ({
      id: s.id,
      startDate: dateToDateOnly(s.startDate),
      time: dateToTimeOnly(s.time),
      frequency: s.frequency,
      endDate: s.endDate ? dateToDateOnly(s.endDate) : null,
    })),
    exceptions: exceptions.map((e) => ({
      scheduleId: e.scheduleId,
      originalDate: dateToDateOnly(e.originalDate),
      type: e.type,
      newDate: e.newDate ? dateToDateOnly(e.newDate) : null,
      newTime: e.newTime ? dateToTimeOnly(e.newTime) : null,
      reason: e.reason,
    })),
    pauses: [],
    extras: extras.map((a) => ({
      id: a.id,
      date: dateToDateOnly(a.appointmentDate),
      time: a.appointmentTime ? dateToTimeOnly(a.appointmentTime) : null,
    })),
  };
  // A última regra que terminou diz se a terapia foi encerrada.
  const ended = schedules.filter((s) => s.endReason !== null);
  const lastEndReason = ended.length ? ended[ended.length - 1]!.endReason : null;
  // As pausas levam o id, para retomar.
  const pausesWithId = pauses.map((p) => ({
    id: p.id,
    startDate: dateToDateOnly(p.startDate),
    returnDate: p.returnDate ? dateToDateOnly(p.returnDate) : null,
  }));
  return { ...data, pauses: pausesWithId, lastEndReason };
}

type Agenda = Awaited<ReturnType<typeof loadAgenda>>;

// Um horário por dia (DEC-030, DEC-045): não pode haver outra sessão agendada no dia.
// `ignore` tira da conta a própria sessão que está mudando.
function assertDayFree(agenda: Agenda, date: string, ignore: (session: Session) => boolean = () => false) {
  const busy = sessionsBetween(agenda, date, date).some((s) => s.status === 'AGENDADA' && !ignore(s));
  if (busy) throw alreadyExists();
}

function now() {
  return { today: todayInAppZone(), nowTime: nowTimeInAppZone() };
}

export function createAppointmentsService() {
  async function list(userId: string, query: ListAppointmentsQuery = {}) {
    const { today, nowTime } = now();
    const from = query.from ?? addDays(today, -DEFAULT_RANGE_DAYS);
    const to = query.to ?? addDays(today, DEFAULT_RANGE_DAYS);
    const agenda = await loadAgenda(prisma, userId);
    const open = agenda.schedules.find((s) => s.endDate === null) ?? null;
    const pause = currentOrUpcomingPause(agenda.pauses, today);
    return {
      status: therapyStatus(agenda, today),
      schedule: open && { startDate: open.startDate, time: open.time, frequency: open.frequency },
      pause: pause && { startDate: pause.startDate, returnDate: pause.returnDate },
      from,
      to,
      sessions: sessionsBetween(agenda, from, to),
      upcoming: upcomingSessions(agenda, today, nowTime, UPCOMING_COUNT),
      ...lastAndNext(agenda, today, nowTime),
    };
  }

  // Consultas avulsas (DEC-030), agora com hora.
  async function create(userId: string, input: AppointmentInput) {
    assertDayFree(await loadAgenda(prisma, userId), input.appointmentDate);
    const appointment = await withUnique(() =>
      prisma.appointment.create({
        data: {
          userId,
          appointmentDate: dateOnlyToDate(input.appointmentDate),
          appointmentTime: timeOnlyToDate(input.appointmentTime),
        },
      }),
    );
    return toPublicAppointment(appointment);
  }

  async function update(userId: string, id: string, input: AppointmentInput) {
    await findOwned(userId, id);
    assertDayFree(await loadAgenda(prisma, userId), input.appointmentDate, (s) => s.appointmentId === id);
    const appointment = await withUnique(() =>
      prisma.appointment.update({
        where: { id },
        data: {
          appointmentDate: dateOnlyToDate(input.appointmentDate),
          appointmentTime: timeOnlyToDate(input.appointmentTime),
        },
      }),
    );
    return toPublicAppointment(appointment);
  }

  async function remove(userId: string, id: string) {
    await findOwned(userId, id);
    // deleteMany: se outra requisição apagou antes, não há erro e a resposta é a mesma.
    await prisma.appointment.deleteMany({ where: { id, userId } });
  }

  // Agendar ou mudar a agenda (DEC-045). Mudar começa uma regra nova no startDate; a antiga
  // termina na véspera e as sessões dela até ali continuam como estão.
  async function setSchedule(userId: string, input: ScheduleInput) {
    const { today } = now();
    if (input.startDate > addDays(today, MAX_AHEAD_DAYS)) throw tooFarAhead();

    await prisma.$transaction(async (tx) => {
      const agenda = await loadAgenda(tx, userId);
      // A primeira agenda pode começar no passado, para as sessões que já aconteceram entrarem no
      // histórico. Depois disso, o passado não é reescrito.
      if (agenda.schedules.length > 0 && input.startDate < today) {
        throw new AppError(400, 'START_IN_PAST', 'A nova agenda começa hoje ou depois.');
      }
      if (agenda.schedules.length === 0 && input.startDate < addDays(today, -MAX_AHEAD_DAYS)) {
        throw new AppError(400, 'START_TOO_OLD', `A primeira consulta pode ser de até ${MAX_AHEAD_DAYS} dias atrás.`);
      }

      const open = agenda.schedules.find((s) => s.endDate === null);
      const endDate = addDays(input.startDate, -1);
      if (open) {
        await tx.appointmentSchedule.update({
          where: { id: open.id },
          data: { endDate: dateOnlyToDate(endDate), endReason: 'MUDANCA' },
        });
        await tx.appointmentException.deleteMany({
          where: { scheduleId: open.id, originalDate: { gt: dateOnlyToDate(endDate) } },
        });
      }

      // Um horário por dia: a nova regra não pode cair num dia que já tem avulsa ou remarcada.
      const draft: Agenda = {
        ...agenda,
        schedules: [
          ...agenda.schedules.map((s) => (s.id === open?.id ? { ...s, endDate } : s)),
          { id: 'nova', startDate: input.startDate, time: input.time, frequency: input.frequency, endDate: null },
        ],
      };
      const until = addDays(today, MAX_AHEAD_DAYS);
      const newDates = new Set(ruleDates(draft.schedules.at(-1)!, input.startDate, until));
      const clash = sessionsBetween({ ...draft, schedules: draft.schedules.slice(0, -1) }, input.startDate, until).find(
        (s) => s.status === 'AGENDADA' && newDates.has(s.date),
      );
      if (clash) {
        throw new AppError(
          409,
          'SCHEDULE_CONFLICT',
          'A nova agenda cai num dia que já tem consulta. Mude ou desmarque essa consulta antes.',
        );
      }

      await withUnique(
        () =>
          tx.appointmentSchedule.create({
            data: {
              userId,
              startDate: dateOnlyToDate(input.startDate),
              time: timeOnlyToDate(input.time),
              frequency: input.frequency,
            },
          }),
        () => new AppError(409, 'SCHEDULE_CHANGED', 'Sua agenda acabou de mudar. Confira e tente de novo.'),
      );
    });
    return list(userId);
  }

  // Encerrar a terapia (DEC-045): as sessões que ainda não começaram somem, inclusive as avulsas;
  // o histórico fica. A pausa que estiver valendo termina junto.
  async function endSchedule(userId: string) {
    const { today, nowTime } = now();
    await prisma.$transaction(async (tx) => {
      const agenda = await loadAgenda(tx, userId);
      const open = agenda.schedules.find((s) => s.endDate === null);
      if (!open) throw noSchedule();

      const todayStarted = ruleDates(open, today, today).length > 0 && open.time <= nowTime;
      const endDate = todayStarted ? today : addDays(today, -1);
      await tx.appointmentSchedule.update({
        where: { id: open.id },
        data: { endDate: dateOnlyToDate(endDate), endReason: 'ENCERRAMENTO' },
      });
      // Some o que muda sessões depois do fim, e a remarcada para um horário que ainda não chegou.
      const dropped = agenda.exceptions.filter(
        (e) =>
          (e.scheduleId === open.id && e.originalDate > endDate) ||
          (e.type === 'REMARCADA' && e.newDate !== null && !hasStarted({ date: e.newDate, time: e.newTime }, today, nowTime)),
      );
      for (const e of dropped) {
        await tx.appointmentException.deleteMany({
          where: { scheduleId: e.scheduleId, originalDate: dateOnlyToDate(e.originalDate) },
        });
      }
      const futureExtras = agenda.extras.filter((e) => !hasStarted(e, today, nowTime));
      await tx.appointment.deleteMany({ where: { userId, id: { in: futureExtras.map((e) => e.id) } } });
      await closePause(tx, agenda, today);
    });
    return list(userId);
  }

  async function pause(userId: string, input: PauseInput) {
    const { today } = now();
    const returnDate = input.returnDate ?? null;
    if (input.startDate < today) throw new AppError(400, 'PAUSE_START_IN_PAST', 'A pausa começa hoje ou depois.');
    if (input.startDate > addDays(today, MAX_AHEAD_DAYS)) throw tooFarAhead();
    if (returnDate !== null && returnDate <= input.startDate) {
      throw new AppError(400, 'PAUSE_RETURN_BEFORE_START', 'A volta vem depois do início da pausa.');
    }
    if (returnDate !== null && returnDate > addDays(input.startDate, MAX_AHEAD_DAYS)) throw tooFarAhead();

    await prisma.$transaction(async (tx) => {
      const agenda = await loadAgenda(tx, userId);
      if (!agenda.schedules.some((s) => s.endDate === null)) throw noSchedule();
      if (currentOrUpcomingPause(agenda.pauses, today)) {
        throw new AppError(409, 'PAUSE_EXISTS', 'Você já tem uma pausa marcada. Retome antes de marcar outra.');
      }
      await tx.therapyPause.create({
        data: {
          userId,
          startDate: dateOnlyToDate(input.startDate),
          returnDate: returnDate === null ? null : dateOnlyToDate(returnDate),
        },
      });
    });
    return list(userId);
  }

  // "Retomar agora": a pausa termina hoje; uma pausa que ainda não começou é desfeita.
  async function resume(userId: string) {
    const { today } = now();
    await prisma.$transaction(async (tx) => {
      const agenda = await loadAgenda(tx, userId);
      if (!(await closePause(tx, agenda, today))) {
        throw new AppError(409, 'NO_PAUSE', 'Você não tem uma pausa marcada.');
      }
    });
    return list(userId);
  }

  async function closePause(tx: Db, agenda: Agenda, today: string): Promise<boolean> {
    const current = currentOrUpcomingPause(agenda.pauses, today);
    if (!current) return false;
    if (current.startDate >= today) {
      await tx.therapyPause.delete({ where: { id: current.id } });
    } else {
      await tx.therapyPause.update({ where: { id: current.id }, data: { returnDate: dateOnlyToDate(today) } });
    }
    return true;
  }

  // Sessão da recorrência nesse dia, sem desmarcação ou remarcação ainda.
  function unchangedSession(agenda: Agenda, originalDate: string) {
    const schedule = scheduleOn(originalDate, agenda);
    if (!schedule) throw sessionNotFound();
    if (agenda.exceptions.some((e) => e.scheduleId === schedule.id && e.originalDate === originalDate)) {
      throw new AppError(
        409,
        'SESSION_ALREADY_CHANGED',
        'Essa sessão já foi desmarcada ou remarcada. Desfaça antes de mudar de novo.',
      );
    }
    return schedule;
  }

  // Desmarcar, com motivo. Vale também para uma sessão que já passou: registra a falta.
  async function cancelSession(userId: string, originalDate: string, reason: string) {
    await prisma.$transaction(async (tx) => {
      const schedule = unchangedSession(await loadAgenda(tx, userId), originalDate);
      await withUnique(
        () =>
          tx.appointmentException.create({
            data: { scheduleId: schedule.id, originalDate: dateOnlyToDate(originalDate), type: 'DESMARCADA', reason },
          }),
        sessionChanged,
      );
    });
    return list(userId);
  }

  // Remarcar, com motivo: só uma sessão que ainda não começou, para um horário que ainda não chegou.
  async function rescheduleSession(userId: string, originalDate: string, input: RescheduleInput) {
    const { today, nowTime } = now();
    if (hasStarted({ date: input.date, time: input.time }, today, nowTime)) {
      throw new AppError(400, 'RESCHEDULE_IN_PAST', 'Escolha um dia e uma hora que ainda não chegaram.');
    }
    if (input.date > addDays(today, MAX_AHEAD_DAYS)) throw tooFarAhead();

    await prisma.$transaction(async (tx) => {
      const agenda = await loadAgenda(tx, userId);
      const schedule = unchangedSession(agenda, originalDate);
      if (hasStarted({ date: originalDate, time: schedule.time }, today, nowTime)) {
        throw new AppError(409, 'SESSION_STARTED', 'Essa sessão já passou: dá para desmarcar, mas não remarcar.');
      }
      assertDayFree(agenda, input.date, (s) => s.kind === 'RECORRENTE' && s.originalDate === originalDate);
      await withUnique(
        () =>
          tx.appointmentException.create({
            data: {
              scheduleId: schedule.id,
              originalDate: dateOnlyToDate(originalDate),
              type: 'REMARCADA',
              newDate: dateOnlyToDate(input.date),
              newTime: timeOnlyToDate(input.time),
              reason: input.reason,
            },
          }),
        sessionChanged,
      );
    });
    return list(userId);
  }

  // Desfazer a desmarcação ou a remarcação: a sessão volta ao dia e à hora da regra.
  async function undoSessionChange(userId: string, originalDate: string) {
    await prisma.$transaction(async (tx) => {
      const agenda = await loadAgenda(tx, userId);
      const schedule = scheduleOn(originalDate, agenda);
      const exception =
        schedule && agenda.exceptions.find((e) => e.scheduleId === schedule.id && e.originalDate === originalDate);
      if (!schedule || !exception) throw new AppError(404, 'SESSION_NOT_CHANGED', 'Essa sessão não foi desmarcada nem remarcada.');
      // A remarcada volta para o dia original, que pode ter ganhado outra consulta nesse meio-tempo.
      if (exception.type === 'REMARCADA') {
        assertDayFree(agenda, originalDate, (s) => s.kind === 'RECORRENTE' && s.originalDate === originalDate);
      }
      await tx.appointmentException.deleteMany({
        where: { scheduleId: schedule.id, originalDate: dateOnlyToDate(originalDate) },
      });
    });
    return list(userId);
  }

  return {
    list,
    create,
    update,
    remove,
    setSchedule,
    endSchedule,
    pause,
    resume,
    cancelSession,
    rescheduleSession,
    undoSessionChange,
    loadAgenda: (userId: string) => loadAgenda(prisma, userId),
  };
}

function sessionChanged() {
  return new AppError(409, 'SESSION_ALREADY_CHANGED', 'Essa sessão acabou de mudar. Confira e tente de novo.');
}

export type AppointmentsService = ReturnType<typeof createAppointmentsService>;
