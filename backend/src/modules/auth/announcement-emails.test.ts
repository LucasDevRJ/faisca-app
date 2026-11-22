import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { createAnnouncementEmailsService } from './announcement-emails.service.js';

const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const EMAIL_NOVELTY = '2026-11-novidades-email';
const CAMPAIGN = {
  [EMAIL_NOVELTY]: {
    subject: 'Uma novidade importante no Faísca',
    title: 'Avisos por e-mail sobre novidades',
    summary: 'Agora você pode receber avisos breves sobre novidades importantes do Faísca.',
  },
} as const;

let mailer: FakeMailer;

beforeEach(async () => {
  await resetDatabase();
  mailer = new FakeMailer();
});

describe('avisos por e-mail de novidades (DEC-119)', () => {
  it('grava uma preferência própria, ligada por padrão, sem alterar o aviso de login', async () => {
    await createConfirmedUser({ email: PATIENT });
    const app = createApp({ mailer });
    const agent = request.agent(app);
    const login = await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD });

    expect(login.body.user).toMatchObject({ announcementEmails: true, loginAlert: true });
    expect((await agent.put('/auth/announcement-emails').send({ enabled: false })).body.user).toMatchObject({
      announcementEmails: false,
      loginAlert: true,
    });
    expect((await agent.put('/auth/announcement-emails').send({ enabled: true })).body.user.announcementEmails).toBe(true);
    expect((await request(app).put('/auth/announcement-emails').send({ enabled: false })).status).toBe(401);
    expect((await agent.put('/auth/announcement-emails').send({ enabled: false, email: 'outra@faisca.test' })).status).toBe(400);
  });

  it('envia uma vez por pessoa, usa chave estável e deixa o aviso no app', async () => {
    await createConfirmedUser({ email: PATIENT });
    const service = createAnnouncementEmailsService(mailer, CAMPAIGN, [EMAIL_NOVELTY]);
    const now = new Date(Date.now() + 30_000);

    expect(await service.runDueAnnouncementEmails(now)).toBe(1);
    expect(await service.runDueAnnouncementEmails(new Date(now.getTime() + 60_000))).toBe(0);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sendOptions[0]?.idempotencyKey).toBe(`novelty/${EMAIL_NOVELTY}/${(await prisma.user.findUniqueOrThrow({ where: { email: PATIENT } })).id}`);
    expect(mailer.sent[0]?.to).toBe(PATIENT);
    expect(mailer.sent[0]?.subject).toBe('Uma novidade importante no Faísca');
    expect(mailer.sent[0]?.text).not.toMatch(/pensamento|emoção|atividade|registro clínico|paciente/i);
    expect(await prisma.announcementEmailDelivery.count({ where: { status: 'SENT' } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: PATIENT } })).seenAnnouncement).toBeNull();
  });

  it('não envia para quem entrou depois da publicação nem para quem desativou os avisos', async () => {
    const service = createAnnouncementEmailsService(mailer, CAMPAIGN, [EMAIL_NOVELTY]);
    const publication = new Date();
    await service.runDueAnnouncementEmails(publication);

    const newAccount = await createConfirmedUser({ email: 'nova@faisca.test' });
    const optedOut = await createConfirmedUser({ email: 'desligou@faisca.test' });
    await prisma.user.update({
      where: { id: optedOut.id },
      data: { announcementEmailsEnabled: false, announcementEmailsEnabledAt: null },
    });
    await service.runDueAnnouncementEmails(new Date(publication.getTime() + 60_000));

    expect(newAccount.createdAt.getTime()).toBeGreaterThanOrEqual(publication.getTime());
    expect(mailer.sent).toHaveLength(0);
  });

  it('não publica nem enfileira campanhas sem liberação explícita', async () => {
    await createConfirmedUser({ email: PATIENT });
    const service = createAnnouncementEmailsService(mailer, CAMPAIGN);

    await service.runDueAnnouncementEmails(new Date(Date.now() + 30_000));

    expect(mailer.sent).toHaveLength(0);
    expect(await prisma.announcementRelease.count()).toBe(0);
    expect(await prisma.announcementEmailDelivery.count()).toBe(0);
  });

  it('direciona uma novidade só para profissionais ao público correspondente', async () => {
    const patient = await createConfirmedUser({ email: 'paciente2@faisca.test' });
    const therapist = await createConfirmedUser({ email: 'profissional@faisca.test', patient: false, therapist: true });
    const service = createAnnouncementEmailsService(
      mailer,
      {
        '2026-10-lido': {
          subject: 'Novidade do Faísca',
          title: 'Novidade para profissionais',
          summary: 'Uma melhoria está disponível.',
        },
      },
      ['2026-10-lido'],
    );

    await service.runDueAnnouncementEmails(new Date(Date.now() + 30_000));

    expect(mailer.sent.map((message) => message.to)).toEqual(['profissional@faisca.test']);
    expect(await prisma.announcementEmailDelivery.count({ where: { userId: patient.id } })).toBe(0);
    expect(await prisma.announcementEmailDelivery.count({ where: { userId: therapist.id } })).toBe(1);
  });

  it('retenta falhas com a mesma chave sem duplicar e mantém a novidade dentro do app', async () => {
    await createConfirmedUser({ email: PATIENT });
    const service = createAnnouncementEmailsService(mailer, CAMPAIGN, [EMAIL_NOVELTY]);
    const now = new Date(Date.now() + 30_000);
    mailer.sendError = new Error('falha fictícia');

    expect(await service.runDueAnnouncementEmails(now)).toBe(0);
    expect((await prisma.announcementEmailDelivery.findFirstOrThrow()).status).toBe('PENDING');
    mailer.sendError = null;
    expect(await service.runDueAnnouncementEmails(new Date(now.getTime() + 6 * 60_000))).toBe(1);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.attempts).toHaveLength(2);
    expect(mailer.attempts[0]?.options?.idempotencyKey).toBe(mailer.attempts[1]?.options?.idempotencyKey);
    expect(await prisma.announcementEmailDelivery.count({ where: { status: 'SENT' } })).toBe(1);
  });

  it('descarta uma entrega pendente quando a pessoa desliga os avisos após a publicação', async () => {
    const patient = await createConfirmedUser({ email: PATIENT });
    const service = createAnnouncementEmailsService(mailer, CAMPAIGN, [EMAIL_NOVELTY]);
    const now = new Date(Date.now() + 30_000);
    mailer.sendError = new Error('falha fictícia');

    await service.runDueAnnouncementEmails(now);
    await prisma.user.update({
      where: { id: patient.id },
      data: { announcementEmailsEnabled: false, announcementEmailsEnabledAt: null },
    });
    mailer.sendError = null;
    await service.runDueAnnouncementEmails(new Date(now.getTime() + 6 * 60_000));

    expect(mailer.sent).toHaveLength(0);
    expect((await prisma.announcementEmailDelivery.findFirstOrThrow()).status).toBe('SKIPPED');
  });
});
