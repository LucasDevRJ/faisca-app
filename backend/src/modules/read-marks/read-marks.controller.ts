import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { patientParamsSchema } from '../therapist/therapist.schema.js';
import { readMarksBodySchema } from './read-marks.schema.js';
import type { ReadMarksService } from './read-marks.service.js';

// O patientId vem da URL, mas só chega aqui depois do requireActiveLink conferir o vínculo. A
// terapeuta sai sempre da sessão.
export function createReadMarksController(service: ReadMarksService) {
  const mark: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    const { items } = readMarksBodySchema.parse(req.body);
    const user = getAuthUser(req);
    res.status(200).json(await service.mark(user.id, patientId, user.privacyVersion, items));
  };

  const unmark: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    const { items } = readMarksBodySchema.parse(req.body);
    const user = getAuthUser(req);
    res.status(200).json(await service.unmark(user.id, patientId, user.privacyVersion, items));
  };

  return { mark, unmark };
}
