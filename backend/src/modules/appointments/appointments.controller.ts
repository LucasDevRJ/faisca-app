import type { Request, RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { appointmentIdSchema, appointmentInputSchema } from './appointments.schema.js';
import type { AppointmentsService } from './appointments.service.js';

// Contexto de paciente: o userId sai sempre da sessão, nunca do corpo ou da URL.
function owner(req: Request) {
  return {
    userId: getAuthUser(req).id,
    id: appointmentIdSchema.parse(req.params).id,
  };
}

export function createAppointmentsController(service: AppointmentsService) {
  const list: RequestHandler = async (req, res) => {
    res.status(200).json(await service.list(getAuthUser(req).id));
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

  return { list, create, update, remove };
}
