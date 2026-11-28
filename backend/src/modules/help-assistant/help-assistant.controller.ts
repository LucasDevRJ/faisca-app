import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { helpQuestionSchema } from './help-assistant.schema.js';
import type { createHelpAssistantService } from './help-assistant.service.js';

export function createHelpAssistantController(service: ReturnType<typeof createHelpAssistantService>) {
  const ask: RequestHandler = async (req, res) => {
    const input = helpQuestionSchema.parse(req.body);
    res.json(await service.ask(getAuthUser(req).id, input));
  };
  return { ask };
}
