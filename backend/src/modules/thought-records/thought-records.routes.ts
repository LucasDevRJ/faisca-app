import { Router } from 'express';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requireCurrentPrivacy } from '../../middlewares/require-current-privacy.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { createThoughtRecordsController } from './thought-records.controller.js';
import { createThoughtRecordsService } from './thought-records.service.js';

// Registro de Pensamentos do próprio paciente (DEC-039). A leitura pela terapeuta fica em
// /therapist/patients/:patientId/thought-records (só GET e só com vínculo ativo).
export function createThoughtRecordsRoutes() {
  const controller = createThoughtRecordsController(createThoughtRecordsService());
  const router = Router();
  // Sem o aceite da versão atual do aviso, só esta área fica bloqueada (SPEC, "Privacidade").
  const patient = [requireAuth, requirePatient, requireCurrentPrivacy];

  router.get('/thought-records', ...patient, controller.list);
  router.post('/thought-records', ...patient, controller.create);
  router.patch('/thought-records/:id', ...patient, controller.update);
  router.delete('/thought-records/:id', ...patient, controller.remove);

  return router;
}
