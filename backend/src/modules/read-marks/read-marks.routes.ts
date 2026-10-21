import { Router } from 'express';
import { requireActiveLink } from '../../middlewares/require-patient-access.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requireTherapist } from '../../middlewares/require-therapist.js';
import { createActionsService } from '../actions/actions.service.js';
import { createTensionEpisodesService } from '../tension-episodes/tension-episodes.service.js';
import { createThoughtRecordsService } from '../thought-records/thought-records.service.js';
import { createReadMarksController } from './read-marks.controller.js';
import { createReadMarksService } from './read-marks.service.js';

// Marcas de leitura da terapeuta (DEC-057): a exceção da regra 1 do AGENTS.md. Ficam num prefixo
// próprio, fora de /therapist/patients/..., que continua só leitura (onlyReads antes de tudo). Aqui
// só se grava e apaga marca da própria terapeuta; nunca o registro do paciente.
const PREFIX = '/therapist/read-marks/:patientId';

export function createReadMarksRoutes() {
  const controller = createReadMarksController(
    createReadMarksService(createThoughtRecordsService(), createTensionEpisodesService(), createActionsService()),
  );
  const router = Router();

  // Mesma cadeia da visão da terapeuta, sem o onlyReads: sessão → perfil → vínculo ativo. O aceite
  // do aviso é conferido por área no service, porque um pedido pode trazer as três.
  router.use(PREFIX, requireAuth, requireTherapist, requireActiveLink);
  router.put(PREFIX, controller.mark);
  router.delete(PREFIX, controller.unmark);

  return router;
}
