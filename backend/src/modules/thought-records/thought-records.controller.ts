import type { Request, RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import {
  createThoughtRecordSchema,
  listThoughtRecordsQuerySchema,
  thoughtRecordIdSchema,
  updateThoughtRecordSchema,
} from './thought-records.schema.js';
import type { ThoughtRecordsService } from './thought-records.service.js';

// Contexto de paciente: o userId sai sempre da sessão, nunca do corpo ou da URL.
function owner(req: Request) {
  return {
    userId: getAuthUser(req).id,
    id: thoughtRecordIdSchema.parse(req.params).id,
  };
}

export function createThoughtRecordsController(service: ThoughtRecordsService) {
  const list: RequestHandler = async (req, res) => {
    const query = listThoughtRecordsQuerySchema.parse(req.query);
    res.status(200).json({ thoughtRecords: await service.list(getAuthUser(req).id, query) });
  };

  const get: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    res.status(200).json({ thoughtRecord: await service.get(userId, id) });
  };

  const create: RequestHandler = async (req, res) => {
    const thoughtRecord = await service.create(getAuthUser(req).id, createThoughtRecordSchema.parse(req.body));
    res.status(201).json({ thoughtRecord });
  };

  const update: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    const thoughtRecord = await service.update(userId, id, updateThoughtRecordSchema.parse(req.body));
    res.status(200).json({ thoughtRecord });
  };

  const remove: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    await service.remove(userId, id);
    res.status(204).end();
  };

  return { list, get, create, update, remove };
}
