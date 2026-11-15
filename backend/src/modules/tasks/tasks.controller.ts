import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { createTaskSchema, updateTaskSchema, taskIdSchema, taskResponseSchema } from './tasks.schema.js';
import { createTasksService } from './tasks.service.js';
export function createTasksController() {
  const service = createTasksService();
  const list: RequestHandler = async (req, res) => { res.json({ tasks: await service.list(getAuthUser(req).id, undefined, true) }); };
  const create: RequestHandler = async (req, res) => { res.status(201).json({ task: await service.create(getAuthUser(req).id, createTaskSchema.parse(req.body)) }); };
  const update: RequestHandler = async (req, res) => { res.json({ task: await service.update(getAuthUser(req).id, taskIdSchema.parse(req.params).id, updateTaskSchema.parse(req.body)) }); };
  const remove: RequestHandler = async (req, res) => { await service.remove(getAuthUser(req).id, taskIdSchema.parse(req.params).id); res.status(204).end(); };
  const respond: RequestHandler = async (req, res) => { res.json({ task: await service.respond(getAuthUser(req).id, taskIdSchema.parse(req.params).id, taskResponseSchema.parse(req.body)) }); };
  return { list, create, update, remove, respond };
}
