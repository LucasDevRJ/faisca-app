import { Router } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { createRecordLinksController } from './record-links.controller.js';
import { createRecordLinksService } from './record-links.service.js';

// Ligações entre registros pertencem ao paciente e só podem ser alteradas por ele.
export function createRecordLinksRoutes() {
  const controller = createRecordLinksController(createRecordLinksService());
  const router = Router();
  const patient = [requireAuth, requirePatient];
  router.get('/record-links', ...patient, controller.list);
  router.get('/record-links/candidates', ...patient, controller.candidates);
  router.post('/record-links', ...patient, controller.create);
  router.delete('/record-links/:id', ...patient, controller.remove);
  return router;
}
