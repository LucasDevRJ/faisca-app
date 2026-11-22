import { Prisma } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import type { Mailer } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import { announcementEmail } from './auth.emails.js';
import { announcementAudience, EMAIL_ANNOUNCEMENTS, type Announcement } from './announcements.js';

const RETRY_MS = 5 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;
// Resend mantém chaves de idempotência por 24 horas; paramos tentativas antes de esse prazo vencer.
const SAFE_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const INTERVAL_MS = 5 * 60 * 1000;
type EmailCampaign = { subject: string; title: string; summary: string };
type EmailCampaigns = Partial<Record<Announcement, EmailCampaign>>;

function roleFilter(audience: 'TODOS' | 'PACIENTE' | 'TERAPEUTA'): Prisma.UserWhereInput {
  if (audience === 'PACIENTE') return { hasPatientProfile: true };
  if (audience === 'TERAPEUTA') return { hasTherapistProfile: true };
  return { OR: [{ hasPatientProfile: true }, { hasTherapistProfile: true }] };
}

export function createAnnouncementEmailsService(
  mailer: Mailer,
  campaigns: EmailCampaigns = EMAIL_ANNOUNCEMENTS,
  releasedAnnouncements: readonly string[] = [],
) {
  async function registerPublishedAnnouncements() {
    // A lista de publicação só deve ser preenchida depois de a novidade estar disponível no front.
    // A primeira inicialização registra o horário uma vez e reinícios não criam novos envios.
    const released = new Set(releasedAnnouncements);
    await prisma.announcementRelease.createMany({
      // O banco também grava createdAt das contas; usar seu próprio relógio evita diferenças entre
      // o relógio da API e o do Postgres ao decidir quem já existia na publicação.
      data: (Object.keys(campaigns) as Announcement[]).filter((id) => released.has(id)).map((id) => ({ id })),
      skipDuplicates: true,
    });
  }

  async function queueEligibleRecipients(now: Date) {
    const definitions = Object.entries(campaigns) as [
      Announcement,
      EmailCampaign,
    ][];
    let queued = 0;

    for (const [announcementId] of definitions) {
      const release = await prisma.announcementRelease.findUnique({ where: { id: announcementId } });
      if (!release || release.publishedAt > now) continue;

      const users = await prisma.user.findMany({
        where: {
          ...roleFilter(announcementAudience(announcementId)),
          createdAt: { lt: release.publishedAt },
          emailConfirmedAt: { not: null },
          announcementEmailsEnabled: true,
          announcementEmailsEnabledAt: { lte: release.publishedAt },
        },
        select: { id: true },
      });
      if (users.length === 0) continue;

      const result = await prisma.announcementEmailDelivery.createMany({
        data: users.map((user) => ({ userId: user.id, announcementId })),
        skipDuplicates: true,
      });
      queued += result.count;
    }
    return queued;
  }

  async function sendPending(now: Date) {
    const rows = await prisma.announcementEmailDelivery.findMany({
      where: {
        OR: [
          { status: 'PENDING', nextAttemptAt: { lte: now } },
          { status: 'SENDING', lockedUntil: { lte: now } },
        ],
      },
      include: { user: true, announcement: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    let sent = 0;

    for (const row of rows) {
      if (row.firstAttemptAt && now.getTime() - row.firstAttemptAt.getTime() >= SAFE_RETRY_WINDOW_MS) {
        await prisma.announcementEmailDelivery.updateMany({
          where: { id: row.id, status: { in: ['PENDING', 'SENDING'] } },
          data: { status: 'FAILED', lockedUntil: null },
        });
        continue;
      }
      if (
        !row.user.emailConfirmedAt ||
        !row.user.announcementEmailsEnabled ||
        !row.user.announcementEmailsEnabledAt ||
        row.user.announcementEmailsEnabledAt > row.announcement.publishedAt ||
        row.user.createdAt >= row.announcement.publishedAt ||
        !isAudienceEligible(announcementAudience(row.announcementId as Announcement), row.user.hasPatientProfile, row.user.hasTherapistProfile)
      ) {
        await prisma.announcementEmailDelivery.updateMany({
          where: { id: row.id, status: { in: ['PENDING', 'SENDING'] } },
          data: { status: 'SKIPPED', lockedUntil: null },
        });
        continue;
      }

      const claimed = await prisma.announcementEmailDelivery.updateMany({
        where: {
          id: row.id,
          OR: [
            { status: 'PENDING', nextAttemptAt: { lte: now } },
            { status: 'SENDING', lockedUntil: { lte: now } },
          ],
        },
        data: {
          status: 'SENDING',
          lockedUntil: new Date(now.getTime() + LOCK_MS),
          firstAttemptAt: row.firstAttemptAt ?? now,
          attempts: { increment: 1 },
        },
      });
      if (claimed.count === 0) continue;

      // Releia depois da reserva para respeitar uma desativação ou exclusão concorrente.
      const latest = await prisma.announcementEmailDelivery.findUnique({
        where: { id: row.id },
        include: { user: true, announcement: true },
      });
      if (!latest) continue;
      if (
        !latest.user.emailConfirmedAt ||
        !latest.user.announcementEmailsEnabled ||
        !latest.user.announcementEmailsEnabledAt ||
        latest.user.announcementEmailsEnabledAt > latest.announcement.publishedAt ||
        latest.user.createdAt >= latest.announcement.publishedAt ||
        !isAudienceEligible(announcementAudience(latest.announcementId as Announcement), latest.user.hasPatientProfile, latest.user.hasTherapistProfile)
      ) {
        await prisma.announcementEmailDelivery.update({
          where: { id: row.id },
          data: { status: 'SKIPPED', lockedUntil: null },
        });
        continue;
      }

      const campaign = campaigns[latest.announcementId as keyof typeof campaigns];
      if (!campaign) {
        await prisma.announcementEmailDelivery.update({
          where: { id: row.id },
          data: { status: 'SKIPPED', lockedUntil: null },
        });
        continue;
      }

      const attempts = row.attempts + 1;
      const firstAttemptAt = row.firstAttemptAt ?? now;
      try {
        await mailer.send(
          announcementEmail(latest.user.email, campaign.subject, campaign.title, campaign.summary),
          { idempotencyKey: `novelty/${latest.announcementId}/${latest.userId}` },
        );
        await prisma.announcementEmailDelivery.update({
          where: { id: row.id },
          data: { status: 'SENT', sentAt: now, lockedUntil: null },
        });
        sent++;
      } catch (error) {
        const expiredRetryWindow = now.getTime() - firstAttemptAt.getTime() >= SAFE_RETRY_WINDOW_MS;
        const status = attempts >= MAX_ATTEMPTS || expiredRetryWindow ? 'FAILED' : 'PENDING';
        await prisma.announcementEmailDelivery.update({
          where: { id: row.id },
          data: {
            status,
            lockedUntil: null,
            nextAttemptAt: new Date(now.getTime() + RETRY_MS),
          },
        });
        const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
        logger.error(
          { announcementId: latest.announcementId, userId: latest.userId, errName: name, errCode: code },
          'Falha ao enviar aviso de novidade por e-mail',
        );
      }
    }
    return sent;
  }

  return {
    async runDueAnnouncementEmails(now = new Date()) {
      await registerPublishedAnnouncements();
      await queueEligibleRecipients(now);
      return sendPending(now);
    },
  };
}

export type AnnouncementEmailsService = ReturnType<typeof createAnnouncementEmailsService>;

export function scheduleAnnouncementEmailsJob(service: AnnouncementEmailsService): () => void {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    service
      .runDueAnnouncementEmails()
      .catch((err: unknown) => {
        logger.error({ errName: (err as { name?: unknown })?.name }, 'Falha no agendador de novidades por e-mail');
      })
      .finally(() => {
        running = false;
      });
  };
  run();
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

function isAudienceEligible(audience: 'TODOS' | 'PACIENTE' | 'TERAPEUTA', patient: boolean, therapist: boolean): boolean {
  if (audience === 'PACIENTE') return patient;
  if (audience === 'TERAPEUTA') return therapist;
  return patient || therapist;
}
