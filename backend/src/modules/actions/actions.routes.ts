import { Router } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { createActionsController } from './actions.controller.js';
import { createActionsService } from './actions.service.js';

// Ação do próprio paciente (DEC-051). A leitura pela terapeuta fica em
// /therapist/patients/:patientId/actions (só GET e só com vínculo ativo).
export function createActionsRoutes() {
  const controller = createActionsController(createActionsService());
  const router = Router();
  // Sem o aceite de uma versão do aviso que cite a Ação, só esta área fica bloqueada.
  const patient = [requireAuth, requirePatient, requirePrivacy('actions')];

  router.get('/actions', ...patient, controller.list);
  router.get('/actions/:id', ...patient, controller.get);
  router.post('/actions', ...patient, controller.create);
  router.patch('/actions/:id', ...patient, controller.update);
  router.post('/actions/:id/evaluate', ...patient, controller.evaluate);
  router.post('/actions/:id/not-done', ...patient, controller.notDone);
  router.delete('/actions/:id', ...patient, controller.remove);

  return router;
}
