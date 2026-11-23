import { Router } from 'express';
import type { RunAfterResponse } from '../../lib/background.js';
import type { Mailer } from '../../lib/mailer.js';
import type { PushSender } from '../../lib/web-push.js';
import { createRecordWriteLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/require-auth.js';
import { requirePrivacy } from '../../middlewares/require-privacy.js';
import { createMessagesController } from './messages.controller.js';
import { createMessagesService } from './messages.service.js';

export function createMessagesRoutes(mailer: Mailer, pushSender: PushSender, runAfterResponse: RunAfterResponse) {
  const router = Router();
  const controller = createMessagesController(createMessagesService(mailer, pushSender), runAfterResponse);
  const consent = [requireAuth, requirePrivacy('messages')];
  router.get('/messages/preferences', ...consent, controller.preferences);
  router.put('/messages/preferences', ...consent, createRecordWriteLimit(), controller.updatePreferences);
  router.get('/messages', ...consent, controller.conversations);
  // Antes de /messages/:linkId, para "unread" não ser lido como id de conversa.
  router.get('/messages/unread', ...consent, controller.unread);
  router.get('/messages/:linkId', ...consent, controller.page);
  router.post('/messages/:linkId', ...consent, createRecordWriteLimit(), controller.send);
  // O "visto" de quem abre a conversa (DEC-127): paciente ou profissional, só a própria coluna.
  router.put('/messages/:linkId/seen', ...consent, createRecordWriteLimit(), controller.seen);
  return router;
}
