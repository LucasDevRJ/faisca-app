import { Router } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { createPlansController } from './plans.controller.js';
import { createPlansService } from './plans.service.js';

// Meus Planos do próprio paciente (DEC-094). A leitura pela terapeuta fica em
// /therapist/patients/:patientId/plans (só GET e só com vínculo ativo).
export function createPlansRoutes() {
  const controller = createPlansController(createPlansService());
  const router = Router();
  // Sem o aceite de uma versão do aviso que cite o Meus Planos, só esta área fica bloqueada.
  const patient = [requireAuth, requirePatient, requirePrivacy('plans')];

  router.get('/plans', ...patient, controller.list);
  router.post('/plans', ...patient, controller.create);
  router.get('/plans/:id', ...patient, controller.get);
  router.patch('/plans/:id', ...patient, controller.update);
  router.delete('/plans/:id', ...patient, controller.remove);
  router.get('/plans/:id/entries', ...patient, controller.listEntries);
  router.post('/plans/:id/entries', ...patient, controller.createEntry);
  router.get('/plan-entries/:id', ...patient, controller.getEntry);
  router.patch('/plan-entries/:id', ...patient, controller.updateEntry);
  router.delete('/plan-entries/:id', ...patient, controller.removeEntry);

  return router;
}
