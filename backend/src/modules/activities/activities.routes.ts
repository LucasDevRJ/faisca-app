import { Router } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { createActivitiesController } from './activities.controller.js';
import { createActivitiesService } from './activities.service.js';

// Registros do próprio paciente (DEC-011, DEC-028). A leitura pela terapeuta vem na etapa
// de vínculo, em rotas próprias (só GET e só com vínculo ativo).
export function createActivitiesRoutes() {
  const controller = createActivitiesController(createActivitiesService());
  const router = Router();
  const patient = [requireAuth, requirePatient];

  router.get('/activities', ...patient, controller.list);
  router.post('/activities', ...patient, controller.create);
  router.patch('/activities/:id', ...patient, controller.update);
  router.delete('/activities/:id', ...patient, controller.remove);

  // Transições da SPEC, uma rota por transição, cada uma com o próprio schema.
  router.post('/activities/:id/start', ...patient, controller.start);
  router.post('/activities/:id/complete', ...patient, controller.complete);
  router.post('/activities/:id/not-done', ...patient, controller.notDone);

  return router;
}
