import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { getPatientLink } from '../../middlewares/require-patient-access.js';
import { createPlanSchema } from '../plans/plans.schema.js';
import {
  patientParamsSchema,
  patientPlanParamsSchema,
  therapistActionsQuerySchema,
  therapistAppointmentsQuerySchema,
  therapistCycleQuerySchema,
  therapistPlanEntriesQuerySchema,
  therapistActivitiesQuerySchema,
  therapistTensionEpisodesQuerySchema,
  therapistThoughtRecordsQuerySchema,
} from './therapist.schema.js';
import type { TherapistService } from './therapist.service.js';

// O patientId vem da URL, mas só chega aqui depois do requireActiveLink conferir o vínculo.
export function createTherapistController(service: TherapistService) {
  const summary: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    res.status(200).json(await service.summary(getAuthUser(req).id, patientId, getPatientLink(res)));
  };

  const activities: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    const query = therapistActivitiesQuerySchema.parse(req.query);
    res.status(200).json({ activities: await service.listActivities(patientId, query) });
  };

  const appointments: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    const query = therapistAppointmentsQuerySchema.parse(req.query);
    res.status(200).json(await service.listAppointments(patientId, query));
  };

  const cycle: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    res.status(200).json(await service.cycle(patientId, therapistCycleQuerySchema.parse(req.query)));
  };

  const thoughtRecords: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    const query = therapistThoughtRecordsQuerySchema.parse(req.query);
    const { sharedAreas } = getPatientLink(res);
    res
      .status(200)
      .json({ thoughtRecords: await service.listThoughtRecords(getAuthUser(req).id, patientId, query, sharedAreas) });
  };

  const tensionEpisodes: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    const query = therapistTensionEpisodesQuerySchema.parse(req.query);
    res.status(200).json({ tensionEpisodes: await service.listTensionEpisodes(getAuthUser(req).id, patientId, query) });
  };

  const actions: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    const query = therapistActionsQuerySchema.parse(req.query);
    const { sharedAreas } = getPatientLink(res);
    res.status(200).json({ actions: await service.listActions(getAuthUser(req).id, patientId, query, sharedAreas) });
  };

  // Não lidos e atualizados das três áreas (DEC-057). Área sem o aceite do aviso vem como null,
  // em vez de 403, para a tela mostrar o resto.
  const unread: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    const user = getAuthUser(req);
    res.status(200).json(await service.unread(user.id, patientId, user.privacyVersion, getPatientLink(res).sharedAreas));
  };

  const aboutMe: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    res.status(200).json({ aboutMe: await service.getAboutMe(getAuthUser(req).id, patientId) });
  };

  // Meus Planos (DEC-094): os planos, ativos e encerrados, e os registros de um plano no período.
  const plans: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    res.status(200).json({ plans: await service.listPlans(patientId) });
  };

  const createPlan: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    const plan = await service.createPlan(patientId, createPlanSchema.parse(req.body));
    res.status(201).json({ plan });
  };

  const planEntries: RequestHandler = async (req, res) => {
    const { patientId, planId } = patientPlanParamsSchema.parse(req.params);
    const query = therapistPlanEntriesQuerySchema.parse(req.query);
    res.status(200).json({ entries: await service.listPlanEntries(getAuthUser(req).id, patientId, planId, query) });
  };

  return {
    summary,
    activities,
    appointments,
    cycle,
    thoughtRecords,
    tensionEpisodes,
    actions,
    aboutMe,
    plans,
    createPlan,
    planEntries,
    unread,
  };
}
