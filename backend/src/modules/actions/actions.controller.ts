import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../../errors/app-error.js';
import { getAuthUser } from '../../middlewares/require-auth.js';
import {
  actionIdSchema,
  createActionSchema,
  evaluateActionSchema,
  listActionsQuerySchema,
  notDoneActionSchema,
  photoParamsSchema,
  photoSizeSchema,
  therapistPhotoParamsSchema,
  updateActionSchema,
} from './actions.schema.js';
import type { ActionsService } from './actions.service.js';

// Contexto de paciente: o userId sai sempre da sessão, nunca do corpo ou da URL.
function owner(req: Request) {
  return { userId: getAuthUser(req).id, id: actionIdSchema.parse(req.params).id };
}

// Sem cache nenhum (DEC-066): a foto é dado de saúde e não pode ficar no disco do aparelho depois
// de sair da conta ou de desfazer o vínculo. O custo é baixar de novo a cada visita.
function sendPhoto(res: Response, image: Uint8Array) {
  res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' });
  res.status(200).send(Buffer.from(image));
}

export function createActionsController(service: ActionsService) {
  const list: RequestHandler = async (req, res) => {
    const query = listActionsQuerySchema.parse(req.query);
    // A leitura do próprio paciente congela o prazo das fotos (DEC-064).
    res.status(200).json({ actions: await service.list(getAuthUser(req).id, query, true) });
  };

  const get: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    res.status(200).json({ action: await service.get(userId, id) });
  };

  const create: RequestHandler = async (req, res) => {
    const action = await service.create(getAuthUser(req).id, createActionSchema.parse(req.body));
    res.status(201).json({ action });
  };

  const update: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    res.status(200).json({ action: await service.update(userId, id, updateActionSchema.parse(req.body)) });
  };

  const evaluate: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    res.status(200).json({ action: await service.evaluate(userId, id, evaluateActionSchema.parse(req.body)) });
  };

  const notDone: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    res.status(200).json({ action: await service.notDone(userId, id, notDoneActionSchema.parse(req.body)) });
  };

  const remove: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    await service.remove(userId, id);
    res.status(204).end();
  };

  // ——— Fotos (DEC-064) ———

  const addPhoto: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    // Sem Content-Type de imagem, o express.raw não lê o corpo.
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie uma foto em JPEG, PNG ou WebP.');
    }
    res.status(201).json(await service.addPhoto(userId, id, req.body));
  };

  const removePhoto: RequestHandler = async (req, res) => {
    const { id, photoId } = photoParamsSchema.parse(req.params);
    await service.removePhoto(getAuthUser(req).id, id, photoId);
    res.status(204).end();
  };

  const photo: RequestHandler = async (req, res) => {
    const { id, photoId } = photoParamsSchema.parse(req.params);
    const { size } = photoSizeSchema.parse(req.query);
    sendPhoto(res, await service.ownPhotoImage(getAuthUser(req).id, id, photoId, size));
  };

  // Contexto de terapeuta: só depois da cadeia do prefixo (só leitura, vínculo ativo).
  const therapistPhoto: RequestHandler = async (req, res) => {
    const { patientId, actionId, photoId } = therapistPhotoParamsSchema.parse(req.params);
    const { size } = photoSizeSchema.parse(req.query);
    sendPhoto(res, await service.photoImage(patientId, actionId, photoId, size));
  };

  return { list, get, create, update, evaluate, notDone, remove, addPhoto, removePhoto, photo, therapistPhoto };
}
