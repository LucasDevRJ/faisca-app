import express, { Router } from 'express';
import { createPhotoUploadLimit, PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES } from '../../lib/photos.js';
import { createRateLimit, createRecordWriteLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePatient } from '../../middlewares/require-patient.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { createActivitiesController } from './activities.controller.js';
import { createActivitiesService } from './activities.service.js';
import { createActionVideosController } from '../actions/action-videos.controller.js';
import type { createActionVideosService } from '../actions/action-videos.service.js';

// Registros do próprio paciente (DEC-011, DEC-028). A leitura pela terapeuta vem na etapa
// de vínculo, em rotas próprias (só GET e só com vínculo ativo).
export function createActivitiesRoutes(activityVideos?: ReturnType<typeof createActionVideosService>) {
  const controller = createActivitiesController(createActivitiesService());
  const router = Router();
  const patient = [requireAuth, requirePatient];
  const writeLimit = createRecordWriteLimit();

  router.get('/activities', ...patient, controller.list);
  router.post('/activities', ...patient, writeLimit, controller.create);
  router.patch('/activities/:id', ...patient, writeLimit, controller.update);
  router.delete('/activities/:id', ...patient, writeLimit, controller.remove);

  // Transições da SPEC, uma rota por transição, cada uma com o próprio schema.
  router.post('/activities/:id/start', ...patient, writeLimit, controller.start);
  router.post('/activities/:id/complete', ...patient, writeLimit, controller.complete);
  router.post('/activities/:id/not-done', ...patient, writeLimit, controller.notDone);

  // Fotos (DEC-103): pedem o aceite da versão do aviso que as cita; sem ele, as atividades seguem
  // funcionando. O limite por conta e o corpo cru são os mesmos das fotos da Ação.
  const photos = [...patient, requirePrivacy('activityPhotos')];
  const photoLimit = createPhotoUploadLimit();
  const imageBody = express.raw({ type: PHOTO_CONTENT_TYPES, limit: PHOTO_MAX_BYTES });
  router.post('/activities/:id/photos', ...photos, photoLimit, imageBody, controller.addPhoto);
  router.get('/activities/:id/photos/:photoId', ...photos, controller.photo);
  router.delete('/activities/:id/photos/:photoId', ...photos, controller.removePhoto);

  if (activityVideos) {
    const videos = [...patient, requirePrivacy('activityVideos')];
    const uploadLimit = createRateLimit({ windowMinutes: 10, limit: 3, key: 'user' });
    const video = createActionVideosController(activityVideos);
    router.get('/activities/:id/video', ...videos, video.status);
    router.post('/activities/:id/video', ...videos, uploadLimit, video.upload);
    router.get('/activities/:id/video/play', ...videos, video.playback);
    router.delete('/activities/:id/video', ...videos, writeLimit, video.remove);
  }

  return router;
}
