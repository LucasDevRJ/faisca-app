import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import type { Prisma, PrivateMessage } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import type { Mailer } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import type { PushSender } from '../../lib/web-push.js';
import { coversArea } from '../auth/privacy.js';
import type { MessageInput, MessagePreferences } from './messages.schema.js';

const PAGE_SIZE = 30;
const participant = { name: true, privacyVersion: true, hasPatientProfile: true, hasTherapistProfile: true } as const;
const participants = { patient: { select: participant }, therapist: { select: participant } } as const;

function unavailable() {
  return new AppError(403, 'FORBIDDEN', 'Esta conversa não está disponível.');
}

function activeLinks(userId: string) {
  return { revokedAt: null, OR: [{ patientId: userId }, { therapistId: userId }] };
}

function canTalk(link: { patient: { privacyVersion: string | null; hasPatientProfile: boolean }; therapist: { privacyVersion: string | null; hasTherapistProfile: boolean } }) {
  return link.patient.hasPatientProfile && link.therapist.hasTherapistProfile
    && coversArea(link.patient.privacyVersion, 'messages') && coversArea(link.therapist.privacyVersion, 'messages');
}

async function requireConversation(tx: Prisma.TransactionClient, linkId: string, userId: string) {
  // A revogação atualiza esta mesma linha. O bloqueio mantém a verificação e a operação juntas.
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "TherapistLink"
    WHERE id = ${linkId}::uuid AND "revokedAt" IS NULL
      AND ("patientId" = ${userId}::uuid OR "therapistId" = ${userId}::uuid)
    FOR SHARE
  `;
  if (!rows.length) throw unavailable();
  const link = await tx.therapistLink.findUniqueOrThrow({ where: { id: linkId }, include: participants });
  if (!canTalk(link)) throw unavailable();
  return link;
}

function toPublic(row: PrivateMessage, viewerIsPatient: boolean) {
  return {
    id: row.id,
    mine: row.sentByPatient === viewerIsPatient,
    topic: row.topic,
    body: row.body,
    createdAt: row.createdAt,
  };
}

// Prévia da última mensagem na lista de conversas (DEC-127): só dentro do app, para quem participa
// da conversa. Avisos por e-mail e push continuam neutros (regra 3).
const PREVIEW_LENGTH = 80;
function previewOf(body: string) {
  const text = body.replace(/\s+/g, ' ').trim();
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH).trimEnd()}…` : text;
}

type SeenLink = { id: string; patientId: string; patientMessagesSeenAt: Date | null; therapistMessagesSeenAt: Date | null };

// "Nova" para quem vê: chegou mensagem da outra pessoa depois do "visto" de quem vê. O "visto" da
// outra pessoa nunca entra na resposta (sem recibo de leitura, DEC-125).
async function hasUnread(link: SeenLink, viewerId: string) {
  const viewerIsPatient = link.patientId === viewerId;
  const seenAt = viewerIsPatient ? link.patientMessagesSeenAt : link.therapistMessagesSeenAt;
  const count = await prisma.privateMessage.count({
    where: { linkId: link.id, sentByPatient: !viewerIsPatient, ...(seenAt ? { createdAt: { gt: seenAt } } : {}) },
  });
  return count > 0;
}

