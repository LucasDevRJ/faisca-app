import type { Request, RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import {
  createTensionEpisodeSchema,
  listTensionEpisodesQuerySchema,
  tensionEpisodeIdSchema,
  updateTensionEpisodeSchema,
} from './tension-episodes.schema.js';
import type { TensionEpisodesService } from './tension-episodes.service.js';

// Contexto de paciente: o userId sai sempre da sessão, nunca do corpo ou da URL.
function owner(req: Request) {
  return {
    userId: getAuthUser(req).id,
    id: tensionEpisodeIdSchema.parse(req.params).id,
  };
}

export function createTensionEpisodesController(service: TensionEpisodesService) {
  const list: RequestHandler = async (req, res) => {
    const query = listTensionEpisodesQuerySchema.parse(req.query);
    res.status(200).json({ tensionEpisodes: await service.list(getAuthUser(req).id, query) });
  };

  const get: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    res.status(200).json({ tensionEpisode: await service.get(userId, id) });
  };

  const create: RequestHandler = async (req, res) => {
    const tensionEpisode = await service.create(getAuthUser(req).id, createTensionEpisodeSchema.parse(req.body));
    res.status(201).json({ tensionEpisode });
  };

  const update: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    const tensionEpisode = await service.update(userId, id, updateTensionEpisodeSchema.parse(req.body));
    res.status(200).json({ tensionEpisode });
  };

  const remove: RequestHandler = async (req, res) => {
    const { userId, id } = owner(req);
    await service.remove(userId, id);
    res.status(204).end();
  };

  return { list, get, create, update, remove };
}
