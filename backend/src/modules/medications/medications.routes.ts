import { Router } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { createMedicationsController } from './medications.controller.js';

// Remédios e o que sinto do próprio paciente (DEC-114). O da profissional fica em
// /therapist/patients/:patientId/medications (só GET, vínculo ativo e caixa liberada).
export function createMedicationsRoutes() {
  const router = Router();
  const controller = createMedicationsController();
  const patient = [requireAuth, requirePatient, requirePrivacy('medications')];

  router.get('/medications', ...patient, controller.list);
  router.put('/medications/settings', ...patient, controller.updateSettings);
  router.post('/medications', ...patient, controller.createMedication);
  router.patch('/medications/:id', ...patient, controller.updateMedication);
  router.delete('/medications/:id', ...patient, controller.removeMedication);
  router.post('/medications/:id/changes', ...patient, controller.addChange);
  router.patch('/medications/:id/changes/:changeId', ...patient, controller.updateChange);
  router.delete('/medications/:id/changes/:changeId', ...patient, controller.removeChange);

  router.post('/symptoms', ...patient, controller.createSymptom);
  router.patch('/symptoms/:id', ...patient, controller.updateSymptom);
  router.delete('/symptoms/:id', ...patient, controller.removeSymptom);
  router.put('/symptoms/:id/checks/:date', ...patient, controller.saveCheck);
  router.delete('/symptoms/:id/checks/:date', ...patient, controller.removeCheck);
  return router;
}
