import type { Request, RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import {
  appointmentIdSchema,
  appointmentInputSchema,
  cancelSessionSchema,
  listAppointmentsQuerySchema,
  pauseInputSchema,
  rescheduleSessionSchema,
  scheduleInputSchema,
  sessionParamsSchema,
} from './appointments.schema.js';
import type { AppointmentsService } from './appointments.service.js';
import { buildCalendar } from './calendar.js';

// Contexto de paciente: o userId sai sempre da sessão, nunca do corpo ou da URL.
function owner(req: Request) {
  return {
    userId: getAuthUser(req).id,
    id: appointmentIdSchema.parse(req.params).id,
  };
}

function session(req: Request) {
  return { userId: getAuthUser(req).id, date: sessionParamsSchema.parse(req.params).date };
}

export function createAppointmentsController(service: AppointmentsService) {
  const list: RequestHandler = async (req, res) => {
    const query = listAppointmentsQuerySchema.parse(req.query);
    res.status(200).json(await service.list(getAuthUser(req).id, query));
  };

  const create: RequestHandler = async (req, res) => {
    const appointment = await service.create(getAuthUser(req).id, appointmentInputSchema.parse(req.body));
    res.status(201).json({ appointment });
  };

  const update: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    const appointment = await service.update(userId, id, appointmentInputSchema.parse(req.body));
    res.status(200).json({ appointment });
  };

  const remove: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    await service.remove(userId, id);
    res.status(204).end();
  };

  const setSchedule: RequestHandler = async (req, res) => {
    res.status(200).json(await service.setSchedule(getAuthUser(req).id, scheduleInputSchema.parse(req.body)));
  };

  const endSchedule: RequestHandler = async (req, res) => {
    res.status(200).json(await service.endSchedule(getAuthUser(req).id));
  };

  const pause: RequestHandler = async (req, res) => {
    res.status(200).json(await service.pause(getAuthUser(req).id, pauseInputSchema.parse(req.body)));
  };

  const resume: RequestHandler = async (req, res) => {
    res.status(200).json(await service.resume(getAuthUser(req).id));
  };

  const cancelSession: RequestHandler = async (req, res) => {
    const { userId, date } = session(req);
    const { reason } = cancelSessionSchema.parse(req.body);
    res.status(200).json(await service.cancelSession(userId, date, reason));
  };

  const rescheduleSession: RequestHandler = async (req, res) => {
    const { userId, date } = session(req);
    res.status(200).json(await service.rescheduleSession(userId, date, rescheduleSessionSchema.parse(req.body)));
  };

  const undoSessionChange: RequestHandler = async (req, res) => {
    const { userId, date } = session(req);
    res.status(200).json(await service.undoSessionChange(userId, date));
  };

  // Arquivo .ics para a agenda do celular (DEC-045). Texto neutro, sem dado de saúde.
  const calendar: RequestHandler = async (req, res) => {
    const agenda = await service.loadAgenda(getAuthUser(req).id);
    res
      .status(200)
      .type('text/calendar; charset=utf-8')
      .setHeader('Content-Disposition', 'attachment; filename="faisca-consultas.ics"')
      .setHeader('Cache-Control', 'no-store')
      .send(buildCalendar(agenda));
  };

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
    calendar,
  };
}
