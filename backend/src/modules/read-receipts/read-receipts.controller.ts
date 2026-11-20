import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { getPatientLink } from '../../middlewares/require-patient-access.js';
import { linkIdSchema } from '../links/links.schema.js';
import { requestBodySchema, shareBodySchema } from './read-receipts.schema.js';
import type { ReadReceiptsService } from './read-receipts.service.js';

// Paciente: o id sai sempre da sessão. Profissional: o vínculo vem do requireActiveLink, que já
// conferiu a sessão, o perfil e o patientId da URL.
export function createReadReceiptsController(service: ReadReceiptsService) {
  const list: RequestHandler = async (req, res) => {
    res.status(200).json(await service.list(getAuthUser(req).id));
  };

  const setRequested: RequestHandler = async (req, res) => {
    const { linkId } = linkIdSchema.parse(req.params);
    const { requested } = requestBodySchema.parse(req.body);
    res.status(200).json(await service.setRequested(getAuthUser(req).id, linkId, requested));
  };

  const setShared: RequestHandler = async (req, res) => {
    const { shared } = shareBodySchema.parse(req.body);
    res.status(200).json(await service.setShared(getPatientLink(res).id, shared));
  };

  return { list, setRequested, setShared };
}
