import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import {
  createPlanEntrySchema,
  createPlanSchema,
  listPlanEntriesQuerySchema,
  planEntryIdSchema,
  planIdSchema,
  updatePlanEntrySchema,
  updatePlanSchema,
} from './plans.schema.js';
import type { PlansService } from './plans.service.js';

// Contexto de paciente: o userId sai sempre da sessão, nunca do corpo ou da URL.
export function createPlansController(service: PlansService) {
  const list: RequestHandler = async (req, res) => {
    res.status(200).json({ plans: await service.list(getAuthUser(req).id) });
  };

  const get: RequestHandler = async (req, res) => {
    const { id } = planIdSchema.parse(req.params);
    res.status(200).json({ plan: await service.get(getAuthUser(req).id, id) });
  };

  const create: RequestHandler = async (req, res) => {
    const plan = await service.create(getAuthUser(req).id, createPlanSchema.parse(req.body));
    res.status(201).json({ plan });
  };

  const update: RequestHandler = async (req, res) => {
    const { id } = planIdSchema.parse(req.params);
    const plan = await service.update(getAuthUser(req).id, id, updatePlanSchema.parse(req.body));
    res.status(200).json({ plan });
  };

  const remove: RequestHandler = async (req, res) => {
    const { id } = planIdSchema.parse(req.params);
    await service.remove(getAuthUser(req).id, id);
    res.status(204).end();
  };

  const listEntries: RequestHandler = async (req, res) => {
    const { id } = planIdSchema.parse(req.params);
    const query = listPlanEntriesQuerySchema.parse(req.query);
    res.status(200).json({ entries: await service.listEntries(getAuthUser(req).id, id, query) });
  };

  const getEntry: RequestHandler = async (req, res) => {
    const { id } = planEntryIdSchema.parse(req.params);
    res.status(200).json({ entry: await service.getEntry(getAuthUser(req).id, id) });
  };

  const createEntry: RequestHandler = async (req, res) => {
    const { id } = planIdSchema.parse(req.params);
    const entry = await service.createEntry(getAuthUser(req).id, id, createPlanEntrySchema.parse(req.body));
    res.status(201).json({ entry });
  };

  const updateEntry: RequestHandler = async (req, res) => {
    const { id } = planEntryIdSchema.parse(req.params);
    const entry = await service.updateEntry(getAuthUser(req).id, id, updatePlanEntrySchema.parse(req.body));
    res.status(200).json({ entry });
  };

  const removeEntry: RequestHandler = async (req, res) => {
    const { id } = planEntryIdSchema.parse(req.params);
    await service.removeEntry(getAuthUser(req).id, id);
    res.status(204).end();
  };

  return { list, get, create, update, remove, listEntries, getEntry, createEntry, updateEntry, removeEntry };
}
