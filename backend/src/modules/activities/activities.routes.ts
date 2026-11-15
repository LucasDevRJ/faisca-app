import express, { Router } from 'express';
import { createPhotoUploadLimit, PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES } from '../../lib/photos.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { createActivitiesController } from './activities.controller.js';
import { createActivitiesService } from './activities.service.js';

// Registros do próprio paciente (DEC-011, DEC-028). A leitura pela terapeuta vem na etapa
// de vínculo, em rotas próprias (só GET e só com vínculo ativo).
export function createActivitiesRoutes() {
  const controller = createActivitiesController(createActivitiesService());
  const router = Router();
  const patient = [requireAuth, requirePatient];

  router.get('/activities', ...patient, controller.list);
  router.post('/activities', ...patient, controller.create);
  router.patch('/activities/:id', ...patient, controller.update);
  router.delete('/activities/:id', ...patient, controller.remove);

  // Transições da SPEC, uma rota por transição, cada uma com o próprio schema.
  router.post('/activities/:id/start', ...patient, controller.start);
  router.post('/activities/:id/complete', ...patient, controller.complete);
  router.post('/activities/:id/not-done', ...patient, controller.notDone);

  // Fotos (DEC-103): pedem o aceite da versão do aviso que as cita; sem ele, as atividades seguem
  // funcionando. O limite por conta e o corpo cru são os mesmos das fotos da Ação.
  const photos = [...patient, requirePrivacy('activityPhotos')];
  const photoLimit = createPhotoUploadLimit();
  const imageBody = express.raw({ type: PHOTO_CONTENT_TYPES, limit: PHOTO_MAX_BYTES });
  router.post('/activities/:id/photos', ...photos, photoLimit, imageBody, controller.addPhoto);
  router.get('/activities/:id/photos/:photoId', ...photos, controller.photo);
  router.delete('/activities/:id/photos/:photoId', ...photos, controller.removePhoto);

  return router;
}
