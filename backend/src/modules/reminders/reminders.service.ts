import { Prisma, type ReminderChannel, type ReminderSettings, type ReminderType } from '../../generated/prisma/client.js';
import { AppError } from '../../errors/app-error.js';
import {
  addDays,
  dateOnlyToDate,
  dateToDateOnly,
  dateToTimeOnly,
  nowTimeInAppZone,
  startOfDayInAppZone,
  timeOnlyToDate,
  todayInAppZone,
} from '../../lib/dates.js';
import { logger } from '../../lib/logger.js';
import type { Mailer } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import { isAllowedPushEndpoint, isValidPushKeys, type PushSender } from '../../lib/web-push.js';
import { reminderEmail, reminderPushMessage } from './reminders.emails.js';
import type { PushSubscriptionInput, UpdateRemindersInput } from './reminders.schema.js';

export const DEFAULT_REMINDER_SETTINGS = {
  channel: 'EMAIL' as ReminderChannel,
  morningEnabled: false,
  morningTime: '08:00',
  eveningEnabled: false,
  eveningTime: '20:00',
  quietHoursEnabled: true,
  quietStart: '22:00',
  quietEnd: '07:00',
};

const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;
const MAX_PAUSE_DAYS_AHEAD = 365;
const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000;

export type PublicReminderSettings = {
  channel: ReminderChannel;
  morningEnabled: boolean;
  morningTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  pausedUntil: string | null;
  lastFallbackAt: string | null;
};

export type PublicRemindersStatus = {
  settings: PublicReminderSettings;
  push: {
    configured: boolean;
    vapidPublicKey: string | null;
    hasSubscription: boolean;
    subscriptionCount: number;
  };
};

// Verifica se um horário 'HH:MM' cai dentro da janela [quietStart, quietEnd).
// Funciona tanto para janela que atravessa a meia-noite (ex.: 22:00 às 07:00) quanto no mesmo dia.
export function isInQuietHours(time: string, quietStart: string, quietEnd: string): boolean {
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) {
    return time >= quietStart && time < quietEnd;
  }
  return time >= quietStart || time < quietEnd;
}

function toPublicSettings(row: ReminderSettings | null, today: string): PublicReminderSettings {
  if (!row) {
    return {
      ...DEFAULT_REMINDER_SETTINGS,
      pausedUntil: null,
      lastFallbackAt: null,
    };
  }
  const pausedUntil = row.pausedUntil ? dateToDateOnly(row.pausedUntil) : null;
  return {
    channel: row.channel,
    morningEnabled: row.morningEnabled,
    morningTime: dateToTimeOnly(row.morningTime),
    eveningEnabled: row.eveningEnabled,
    eveningTime: dateToTimeOnly(row.eveningTime),
    quietHoursEnabled: row.quietHoursEnabled,
    quietStart: dateToTimeOnly(row.quietStart),
    quietEnd: dateToTimeOnly(row.quietEnd),
    // Se a data da pausa já passou, os lembretes já voltaram sozinhos.
    pausedUntil: pausedUntil && pausedUntil >= today ? pausedUntil : null,
    lastFallbackAt: row.lastFallbackAt ? row.lastFallbackAt.toISOString() : null,
  };
}

