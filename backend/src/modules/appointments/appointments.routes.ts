import { Router } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { createAppointmentsController } from './appointments.controller.js';
import { createAppointmentsService } from './appointments.service.js';

// Consultas do próprio paciente (DEC-017, DEC-030). A leitura pela terapeuta vem na etapa
// de vínculo, em rotas próprias (só GET e só com vínculo ativo).
export function createAppointmentsRoutes() {
  const controller = createAppointmentsController(createAppointmentsService());
  const router = Router();
  const patient = [requireAuth, requirePatient];

  router.get('/appointments', ...patient, controller.list);
  router.post('/appointments', ...patient, controller.create);
  router.patch('/appointments/:id', ...patient, controller.update);
  router.delete('/appointments/:id', ...patient, controller.remove);

  return router;
}
