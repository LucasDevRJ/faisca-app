import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { saveAboutMeSchema } from './about-me.schema.js';
import type { AboutMeService } from './about-me.service.js';

// Contexto de paciente: o userId sai sempre da sessão, nunca do corpo ou da URL.
export function createAboutMeController(service: AboutMeService) {
  const get: RequestHandler = async (req, res) => {
    res.status(200).json({ aboutMe: await service.get(getAuthUser(req).id) });
  };

  const save: RequestHandler = async (req, res) => {
    const aboutMe = await service.save(getAuthUser(req).id, saveAboutMeSchema.parse(req.body));
    res.status(200).json({ aboutMe });
  };

  return { get, save };
}
