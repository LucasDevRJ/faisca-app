import type { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error.js';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { acceptInviteSchema, createInviteSchema, redeemCodeSchema } from './links.schema.js';
import type { LinksService } from './links.service.js';

// Contexto de paciente: o id sai sempre da sessão, nunca do corpo ou da URL.
export function createLinksController(service: LinksService) {
  const status: RequestHandler = async (req, res) => {
    res.status(200).json(await service.status(getAuthUser(req).id));
  };

  const createInvite: RequestHandler = async (req, res) => {
    const invite = await service.createInvite(getAuthUser(req), createInviteSchema.parse(req.body));
    res.status(201).json({ invite });
  };

  const cancelInvite: RequestHandler = async (req, res) => {
    if (!(await service.cancelInvite(getAuthUser(req).id))) {
      throw new AppError(404, 'NO_PENDING_INVITE', 'Não há convite pendente.');
    }
    res.status(204).end();
  };

  const generateCode: RequestHandler = async (req, res) => {
    res.status(201).json(await service.generateCode(getAuthUser(req).id));
  };

  const revoke: RequestHandler = async (req, res) => {
    if (!(await service.revoke(getAuthUser(req).id))) {
      throw new AppError(404, 'NO_ACTIVE_LINK', 'Você não tem terapeuta vinculada.');
    }
    res.status(204).end();
  };

  const markSeen: RequestHandler = async (req, res) => {
    await service.markSeen(getAuthUser(req).id);
    res.status(204).end();
  };

  const redeemCode: RequestHandler = async (req, res) => {
    const { code } = redeemCodeSchema.parse(req.body);
    const patient = await service.redeemCode(getAuthUser(req).id, code);
    res.status(201).json({ patient });
  };

  const acceptInvite: RequestHandler = async (req, res) => {
    const { token } = acceptInviteSchema.parse(req.body);
    const patient = await service.acceptInvite(getAuthUser(req).id, token);
    res.status(201).json({ patient });
  };

  const listPatients: RequestHandler = async (req, res) => {
    res.status(200).json({ patients: await service.listPatients(getAuthUser(req).id) });
  };

  return { status, createInvite, cancelInvite, generateCode, revoke, markSeen, redeemCode, acceptInvite, listPatients };
}
