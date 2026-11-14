import { Router, type RequestHandler } from 'express';
import {
  getPatientLink,
  onlyReads,
  requireActiveLink,
  requirePatientPrivacy,
  requireSharedArea,
} from '../../middlewares/require-patient-access.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { requireTherapist } from '../../middlewares/require-therapist.js';
import { AppError } from '../../errors/app-error.js';
import { createAboutMeService } from '../about-me/about-me.service.js';
import { createActionsController } from '../actions/actions.controller.js';
import { createActionsService } from '../actions/actions.service.js';
import { createActivitiesService } from '../activities/activities.service.js';
import { createAppointmentsService } from '../appointments/appointments.service.js';
import { createPlansService } from '../plans/plans.service.js';
import { createProfileController } from '../profile/profile.controller.js';
import { createProfileService } from '../profile/profile.service.js';
import { createReadMarksService } from '../read-marks/read-marks.service.js';
import { createSummaryController } from '../summary/summary.controller.js';
import { createSummaryService } from '../summary/summary.service.js';
import { createTensionEpisodesService } from '../tension-episodes/tension-episodes.service.js';
import { createThoughtRecordsService } from '../thought-records/thought-records.service.js';
import { createTherapistController } from './therapist.controller.js';
import { createTherapistService } from './therapist.service.js';

// Visão da terapeuta (SPEC, "Visão da terapeuta"; DEC-033). Tudo sob o mesmo prefixo, que
// passa pela mesma cadeia: leitura (com a exceção POST de criação de plano) → sessão → perfil → vínculo.
const PREFIX = '/therapist/patients/:patientId';

const requirePsychologistForPlanCreation: RequestHandler = (_req, res, next) => {
  if (getPatientLink(res).kind !== 'PSICOLOGIA') {
    throw new AppError(403, 'FORBIDDEN', 'Você não tem acesso aos registros deste paciente.');
  }
  next();
};

export function createTherapistRoutes() {
  const thoughtRecords = createThoughtRecordsService();
  const tensionEpisodes = createTensionEpisodesService();
  const actions = createActionsService();
  const aboutMe = createAboutMeService();
  const plans = createPlansService();
  const controller = createTherapistController(
    createTherapistService(
      createActivitiesService(),
      createAppointmentsService(),
      thoughtRecords,
      tensionEpisodes,
      actions,
      createReadMarksService(thoughtRecords, tensionEpisodes, actions, aboutMe, plans),
      aboutMe,
      plans,
    ),
  );
  const profile = createProfileController(createProfileService());
  const router = Router();

  // router.use com o prefixo pega também caminhos que não existem: um POST em qualquer
  // lugar embaixo dele é 403, e não 404.
  router.use(PREFIX, onlyReads, requireAuth, requireTherapist, requireActiveLink);

  // Cada área pede, além do vínculo, que o paciente a tenha liberado para esta profissional (DEC-097).
  // O resumo e a foto não: são o nome, o e-mail e a foto, e a agenda do resumo some sem a área.
  router.get(PREFIX, controller.summary);
  router.get(`${PREFIX}/activities`, requireSharedArea('ACTIVITIES'), controller.activities);
  // Ciclo da consulta (DEC-049): só dias, como o resumo, sem pedir o aceite da agenda, mas com a
  // agenda liberada pelo paciente.
  router.get(`${PREFIX}/cycle`, requireSharedArea('APPOINTMENTS'), controller.cycle);
  // RPD (DEC-039), episódios de tensão (DEC-042) e agenda com motivos e pausas (DEC-045): a
  // terapeuta também precisa ter aceitado uma versão do aviso de privacidade que fale deles.
  router.get(
    `${PREFIX}/appointments`,
    requireSharedArea('APPOINTMENTS'),
    requirePrivacy('appointmentSchedule'),
    controller.appointments,
  );
  router.get(
    `${PREFIX}/thought-records`,
    requireSharedArea('THOUGHT_RECORDS'),
    requirePrivacy('thoughtRecords'),
    controller.thoughtRecords,
  );
  router.get(
    `${PREFIX}/tension-episodes`,
    requireSharedArea('TENSION_EPISODES'),
    requirePrivacy('tensionEpisodes'),
    controller.tensionEpisodes,
  );
  // Ação (DEC-051): também pede o aceite da versão do aviso que a cita.
  router.get(`${PREFIX}/actions`, requireSharedArea('ACTIONS'), requirePrivacy('actions'), controller.actions);
  // Fotos da Ação (DEC-064): o aceite da Ação e o das fotos.
  router.get(
    `${PREFIX}/actions/:actionId/photos/:photoId`,
    requireSharedArea('ACTIONS', 'ACTION_PHOTOS'),
    requirePrivacy('actions'),
    requirePrivacy('actionPhotos'),
    createActionsController(actions).therapistPhoto,
  );
  // "Sobre mim" do paciente (DEC-081): também pede o aceite da versão do aviso que o cita.
  router.get(`${PREFIX}/about-me`, requireSharedArea('ABOUT_ME'), requirePrivacy('aboutMe'), controller.aboutMe);
  // Meus Planos (DEC-094): os planos e os registros de cada um, com o aceite da versão que os cita.
  router.get(`${PREFIX}/plans`, requireSharedArea('PLANS'), requirePrivacy('plans'), controller.plans);
  // Única escrita de dado do paciente pela psicóloga (DEC-102): cria o plano sob o dono paciente.
  router.post(
    `${PREFIX}/plans`,
    requirePsychologistForPlanCreation,
    requireSharedArea('PLANS'),
    requirePrivacy('plans'),
    requirePatientPrivacy('plans'),
    controller.createPlan,
  );
  router.get(
    `${PREFIX}/plans/:planId/entries`,
    requireSharedArea('PLANS'),
    requirePrivacy('plans'),
    controller.planEntries,
  );
  // Resumo do período (DEC-100): junta várias áreas, como os não lidos. Cada bloco só entra com a área
  // liberada pelo paciente e o aceite dela, conferidos no controller; o fechado vem como null.
  router.get(`${PREFIX}/period-summary`, createSummaryController(createSummaryService()).patient);
  // Foto de perfil do paciente (DEC-061): dado pessoal, não de saúde, sem aceite próprio.
  router.get(`${PREFIX}/avatar`, profile.patientAvatar);
  // Não lidos (DEC-057): o aceite é conferido por área dentro do service. Escrever as marcas fica
  // em /therapist/read-marks (read-marks.routes.ts), fora deste prefixo só leitura.
  router.get(`${PREFIX}/unread`, controller.unread);

  return router;
}
