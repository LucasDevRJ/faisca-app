import type { Request, RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import {
  actionIdSchema,
  createActionSchema,
  evaluateActionSchema,
  listActionsQuerySchema,
  notDoneActionSchema,
  updateActionSchema,
} from './actions.schema.js';
import type { ActionsService } from './actions.service.js';

// Contexto de paciente: o userId sai sempre da sessão, nunca do corpo ou da URL.
function owner(req: Request) {
  return { userId: getAuthUser(req).id, id: actionIdSchema.parse(req.params).id };
}

export function createActionsController(service: ActionsService) {
  const list: RequestHandler = async (req, res) => {
    const query = listActionsQuerySchema.parse(req.query);
    res.status(200).json({ actions: await service.list(getAuthUser(req).id, query) });
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

  return { list, get, create, update, evaluate, notDone, remove };
}
