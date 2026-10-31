import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { noticeBodySchema, noticeIdSchema, noticesSeenSchema } from './notices.schema.js';
import type { NoticesService } from './notices.service.js';

// Mural de avisos (DEC-079). A terapeuta e o paciente saem sempre da sessão, nunca do corpo.
export function createNoticesController(service: NoticesService) {
  const listOwn: RequestHandler = async (req, res) => {
    res.json(await service.listOwn(getAuthUser(req).id));
  };

  const create: RequestHandler = async (req, res) => {
    const input = noticeBodySchema.parse(req.body);
    res.status(201).json(await service.create(getAuthUser(req).id, input));
  };

  const update: RequestHandler = async (req, res) => {
    const { id } = noticeIdSchema.parse(req.params);
    const input = noticeBodySchema.parse(req.body);
    res.json(await service.update(getAuthUser(req).id, id, input));
  };

  const remove: RequestHandler = async (req, res) => {
    const { id } = noticeIdSchema.parse(req.params);
    await service.remove(getAuthUser(req).id, id);
    res.status(204).end();
  };

  const listForPatient: RequestHandler = async (req, res) => {
    res.json(await service.listForPatient(getAuthUser(req).id));
  };

  const markSeen: RequestHandler = async (req, res) => {
    const { ids } = noticesSeenSchema.parse(req.body);
    res.json(await service.markSeen(getAuthUser(req).id, ids));
  };

  return { listOwn, create, update, remove, listForPatient, markSeen };
}
