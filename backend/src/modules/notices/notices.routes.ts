import { Router } from 'express';
import { createRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requireTherapist } from '../../middlewares/require-therapist.js';
import { createNoticesController } from './notices.controller.js';
import { createNoticesService } from './notices.service.js';

// Mural de avisos da terapeuta (DEC-079): a terceira exceção da regra 1 do AGENTS.md. As escritas
// da terapeuta ficam num prefixo próprio, fora de /therapist/patients/..., que continua só leitura
// (onlyReads antes de tudo). Aqui ela só grava o próprio aviso, nunca dado de paciente; por isso a
// cadeia não passa pelo vínculo: sessão → perfil de terapeuta.
export function createNoticesRoutes() {
  const controller = createNoticesController(createNoticesService());
  const router = Router();

  const therapist = [requireAuth, requireTherapist];
  // Um mural, e não um chat: poucos avisos por hora bastam, e o teto barra um envio em massa.
  const publishLimit = createRateLimit({ windowMinutes: 60, limit: 10, key: 'user' });
  router.get('/therapist/notices', ...therapist, controller.listOwn);
  router.post('/therapist/notices', ...therapist, publishLimit, controller.create);
  router.patch('/therapist/notices/:id', ...therapist, controller.update);
  router.delete('/therapist/notices/:id', ...therapist, controller.remove);

  // Paciente: só os avisos da terapeuta com vínculo ativo, e o próprio "já vi".
  const patient = [requireAuth, requirePatient];
  router.get('/notices', ...patient, controller.listForPatient);
  router.put('/notices/seen', ...patient, controller.markSeen);

  return router;
}
