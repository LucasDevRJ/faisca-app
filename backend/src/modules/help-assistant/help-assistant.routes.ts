import { Router } from 'express';
import { AppError } from '../../errors/app-error.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { createRateLimit } from '../../middlewares/rate-limit.js';
import { createHelpAssistantController } from './help-assistant.controller.js';
import { createHelpAssistantService } from './help-assistant.service.js';
import type { HelpProvider } from './help-provider.js';

// Ajuda da própria conta para pacientes e profissionais, sem acesso aos registros.
export function createHelpAssistantRoutes(provider?: HelpProvider) {
  const router = Router();
  router.post('/help/ask', requireAuth, createRateLimit({ windowMinutes: 1, limit: 3, key: 'user' }), async (req, res, next) => {
    if (!provider) throw new AppError(503, 'HELP_DISABLED', 'A ajuda com IA está indisponível. Você pode consultar o guia Como funciona.');
    return createHelpAssistantController(createHelpAssistantService(provider)).ask(req, res, next);
  });
  return router;
}
