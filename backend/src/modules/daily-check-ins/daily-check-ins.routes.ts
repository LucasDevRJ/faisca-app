import { Router } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { createDailyCheckInsController } from './daily-check-ins.controller.js';

// Sono, humor e remédio do próprio paciente (DEC-107). O da profissional fica em
// /therapist/patients/:patientId/daily-check-ins (só GET, vínculo ativo e áreas liberadas).
export function createDailyCheckInsRoutes() {
  const router = Router();
  const controller = createDailyCheckInsController();
  const patient = [requireAuth, requirePatient, requirePrivacy('sleepMood')];
  router.get('/daily-check-ins', ...patient, controller.list);
  // Antes de /:date, para "settings" não ser lido como uma data.
  router.put('/daily-check-ins/settings', ...patient, controller.updateSettings);
  router.put('/daily-check-ins/:date', ...patient, controller.save);
  router.delete('/daily-check-ins/:date', ...patient, controller.remove);
  return router;
}
