import { Router } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { createTensionEpisodesController } from './tension-episodes.controller.js';
import { createTensionEpisodesService } from './tension-episodes.service.js';

// Episódios de tensão do próprio paciente (DEC-042). A leitura pela terapeuta fica em
// /therapist/patients/:patientId/tension-episodes (só GET e só com vínculo ativo).
export function createTensionEpisodesRoutes() {
  const controller = createTensionEpisodesController(createTensionEpisodesService());
  const router = Router();
  // Sem o aceite de uma versão do aviso que cite os episódios, só esta área fica bloqueada.
  const patient = [requireAuth, requirePatient, requirePrivacy('tensionEpisodes')];

  router.get('/tension-episodes', ...patient, controller.list);
  router.get('/tension-episodes/:id', ...patient, controller.get);
  router.post('/tension-episodes', ...patient, controller.create);
  router.patch('/tension-episodes/:id', ...patient, controller.update);
  router.delete('/tension-episodes/:id', ...patient, controller.remove);

  return router;
}
