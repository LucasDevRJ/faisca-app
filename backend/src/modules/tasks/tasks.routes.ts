import { Router } from 'express';
import { createRecordWriteLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { createTasksController } from './tasks.controller.js';
export function createTasksRoutes() {
  const router = Router();
  const controller = createTasksController();
  const patient = [requireAuth, requirePatient, requirePrivacy('tasks')];
  const writeLimit = createRecordWriteLimit();
  router.get('/tasks', ...patient, controller.list);
  router.post('/tasks', ...patient, writeLimit, controller.create);
  router.patch('/tasks/:id', ...patient, writeLimit, controller.update);
  router.delete('/tasks/:id', ...patient, writeLimit, controller.remove);
  router.put('/tasks/:id/response', ...patient, writeLimit, controller.respond);
  return router;
}
