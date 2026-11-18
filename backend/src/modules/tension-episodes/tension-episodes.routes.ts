import { Router } from 'express';
import { createRecordWriteLimit } from '../../middlewares/rate-limit.js';
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
  const writeLimit = createRecordWriteLimit();

  router.get('/tension-episodes', ...patient, controller.list);
  router.get('/tension-episodes/:id', ...patient, controller.get);
  router.post('/tension-episodes', ...patient, writeLimit, controller.create);
  router.patch('/tension-episodes/:id', ...patient, writeLimit, controller.update);
  router.delete('/tension-episodes/:id', ...patient, writeLimit, controller.remove);

  return router;
}
