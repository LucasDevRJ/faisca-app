import { Router } from 'express';
import { onlyReads, requireActiveLink } from '../../middlewares/require-patient-access.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { requireTherapist } from '../../middlewares/require-therapist.js';
import { createActionsService } from '../actions/actions.service.js';
import { createActivitiesService } from '../activities/activities.service.js';
import { createAppointmentsService } from '../appointments/appointments.service.js';
import { createTensionEpisodesService } from '../tension-episodes/tension-episodes.service.js';
import { createThoughtRecordsService } from '../thought-records/thought-records.service.js';
import { createTherapistController } from './therapist.controller.js';
import { createTherapistService } from './therapist.service.js';

// Visão da terapeuta (SPEC, "Visão da terapeuta"; DEC-033). Tudo sob o mesmo prefixo, que
// passa pela mesma cadeia: só leitura → sessão → perfil de terapeuta → vínculo ativo.
const PREFIX = '/therapist/patients/:patientId';

export function createTherapistRoutes() {
  const controller = createTherapistController(
    createTherapistService(
      createActivitiesService(),
      createAppointmentsService(),
      createThoughtRecordsService(),
      createTensionEpisodesService(),
      createActionsService(),
    ),
  );
  const router = Router();

  // router.use com o prefixo pega também caminhos que não existem: um POST em qualquer
  // lugar embaixo dele é 403, e não 404.
  router.use(PREFIX, onlyReads, requireAuth, requireTherapist, requireActiveLink);

  router.get(PREFIX, controller.summary);
  router.get(`${PREFIX}/activities`, controller.activities);
  // Ciclo da consulta (DEC-049): só dias, como o resumo, sem pedir o aceite da agenda.
  router.get(`${PREFIX}/cycle`, controller.cycle);
  // RPD (DEC-039), episódios de tensão (DEC-042) e agenda com motivos e pausas (DEC-045): a
  // terapeuta também precisa ter aceitado uma versão do aviso de privacidade que fale deles.
  router.get(`${PREFIX}/appointments`, requirePrivacy('appointmentSchedule'), controller.appointments);
  router.get(`${PREFIX}/thought-records`, requirePrivacy('thoughtRecords'), controller.thoughtRecords);
  router.get(`${PREFIX}/tension-episodes`, requirePrivacy('tensionEpisodes'), controller.tensionEpisodes);
  // Ação (DEC-051): também pede o aceite da versão do aviso que a cita.
  router.get(`${PREFIX}/actions`, requirePrivacy('actions'), controller.actions);

  return router;
}
