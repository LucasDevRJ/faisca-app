import { Router } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { createAppointmentsController } from './appointments.controller.js';
import { createAppointmentsService } from './appointments.service.js';

// Agenda do próprio paciente (DEC-017, DEC-030, DEC-045). A terapeuta lê em rotas próprias
// (só GET e só com vínculo ativo, no módulo therapist).
export function createAppointmentsRoutes() {
  const controller = createAppointmentsController(createAppointmentsService());
  const router = Router();
  const patient = [requireAuth, requirePatient];
  // Hora, motivos e pausas entraram no aviso de privacidade na 2026-10.4: quem ainda não aceitou
  // não grava esses dados. Ler, excluir, encerrar e retomar seguem liberados.
  const writesAgenda = [...patient, requirePrivacy('appointmentSchedule')];

  router.get('/appointments', ...patient, controller.list);
  router.get('/appointments/calendar.ics', ...patient, controller.calendar);
  // Ciclo da consulta (DEC-049): só dias, sem motivos, então não pede o aceite da agenda.
  router.get('/appointments/cycle', ...patient, controller.cycle);
  router.post('/appointments', ...writesAgenda, controller.create);
  router.put('/appointments/schedule', ...writesAgenda, controller.setSchedule);
  router.post('/appointments/schedule/end', ...patient, controller.endSchedule);
  router.post('/appointments/pause', ...writesAgenda, controller.pause);
  router.post('/appointments/pause/resume', ...patient, controller.resume);
  router.post('/appointments/sessions/:date/cancel', ...writesAgenda, controller.cancelSession);
  router.post('/appointments/sessions/:date/reschedule', ...writesAgenda, controller.rescheduleSession);
  router.delete('/appointments/sessions/:date/change', ...patient, controller.undoSessionChange);
  router.patch('/appointments/:id', ...writesAgenda, controller.update);
  router.delete('/appointments/:id', ...patient, controller.remove);

  return router;
}