export function createMessagesService(mailer: Mailer, pushSender: PushSender) {
  return {
    async conversations(userId: string) {
      const links = await prisma.therapistLink.findMany({
        where: activeLinks(userId),
        include: participants,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return Promise.all(links.map(async (link) => {
        const isPatient = link.patientId === userId;
        const available = canTalk(link);
        const last = available
          ? await prisma.privateMessage.findFirst({ where: { linkId: link.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
          : null;
        return {
          id: link.id,
          name: isPatient ? link.therapist.name : link.patient.name,
          counterpart: isPatient ? link.kind : 'PATIENT',
          available,
          unread: available ? await hasUnread(link, userId) : false,
          lastMessage: last
            ? { preview: previewOf(last.body), mine: last.sentByPatient === isPatient, createdAt: last.createdAt }
            : null,
        };
      }));
    },

    // Selo do menu (DEC-127): há alguma conversa com mensagem nova para quem pergunta?
    async unreadSummary(userId: string) {
      const links = await prisma.therapistLink.findMany({ where: activeLinks(userId), include: participants });
      for (const link of links) {
        if (canTalk(link) && await hasUnread(link, userId)) return { unread: true };
      }
      return { unread: false };
    },

    // Marca até que mensagem a pessoa viu a conversa. Só avança (abrir uma aba antiga não desfaz o
    // "visto") e só grava a coluna de quem pede, na linha do próprio vínculo (DEC-127).
    markSeen(userId: string, linkId: string, lastMessageId: string) {
      return prisma.$transaction(async (tx) => {
        const link = await requireConversation(tx, linkId, userId);
        const message = await tx.privateMessage.findFirst({ where: { id: lastMessageId, linkId }, select: { createdAt: true } });
        if (!message) throw new AppError(400, 'INVALID_MESSAGE', 'Atualize a conversa e tente de novo.');
        const column = link.patientId === userId ? 'patientMessagesSeenAt' : 'therapistMessagesSeenAt';
        await tx.therapistLink.updateMany({
          where: { id: linkId, OR: [{ [column]: null }, { [column]: { lt: message.createdAt } }] },
          data: { [column]: message.createdAt },
        });
      });
    },

    page(userId: string, linkId: string, before?: string) {
      return prisma.$transaction(async (tx) => {
        const link = await requireConversation(tx, linkId, userId);
        const anchor = before && await tx.privateMessage.findFirst({
          where: { id: before, linkId }, select: { id: true, createdAt: true },
        });
        if (before && !anchor) throw new AppError(400, 'INVALID_CURSOR', 'Atualize a conversa e tente de novo.');
        const rows = await tx.privateMessage.findMany({
          where: {
            linkId,
            ...(anchor ? { OR: [
              { createdAt: { lt: anchor.createdAt } },
              { createdAt: anchor.createdAt, id: { lt: anchor.id } },
            ] } : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: PAGE_SIZE + 1,
        });
        const page = rows.slice(0, PAGE_SIZE);
        return {
          messages: page.map((row) => toPublic(row, link.patientId === userId)),
          next: rows.length > PAGE_SIZE ? page.at(-1)!.id : null,
        };
      });
    },

    send(userId: string, linkId: string, input: MessageInput) {
      return prisma.$transaction(async (tx) => {
        const link = await requireConversation(tx, linkId, userId);
        const sentByPatient = link.patientId === userId;
        const row = await tx.privateMessage.create({ data: { linkId, sentByPatient, ...input } }).catch((err: unknown) => {
          // O erro renderizado pelo Prisma pode citar o texto passado na gravação.
          const { name, code } = (err ?? {}) as { name?: string; code?: string };
          logger.error({ errName: name, errCode: code }, 'Falha ao gravar mensagem privada');
          throw new AppError(500, 'MESSAGE_SAVE_FAILED', 'Não consegui enviar a mensagem. Tente de novo.');
        });
        return toPublic(row, sentByPatient);
      });
    },

    async preferences(userId: string) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId }, select: { messageEmailEnabled: true, messagePushEnabled: true },
      });
      return { email: user.messageEmailEnabled, push: user.messagePushEnabled, pushPublicKey: pushSender.publicKey };
    },

    async updatePreferences(userId: string, input: MessagePreferences) {
      await prisma.user.update({
        where: { id: userId },
        data: { messageEmailEnabled: input.email, messagePushEnabled: input.push },
      });
    },

    async notify(linkId: string, senderId: string, messageId: string) {
      const link = await prisma.therapistLink.findFirst({
        where: { id: linkId, ...activeLinks(senderId) }, include: participants,
      });
      if (!link || !canTalk(link)) return;
      const recipientId = link.patientId === senderId ? link.therapistId : link.patientId;
      const recipient = await prisma.user.findUnique({
        where: { id: recipientId },
        select: { email: true, emailConfirmedAt: true, messageEmailEnabled: true, messagePushEnabled: true },
      });
      if (!recipient) return;
      const subject = 'Você tem uma nova mensagem no Faísca';
      const body = 'Abra o Faísca para ver sua mensagem.';
      const url = new URL('/mensagens', env.FRONTEND_URL).toString();
      const emailNotice = recipient.messageEmailEnabled && recipient.emailConfirmedAt
        ? mailer.send({
            to: recipient.email, subject, text: `${body}\n${url}`,
            html: `<p>${body}</p><p><a href="${url}">Abrir o Faísca</a></p>`,
          }, { idempotencyKey: `private-message/${messageId}` }).catch(() => logger.warn('Falha ao enviar aviso de mensagem'))
        : undefined;
      const pushNotice = recipient.messagePushEnabled && pushSender.configured
        ? prisma.pushSubscription.findMany({
            where: { userId: recipientId, user: { messagePushEnabled: true } },
          }).then(async (subscriptions) => {
            if (!subscriptions.length || !await prisma.therapistLink.count({ where: { id: linkId, revokedAt: null } })) return;
            await Promise.all(subscriptions.map(async (subscription) => {
              const result = await pushSender.send(subscription, { title: subject, body, url: '/mensagens', tag: 'faisca-messages' });
              if (result === 'expired') {
                await prisma.pushSubscription.deleteMany({
                  where: { id: subscription.id, userId: recipientId, updatedAt: subscription.updatedAt },
                });
              }
            }));
          })
        : undefined;
      await Promise.all([emailNotice, pushNotice]);
    },
  };
}

export type MessagesService = ReturnType<typeof createMessagesService>;
