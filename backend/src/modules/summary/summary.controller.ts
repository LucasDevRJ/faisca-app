import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { getPatientLink } from '../../middlewares/require-patient-access.js';
import { patientParamsSchema } from '../therapist/therapist.schema.js';
import { periodSummaryQuerySchema } from './summary.schema.js';
import { visibleSummaryAreas, type SummaryService } from './summary.service.js';

export function createSummaryController(service: SummaryService) {
  // "Meu resumo" (DEC-100): os próprios registros, só das áreas cujo aviso o paciente aceitou.
  const mine: RequestHandler = async (req, res) => {
    const user = getAuthUser(req);
    const query = periodSummaryQuerySchema.parse(req.query);
    res.status(200).json(await service.periodSummary(user.id, query, visibleSummaryAreas(user.privacyVersion)));
  };

  // Na profissional: o patientId já passou pelo requireActiveLink, e só entram as áreas liberadas
  // pelo paciente para ela e cobertas pelo aceite dela (regra 1, DEC-097).
  const patient: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    const query = periodSummaryQuerySchema.parse(req.query);
    const areas = visibleSummaryAreas(getAuthUser(req).privacyVersion, getPatientLink(res).sharedAreas);
    res.status(200).json(await service.periodSummary(patientId, query, areas));
  };

  return { mine, patient };
}
