import type { Request, RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import {
  activityIdSchema,
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
    const activities = await service.list(getAuthUser(req).id, listActivitiesQuerySchema.parse(req.query));
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

  return { list, create, update, start, complete, notDone, remove };
}
