import { Router } from 'express';
import { requireActiveLink } from '../../middlewares/require-patient-access.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { requireTherapist } from '../../middlewares/require-therapist.js';
import { createReadReceiptsController } from './read-receipts.controller.js';
import { createReadReceiptsService } from './read-receipts.service.js';

// "Lido" para o paciente (DEC-117). As duas pessoas precisam do aceite do aviso que cita o recurso.
// - Paciente: GET /read-receipts (as leituras que ele vê) e PUT /link/:linkId/read-receipts (o
//   pedido, por profissional).
// - Profissional: PUT /therapist/read-receipts/:patientId, num prefixo próprio, fora de
//   /therapist/patients/..., que continua só leitura (onlyReads). É mais uma exceção estreita da
//   regra 1: grava só a preferência dela no vínculo, nunca dado do paciente.
export function createReadReceiptsRoutes() {
  const controller = createReadReceiptsController(createReadReceiptsService());
  const router = Router();
  const patient = [requireAuth, requirePatient, requirePrivacy('readReceipts')];

  router.get('/read-receipts', ...patient, controller.list);
  router.put('/link/:linkId/read-receipts', ...patient, controller.setRequested);

  router.put(
    '/therapist/read-receipts/:patientId',
    requireAuth,
    requireTherapist,
    requireActiveLink,
    requirePrivacy('readReceipts'),
    controller.setShared,
  );

  return router;
}
