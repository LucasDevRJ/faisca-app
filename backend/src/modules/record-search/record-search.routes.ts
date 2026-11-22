import { Router } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { createRecordSearchController } from './record-search.controller.js';

export function createRecordSearchRoutes() {
  const router = Router();
  const controller = createRecordSearchController();
  router.post('/records/search', requireAuth, requirePatient, controller.patient);
  return router;
}
