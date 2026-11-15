import type { Request, RequestHandler } from 'express';
import { assertPhotoBody, sendPhoto } from '../../lib/photos.js';
import { getAuthUser } from '../../middlewares/require-auth.js';
import {
  activityIdSchema,
  activityPhotoParamsSchema,
  photoSizeSchema,
  therapistActivityPhotoParamsSchema,
  completeActivitySchema,
  createActivitySchema,
  listActivitiesQuerySchema,
  notDoneActivitySchema,
  startActivitySchema,
  updateActivitySchema,
} from './activities.schema.js';
import type { ActivitiesService } from './activities.service.js';

// Contexto de paciente: o userId sai sempre da sessão, nunca do corpo ou da URL.
function owner(req: Request) {
  return {
    userId: getAuthUser(req).id,
    id: activityIdSchema.parse(req.params).id,
  };
}

export function createActivitiesController(service: ActivitiesService) {
  const list: RequestHandler = async (req, res) => {
    // freeze: o próprio paciente lendo congela o prazo das fotos (DEC-103).
    const activities = await service.list(getAuthUser(req).id, listActivitiesQuerySchema.parse(req.query), true);
    res.status(200).json({ activities });
  };

  const create: RequestHandler = async (req, res) => {
    const activity = await service.create(getAuthUser(req).id, createActivitySchema.parse(req.body));
    res.status(201).json({ activity });
  };

  const update: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    const activity = await service.update(userId, id, updateActivitySchema.parse(req.body));
    res.status(200).json({ activity });
  };

  const start: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    const activity = await service.start(userId, id, startActivitySchema.parse(req.body));
    res.status(200).json({ activity });
  };

  const complete: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    const activity = await service.complete(userId, id, completeActivitySchema.parse(req.body));
    res.status(200).json({ activity });
  };

  const notDone: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    // Body opcional: "não aconteceu" sem observação pode vir sem corpo.
    const activity = await service.notDone(userId, id, notDoneActivitySchema.parse(req.body ?? {}));
    res.status(200).json({ activity });
  };

  const remove: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    await service.remove(userId, id);
    res.status(204).end();
  };

  // ——— Fotos (DEC-103) ———

  const addPhoto: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    assertPhotoBody(req.body);
    res.status(201).json(await service.addPhoto(userId, id, req.body));
  };

  const removePhoto: RequestHandler = async (req, res) => {
    const { id, photoId } = activityPhotoParamsSchema.parse(req.params);
    await service.removePhoto(getAuthUser(req).id, id, photoId);
    res.status(204).end();
  };

  const photo: RequestHandler = async (req, res) => {
    const { id, photoId } = activityPhotoParamsSchema.parse(req.params);
    const { size } = photoSizeSchema.parse(req.query);
    sendPhoto(res, await service.ownPhotoImage(getAuthUser(req).id, id, photoId, size));
  };

  // Contexto de terapeuta: só depois da cadeia do prefixo (só leitura, vínculo ativo, áreas liberadas).
  const therapistPhoto: RequestHandler = async (req, res) => {
    const { patientId, activityId, photoId } = therapistActivityPhotoParamsSchema.parse(req.params);
    const { size } = photoSizeSchema.parse(req.query);
    sendPhoto(res, await service.photoImage(patientId, activityId, photoId, size));
  };

  return { list, create, update, start, complete, notDone, remove, addPhoto, removePhoto, photo, therapistPhoto };
}
