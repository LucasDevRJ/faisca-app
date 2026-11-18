import express, { Router } from 'express';
import { createPhotoUploadLimit, PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES } from '../../lib/photos.js';
import { createRecordWriteLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { createActionsController } from './actions.controller.js';
import { createActionsService } from './actions.service.js';

// Ação do próprio paciente (DEC-051). A leitura pela terapeuta fica em
// /therapist/patients/:patientId/actions (só GET e só com vínculo ativo).
export function createActionsRoutes() {
  const controller = createActionsController(createActionsService());
  const router = Router();
  // Sem o aceite de uma versão do aviso que cite a Ação, só esta área fica bloqueada.
  const patient = [requireAuth, requirePatient, requirePrivacy('actions')];
  const writeLimit = createRecordWriteLimit();

  router.get('/actions', ...patient, controller.list);
  router.get('/actions/:id', ...patient, controller.get);
  router.post('/actions', ...patient, writeLimit, controller.create);
  router.patch('/actions/:id', ...patient, writeLimit, controller.update);
  router.post('/actions/:id/evaluate', ...patient, writeLimit, controller.evaluate);
  router.post('/actions/:id/not-done', ...patient, writeLimit, controller.notDone);
  router.delete('/actions/:id', ...patient, writeLimit, controller.remove);

  // Fotos da ação avaliada (DEC-064): pedem também o aceite da versão do aviso que as cita.
  const photos = [...patient, requirePrivacy('actionPhotos')];
  // Processar foto é caro: o limite por conta evita que envios em sequência derrubem a API.
  const photoLimit = createPhotoUploadLimit();
  const imageBody = express.raw({ type: PHOTO_CONTENT_TYPES, limit: PHOTO_MAX_BYTES });
  router.post('/actions/:id/photos', ...photos, photoLimit, imageBody, controller.addPhoto);
  router.get('/actions/:id/photos/:photoId', ...photos, controller.photo);
  router.delete('/actions/:id/photos/:photoId', ...photos, controller.removePhoto);

  return router;
}
