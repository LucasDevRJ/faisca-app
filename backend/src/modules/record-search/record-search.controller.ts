import type { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error.js';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { getPatientLink } from '../../middlewares/require-patient-access.js';
import { patientParamsSchema } from '../therapist/therapist.schema.js';
import { recordSearchSchema } from './record-search.schema.js';
import { createRecordSearchService } from './record-search.service.js';

export function createRecordSearchController() {
  const service = createRecordSearchService();

  const patient: RequestHandler = async (req, res) => {
    const input = recordSearchSchema.parse(req.body);
    if (input.onlyUnread) throw new AppError(400, 'SEARCH_FILTER_INVALID', 'O filtro de não lidos só está disponível para a profissional.');
    const user = getAuthUser(req);
    res.status(200).json(await service.search(user.id, user.id, input, undefined, user.privacyVersion));
  };

  const therapist: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    const user = getAuthUser(req);
    const link = getPatientLink(res);
    res.status(200).json(await service.search(user.id, patientId, recordSearchSchema.parse(req.body), {
      sharedAreas: link.sharedAreas,
      patientPrivacyVersion: link.patientPrivacyVersion,
      therapistPrivacyVersion: user.privacyVersion,
    }));
  };

  return { patient, therapist };
}
