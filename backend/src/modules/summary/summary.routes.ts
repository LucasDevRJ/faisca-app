import { Router } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { createSummaryController } from './summary.controller.js';
import { createSummaryService } from './summary.service.js';

// "Meu resumo" do próprio paciente (DEC-100). O da profissional fica em
// /therapist/patients/:patientId/period-summary (só GET, vínculo ativo e áreas liberadas).
export function createSummaryRoutes() {
  const controller = createSummaryController(createSummaryService());
  const router = Router();
  router.get('/period-summary', requireAuth, requirePatient, controller.mine);
  return router;
}
