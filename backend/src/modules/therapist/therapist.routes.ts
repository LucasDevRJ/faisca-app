import { Router } from 'express';
import { onlyReads, requireActiveLink } from '../../middlewares/require-patient-access.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requireCurrentPrivacy } from '../../middlewares/require-current-privacy.js';
import { requireTherapist } from '../../middlewares/require-therapist.js';
import { createActivitiesService } from '../activities/activities.service.js';
import { createAppointmentsService } from '../appointments/appointments.service.js';
import { createThoughtRecordsService } from '../thought-records/thought-records.service.js';
import { createTherapistController } from './therapist.controller.js';
import { createTherapistService } from './therapist.service.js';

// Visão da terapeuta (SPEC, "Visão da terapeuta"; DEC-033). Tudo sob o mesmo prefixo, que
// passa pela mesma cadeia: só leitura → sessão → perfil de terapeuta → vínculo ativo.
const PREFIX = '/therapist/patients/:patientId';

export function createTherapistRoutes() {
  const controller = createTherapistController(
    createTherapistService(createActivitiesService(), createAppointmentsService(), createThoughtRecordsService()),
  );
  const router = Router();

  // router.use com o prefixo pega também caminhos que não existem: um POST em qualquer
  // lugar embaixo dele é 403, e não 404.
  router.use(PREFIX, onlyReads, requireAuth, requireTherapist, requireActiveLink);

  router.get(PREFIX, controller.summary);
  router.get(`${PREFIX}/activities`, controller.activities);
  router.get(`${PREFIX}/appointments`, controller.appointments);
  // Registro de Pensamentos (DEC-039): a terapeuta também precisa ter aceitado a versão atual
  // do aviso de privacidade, que fala desse registro.
  router.get(`${PREFIX}/thought-records`, requireCurrentPrivacy, controller.thoughtRecords);

  return router;
}
