import type { RequestHandler, Response } from 'express';
import { AppError } from '../../errors/app-error.js';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { updateProfileSchema } from './profile.schema.js';
import type { Avatar, ProfileService } from './profile.service.js';

function noAvatar() {
  return new AppError(404, 'NO_AVATAR', 'Sem foto de perfil.');
}

// A foto vai como imagem, sem cache compartilhado: só o navegador de quem pediu guarda, e
// confere de novo antes de reusar (o ETag evita baixar outra vez se não mudou).
function sendAvatar(res: Response, avatar: Avatar | null) {
  if (!avatar) throw noAvatar();
  res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-cache' });
  res.status(200).send(Buffer.from(avatar.image));
}

export function createProfileController(service: ProfileService) {
  // ——— A própria conta (o id sai sempre da sessão) ———

  const get: RequestHandler = async (req, res) => {
    res.status(200).json({ profile: await service.get(getAuthUser(req).id) });
  };

  const update: RequestHandler = async (req, res) => {
    const input = updateProfileSchema.parse(req.body);
    res.status(200).json({ profile: await service.update(getAuthUser(req).id, input) });
  };

  const putAvatar: RequestHandler = async (req, res) => {
    // Sem Content-Type de imagem, o express.raw não lê o corpo.
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie uma foto em JPEG, PNG ou WebP.');
    }
    res.status(200).json({ profile: await service.setAvatar(getAuthUser(req).id, req.body) });
  };

  const deleteAvatar: RequestHandler = async (req, res) => {
    if (!(await service.removeAvatar(getAuthUser(req).id))) throw noAvatar();
    res.status(204).end();
  };

  const ownAvatar: RequestHandler = async (req, res) => {
    sendAvatar(res, await service.avatarOf(getAuthUser(req).id));
  };

  // ——— Contexto de paciente: a foto da terapeuta com vínculo ativo ———

  const therapistAvatar: RequestHandler = async (req, res) => {
    const therapistId = await service.linkedTherapistId(getAuthUser(req).id);
    if (!therapistId) throw new AppError(404, 'NO_ACTIVE_LINK', 'Você não tem terapeuta vinculada.');
    sendAvatar(res, await service.avatarOf(therapistId));
  };

  // ——— Contexto de terapeuta: só depois da cadeia do prefixo (vínculo ativo) ———

  const patientAvatar: RequestHandler = async (req, res) => {
    sendAvatar(res, await service.avatarOf(String(req.params.patientId)));
  };

  return { get, update, putAvatar, deleteAvatar, ownAvatar, therapistAvatar, patientAvatar };
}

export type ProfileController = ReturnType<typeof createProfileController>;
