import { Router } from 'express';
import { createRecordWriteLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { createAboutMeController } from './about-me.controller.js';
import { createAboutMeService } from './about-me.service.js';

// "Sobre mim" do próprio paciente (DEC-081). A leitura pela terapeuta fica em
// /therapist/patients/:patientId/about-me (só GET e só com vínculo ativo).
export function createAboutMeRoutes() {
  const controller = createAboutMeController(createAboutMeService());
  const router = Router();
  // Sem o aceite da versão do aviso que cita o "Sobre mim", só esta área fica bloqueada.
  const patient = [requireAuth, requirePatient, requirePrivacy('aboutMe')];
  const writeLimit = createRecordWriteLimit();

  router.get('/about-me', ...patient, controller.get);
  router.put('/about-me', ...patient, writeLimit, controller.save);

  return router;
}
