import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { patientParamsSchema, therapistActivitiesQuerySchema } from './therapist.schema.js';
import type { TherapistService } from './therapist.service.js';

// O patientId vem da URL, mas só chega aqui depois do requireActiveLink conferir o vínculo.
export function createTherapistController(service: TherapistService) {
  const summary: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    res.status(200).json(await service.summary(getAuthUser(req).id, patientId));
  };

  const activities: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    const query = therapistActivitiesQuerySchema.parse(req.query);
    res.status(200).json({ activities: await service.listActivities(patientId, query) });
  };

  const appointments: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    res.status(200).json(await service.listAppointments(patientId));
  };

  return { summary, activities, appointments };
}
