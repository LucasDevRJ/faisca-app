import { Router } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { createTasksController } from './tasks.controller.js';
export function createTasksRoutes() {
  const router = Router();
  const controller = createTasksController();
  const patient = [requireAuth, requirePatient, requirePrivacy('tasks')];
  router.get('/tasks', ...patient, controller.list);
  router.post('/tasks', ...patient, controller.create);
  router.patch('/tasks/:id', ...patient, controller.update);
  router.delete('/tasks/:id', ...patient, controller.remove);
  router.put('/tasks/:id/response', ...patient, controller.respond);
  return router;
}
