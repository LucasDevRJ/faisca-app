import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../../errors/app-error.js';
import type { RunAfterResponse } from '../../lib/background.js';
import { logger } from '../../lib/logger.js';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { messagePageSchema, messagePreferencesSchema, messageSchema, messageSeenSchema } from './messages.schema.js';
import type { MessagesService } from './messages.service.js';

function conversationId(input: unknown): string {
  const parsed = z.uuid().safeParse(input);
  if (!parsed.success) throw new AppError(403, 'FORBIDDEN', 'Esta conversa não está disponível.');
  return parsed.data;
}

export function createMessagesController(service: MessagesService, runAfterResponse: RunAfterResponse) {
  const conversations: RequestHandler = async (req, res) => {
    res.json(await service.conversations(getAuthUser(req).id));
  };
  const page: RequestHandler = async (req, res) => {
    const { before } = messagePageSchema.parse(req.query);
    res.json(await service.page(getAuthUser(req).id, conversationId(req.params.linkId), before));
  };
  const send: RequestHandler = async (req, res) => {
    const userId = getAuthUser(req).id;
    const linkId = conversationId(req.params.linkId);
    const message = await service.send(userId, linkId, messageSchema.parse(req.body));
    const messageId = message.id;
    await runAfterResponse('private-message', () => service.notify(linkId, userId, messageId))
      .catch(() => logger.warn('Falha ao preparar aviso de mensagem'));
    res.status(201).json(message);
  };
  const unread: RequestHandler = async (req, res) => {
    res.json(await service.unreadSummary(getAuthUser(req).id));
  };
  const seen: RequestHandler = async (req, res) => {
    const { lastMessageId } = messageSeenSchema.parse(req.body);
    await service.markSeen(getAuthUser(req).id, conversationId(req.params.linkId), lastMessageId);
    res.sendStatus(204);
  };
  const preferences: RequestHandler = async (req, res) => {
    res.json(await service.preferences(getAuthUser(req).id));
  };
  const updatePreferences: RequestHandler = async (req, res) => {
    await service.updatePreferences(getAuthUser(req).id, messagePreferencesSchema.parse(req.body));
    res.sendStatus(204);
  };
  return { conversations, unread, page, send, seen, preferences, updatePreferences };
}