export function createRemindersService(mailer: Mailer, pushSender: PushSender) {
  async function getStatus(userId: string, now = new Date()): Promise<PublicRemindersStatus> {
    const today = todayInAppZone(now);
    const [row, subscriptionCount] = await Promise.all([
      prisma.reminderSettings.findUnique({ where: { userId } }),
      prisma.pushSubscription.count({ where: { userId } }),
    ]);

    return {
      settings: toPublicSettings(row, today),
      push: {
        configured: pushSender.configured,
        vapidPublicKey: pushSender.publicKey,
        hasSubscription: subscriptionCount > 0,
        subscriptionCount,
      },
    };
  }

  // Confere se há atividade ou ação que justifique o lembrete na data de referência (SPEC, DEC-089).
  async function hasPendingItemsForReminder(
    userId: string,
    type: ReminderType,
    referenceDateStr: string,
  ): Promise<boolean> {
    const refDate = dateOnlyToDate(referenceDateStr);
    if (type === 'MANHA') {
      const [activityCount, actionCount] = await Promise.all([
        prisma.activity.count({
          where: { userId, status: 'PLANEJADA', activityDate: refDate },
        }),
        prisma.behavioralAction.count({
          where: { userId, status: 'PLANEJADA', actionDate: refDate },
        }),
      ]);
      return activityCount + actionCount > 0;
    }

    const [activityCount, actionCount] = await Promise.all([
      prisma.activity.count({
        where: {
          userId,
          status: { in: ['PLANEJADA', 'PENDENTE'] },
          activityDate: { lte: refDate },
        },
      }),
      prisma.behavioralAction.count({
        where: {
          userId,
          status: 'PLANEJADA',
          actionDate: { lte: refDate },
        },
      }),
    ]);
    return activityCount + actionCount > 0;
  }

  // Envia um lembrete garantindo idempotência via NotificationLog (DEC-006).
  // Se o canal escolhido for PUSH e todas as inscrições falharem ou não houver nenhuma, cai
  // automaticamente para EMAIL e grava lastFallbackAt (DEC-089, issue #82).
  async function dispatchReminder(
    user: { id: string; name: string; email: string; directLanguage: boolean },
    settings: ReminderSettings,
    type: ReminderType,
    referenceDateStr: string,
    now: Date,
  ): Promise<boolean> {
    const referenceDate = dateOnlyToDate(referenceDateStr);

    const existingLog = await prisma.notificationLog.findUnique({
      where: {
        userId_type_referenceDate: {
          userId: user.id,
          type,
          referenceDate,
        },
      },
    });
    if (existingLog) return false;

    if (!(await hasPendingItemsForReminder(user.id, type, referenceDateStr))) {
      return false;
    }

    // Reserva o envio no NotificationLog antes de chamar a rede, para duas execuções concorrentes
    // nunca mandarem duplicado. Se o envio falhar por completo, apaga o registro para tentar de novo.
    let logId: string;
    try {
      const created = await prisma.notificationLog.create({
        data: {
          userId: user.id,
          type,
          referenceDate,
          channelUsed: settings.channel,
        },
      });
      logId = created.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return false;
      }
      throw err;
    }

    let channelUsed: ReminderChannel = settings.channel;
    let fallbackFromPush = false;

    try {
      if (settings.channel === 'PUSH') {
        const subscriptions = await prisma.pushSubscription.findMany({
          where: { userId: user.id },
        });
        let anyPushSent = false;
        const expiredIds: string[] = [];

        if (pushSender.configured && subscriptions.length > 0) {
          const message = reminderPushMessage(type, user.directLanguage);
          const results = await Promise.all(
            subscriptions.map(async (sub) => ({
              id: sub.id,
              result: await pushSender.send(
                { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
                message,
              ),
            })),
          );
          for (const { id, result } of results) {
            if (result === 'sent') {
              anyPushSent = true;
            } else if (result === 'expired') {
              expiredIds.push(id);
            }
          }
        }

        if (expiredIds.length > 0) {
          await prisma.pushSubscription.deleteMany({
            where: { id: { in: expiredIds }, userId: user.id },
          });
        }

        if (!anyPushSent) {
          // Queda automática para e-mail (DEC-089, issue #82).
          channelUsed = 'EMAIL';
          fallbackFromPush = true;
        }
      }

      if (channelUsed === 'EMAIL') {
        await mailer.send(
          reminderEmail(user.email, user.name, type, {
            directLanguage: user.directLanguage,
            fallbackFromPush,
          }),
        );
      }

      if (fallbackFromPush) {
        await prisma.$transaction([
          prisma.notificationLog.update({
            where: { id: logId },
            data: { channelUsed: 'EMAIL' },
          }),
          prisma.reminderSettings.updateMany({
            where: { userId: user.id },
            data: { lastFallbackAt: now },
          }),
        ]);
      }

      // Regra 7: log só com identificadores e tipo, nunca e-mail, nome ou conteúdo.
      logger.info(
        { userId: user.id, type, channelUsed, fallbackFromPush },
        'Lembrete enviado',
      );
      return true;
    } catch (err) {
      await prisma.notificationLog.deleteMany({ where: { id: logId } });
      logger.error({ err, userId: user.id, type }, 'Falha ao enviar lembrete');
      return false;
    }
  }

  return {
    get: getStatus,

    async update(userId: string, input: UpdateRemindersInput, now = new Date()): Promise<PublicRemindersStatus> {
      if (input.channel === 'PUSH') {
        if (!pushSender.configured) {
          throw new AppError(
            400,
            'PUSH_NOT_CONFIGURED',
            'As notificações no aparelho ainda não estão disponíveis neste servidor. Escolha o envio por e-mail.',
          );
        }
        const count = await prisma.pushSubscription.count({ where: { userId } });
        if (count === 0) {
          throw new AppError(
            400,
            'PUSH_SUBSCRIPTION_REQUIRED',
            'Ative as notificações neste aparelho antes de escolher receber por notificação.',
          );
        }
      }

      const data = {
        channel: input.channel,
        morningEnabled: input.morningEnabled,
        morningTime: timeOnlyToDate(input.morningTime),
        eveningEnabled: input.eveningEnabled,
        eveningTime: timeOnlyToDate(input.eveningTime),
        quietHoursEnabled: input.quietHoursEnabled,
        quietStart: timeOnlyToDate(input.quietStart),
        quietEnd: timeOnlyToDate(input.quietEnd),
        lastFallbackAt: null,
      };

      await prisma.reminderSettings.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });

      return getStatus(userId, now);
    },

    async pause(userId: string, until: string, now = new Date()): Promise<PublicRemindersStatus> {
      const today = todayInAppZone(now);
      const maxDate = addDays(today, MAX_PAUSE_DAYS_AHEAD);
      if (until < today || until > maxDate) {
        throw new AppError(
          400,
          'DATE_OUT_OF_RANGE',
          'Escolha uma data de hoje até um ano à frente para pausar os lembretes.',
        );
      }

      const pausedUntil = dateOnlyToDate(until);
      await prisma.reminderSettings.upsert({
        where: { userId },
        create: {
          userId,
          channel: DEFAULT_REMINDER_SETTINGS.channel,
          morningEnabled: DEFAULT_REMINDER_SETTINGS.morningEnabled,
          morningTime: timeOnlyToDate(DEFAULT_REMINDER_SETTINGS.morningTime),
          eveningEnabled: DEFAULT_REMINDER_SETTINGS.eveningEnabled,
          eveningTime: timeOnlyToDate(DEFAULT_REMINDER_SETTINGS.eveningTime),
          quietHoursEnabled: DEFAULT_REMINDER_SETTINGS.quietHoursEnabled,
          quietStart: timeOnlyToDate(DEFAULT_REMINDER_SETTINGS.quietStart),
          quietEnd: timeOnlyToDate(DEFAULT_REMINDER_SETTINGS.quietEnd),
          pausedUntil,
        },
        update: { pausedUntil },
      });

      return getStatus(userId, now);
    },

    async resume(userId: string, now = new Date()): Promise<PublicRemindersStatus> {
      await prisma.reminderSettings.updateMany({
        where: { userId },
        data: { pausedUntil: null },
      });
      return getStatus(userId, now);
    },

    async savePushSubscription(
      userId: string,
      sessionId: string | undefined,
      input: PushSubscriptionInput,
      now = new Date(),
    ): Promise<PublicRemindersStatus> {
      if (!isAllowedPushEndpoint(input.endpoint)) {
        throw new AppError(
          400,
          'INVALID_PUSH_ENDPOINT',
          'Endereço de notificação do navegador inválido ou não suportado.',
        );
      }
      if (!isValidPushKeys(input.keys.p256dh, input.keys.auth)) {
        throw new AppError(
          400,
          'INVALID_PUSH_KEYS',
          'Chaves de criptografia da notificação inválidas.',
        );
      }

      try {
        await prisma.$transaction(async (tx) => {
          // Trava a conta para serializar envios simultâneos da mesma pessoa e respeitar o limite de 10.
          await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
          const existing = await tx.pushSubscription.findUnique({
            where: { endpoint: input.endpoint },
          });
          if (existing && existing.userId !== userId) {
            throw new AppError(403, 'FORBIDDEN', 'Você não tem permissão para alterar este recurso.');
          }

          if (existing) {
            await tx.pushSubscription.updateMany({
              where: { id: existing.id, userId },
              data: {
                sessionId: sessionId ?? null,
                p256dh: input.keys.p256dh,
                auth: input.keys.auth,
              },
            });
          } else {
            const current = await tx.pushSubscription.findMany({
              where: { userId },
              orderBy: { createdAt: 'asc' },
              select: { id: true },
            });
            if (current.length >= MAX_PUSH_SUBSCRIPTIONS_PER_USER) {
              const toRemove = current
                .slice(0, current.length - MAX_PUSH_SUBSCRIPTIONS_PER_USER + 1)
                .map((item) => item.id);
              await tx.pushSubscription.deleteMany({ where: { id: { in: toRemove }, userId } });
            }
            await tx.pushSubscription.create({
              data: {
                userId,
                sessionId: sessionId ?? null,
                endpoint: input.endpoint,
                p256dh: input.keys.p256dh,
                auth: input.keys.auth,
              },
            });
          }

          await tx.reminderSettings.updateMany({
            where: { userId },
            data: { lastFallbackAt: null },
          });
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const owner = await prisma.pushSubscription.findUnique({
            where: { endpoint: input.endpoint },
            select: { userId: true },
          });
          if (owner && owner.userId !== userId) {
            throw new AppError(403, 'FORBIDDEN', 'Você não tem permissão para alterar este recurso.');
          }
          await prisma.pushSubscription.updateMany({
            where: { endpoint: input.endpoint, userId },
            data: {
              sessionId: sessionId ?? null,
              p256dh: input.keys.p256dh,
              auth: input.keys.auth,
            },
          });
        } else {
          throw err;
        }
      }

      return getStatus(userId, now);
    },

    async deletePushSubscription(userId: string, endpoint: string): Promise<void> {
      const existing = await prisma.pushSubscription.findUnique({
        where: { endpoint },
        select: { id: true, userId: true },
      });
      if (!existing) return;
      if (existing.userId !== userId) {
        throw new AppError(403, 'FORBIDDEN', 'Você não tem permissão para alterar este recurso.');
      }
      await prisma.pushSubscription.deleteMany({ where: { id: existing.id, userId } });
    },

    // Roda a cada 5 minutos (DEC-006, DEC-089) e avalia os lembretes pendentes no fuso America/Sao_Paulo.
    async runDueReminders(now = new Date()): Promise<number> {
      const today = todayInAppZone(now);
      const yesterday = addDays(today, -1);
      const startOfToday = startOfDayInAppZone(today);
      const nowTime = nowTimeInAppZone(now);

      const activeSettings = await prisma.reminderSettings.findMany({
        where: {
          OR: [{ morningEnabled: true }, { eveningEnabled: true }],
          user: {
            hasPatientProfile: true,
            emailConfirmedAt: { not: null },
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              directLanguage: true,
            },
          },
        },
      });

      let sentCount = 0;

      for (const row of activeSettings) {
        if (row.pausedUntil && dateToDateOnly(row.pausedUntil) >= today) {
          continue;
        }

        const quietStart = dateToTimeOnly(row.quietStart);
        const quietEnd = dateToTimeOnly(row.quietEnd);
        if (row.quietHoursEnabled && isInQuietHours(nowTime, quietStart, quietEnd)) {
          continue;
        }

        const morningTime = dateToTimeOnly(row.morningTime);
        const eveningTime = dateToTimeOnly(row.eveningTime);
        const overnightQuiet = row.quietHoursEnabled && quietStart > quietEnd;

        // Se o horário escolhido caía na parte noturna do silêncio (ex.: 22:30 com silêncio das
        // 22:00 às 07:00), o lembrete de ontem ficou retido à noite e sai hoje no fim do silêncio.
        if (overnightQuiet && row.createdAt < startOfToday) {
          if (row.morningEnabled && morningTime >= quietStart && nowTime >= quietEnd) {
            if (await dispatchReminder(row.user, row, 'MANHA', yesterday, now)) sentCount++;
          }
          if (row.eveningEnabled && eveningTime >= quietStart && nowTime >= quietEnd) {
            if (await dispatchReminder(row.user, row, 'NOITE', yesterday, now)) sentCount++;
          }
        }

        if (row.morningEnabled && nowTime >= morningTime) {
          if (await dispatchReminder(row.user, row, 'MANHA', today, now)) sentCount++;
        }
        if (row.eveningEnabled && nowTime >= eveningTime) {
          if (await dispatchReminder(row.user, row, 'NOITE', today, now)) sentCount++;
        }
      }

      return sentCount;
    },
  };
}

export type RemindersService = ReturnType<typeof createRemindersService>;

export function scheduleRemindersJob(service: RemindersService): () => void {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    service
      .runDueReminders()
      .catch((err: unknown) => {
        logger.error({ err }, 'Falha na execução do agendador de lembretes');
      })
      .finally(() => {
        running = false;
      });
  };
  run();
  const timer = setInterval(run, SCHEDULER_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
