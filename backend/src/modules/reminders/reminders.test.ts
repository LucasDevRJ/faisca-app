import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { dateOnlyToDate, timeOnlyToDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { generateVapidKeys } from '../../lib/web-push.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { FakePushSender } from '../../test/fake-push-sender.js';
import { createRemindersService } from './reminders.service.js';

// Lembretes do paciente (SPEC, "Lembretes"; DEC-089, issue #32). Dados fictícios (regra 5).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';

const clientKeys = generateVapidKeys();
const validSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/inscr-ficticia-1',
  keys: {
    p256dh: clientKeys.publicKey,
    auth: Buffer.alloc(16, 9).toString('base64url'),
  },
};

const validSettings = {
  channel: 'EMAIL' as const,
  morningEnabled: true,
  morningTime: '08:15',
  eveningEnabled: true,
  eveningTime: '20:30',
  quietHoursEnabled: true,
  quietStart: '22:00',
  quietEnd: '07:00',
};

let mailer: FakeMailer;
let pushSender: FakePushSender;
let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;

beforeEach(async () => {
  await resetDatabase();
  mailer = new FakeMailer();
  pushSender = new FakePushSender();
  app = createApp({ mailer, pushSender });
  patientId = (await createConfirmedUser({ email: PATIENT, name: 'Paula Fictícia' })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT, name: 'Outra Fictícia' })).id;
  await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true });
});

async function loginAgent(email: string, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}

describe('configuração, pausa e inscrições de Web Push', () => {
  it('começa com os valores padrão desligados, salva e devolve a configuração', async () => {
    const agent = await loginAgent(PATIENT);

    const initial = await agent.get('/reminders');
    expect(initial.status).toBe(200);
    expect(initial.body).toEqual({
      settings: {
        channel: 'EMAIL',
        morningEnabled: false,
        morningTime: '08:00',
        eveningEnabled: false,
        eveningTime: '20:00',
        quietHoursEnabled: true,
        quietStart: '22:00',
        quietEnd: '07:00',
        pausedUntil: null,
        lastFallbackAt: null,
      },
      push: {
        configured: true,
        vapidPublicKey: expect.any(String),
        hasSubscription: false,
        subscriptionCount: 0,
      },
    });

    const updated = await agent.put('/reminders').send(validSettings);
    expect(updated.status).toBe(200);
    expect(updated.body.settings).toEqual({
      ...validSettings,
      pausedUntil: null,
      lastFallbackAt: null,
    });
  });

  it('valida intervalos de 15 minutos e início != fim do silêncio no Zod e no CHECK do banco', async () => {
    const agent = await loginAgent(PATIENT);

    expect((await agent.put('/reminders').send({ ...validSettings, morningTime: '08:10' })).status).toBe(400);
    expect((await agent.put('/reminders').send({ ...validSettings, eveningTime: '24:00' })).status).toBe(400);
    expect(
      (await agent.put('/reminders').send({ ...validSettings, quietStart: '22:00', quietEnd: '22:00' })).status,
    ).toBe(400);

    await agent.put('/reminders').send(validSettings);
    await expect(
      prisma.reminderSettings.update({
        where: { userId: patientId },
        data: { morningTime: timeOnlyToDate('08:05') },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.reminderSettings.update({
        where: { userId: patientId },
        data: { quietStart: timeOnlyToDate('22:00'), quietEnd: timeOnlyToDate('22:00') },
      }),
    ).rejects.toThrow();
  });

  it('exige inscrição ativa no aparelho antes de escolher o canal PUSH', async () => {
    const agent = await loginAgent(PATIENT);

    const withoutSub = await agent.put('/reminders').send({ ...validSettings, channel: 'PUSH' });
    expect(withoutSub.status).toBe(400);
    expect(withoutSub.body.error.code).toBe('PUSH_SUBSCRIPTION_REQUIRED');

    const subRes = await agent.post('/reminders/push-subscriptions').send(validSubscription);
    expect(subRes.status).toBe(200);
    expect(subRes.body.push.hasSubscription).toBe(true);
    expect(subRes.body.push.subscriptionCount).toBe(1);

    const withSub = await agent.put('/reminders').send({ ...validSettings, channel: 'PUSH' });
    expect(withSub.status).toBe(200);
    expect(withSub.body.settings.channel).toBe('PUSH');

    const delRes = await agent
      .delete('/reminders/push-subscriptions')
      .send({ endpoint: validSubscription.endpoint });
    expect(delRes.status).toBe(204);
    expect((await agent.get('/reminders')).body.push.hasSubscription).toBe(false);
  });

  it('suporta chamadas simultâneas de inscrição e remoção do mesmo endpoint sem erro 500', async () => {
    const agent = await loginAgent(PATIENT);

    const [postA, postB] = await Promise.all([
      agent.post('/reminders/push-subscriptions').send(validSubscription),
      agent.post('/reminders/push-subscriptions').send(validSubscription),
    ]);
    expect(postA.status).toBe(200);
    expect(postB.status).toBe(200);
    expect(await prisma.pushSubscription.count({ where: { userId: patientId } })).toBe(1);

    const [delA, delB] = await Promise.all([
      agent.delete('/reminders/push-subscriptions').send({ endpoint: validSubscription.endpoint }),
      agent.delete('/reminders/push-subscriptions').send({ endpoint: validSubscription.endpoint }),
    ]);
    expect(delA.status).toBe(204);
    expect(delB.status).toBe(204);
    expect(await prisma.pushSubscription.count({ where: { userId: patientId } })).toBe(0);
  });

  it('barra endpoints de Web Push inválidos ou SSRF e chaves fora da curva P-256', async () => {
    const agent = await loginAgent(PATIENT);

    const ssrf = await agent.post('/reminders/push-subscriptions').send({
      ...validSubscription,
      endpoint: 'https://localhost:3333/internal',
    });
    expect(ssrf.status).toBe(400);
    expect(ssrf.body.error.code).toBe('INVALID_PUSH_ENDPOINT');

    const badKeys = await agent.post('/reminders/push-subscriptions').send({
      ...validSubscription,
      keys: {
        p256dh: 'A'.repeat(87),
        auth: validSubscription.keys.auth,
      },
    });
    expect(badKeys.status).toBe(400);
    expect(badKeys.body.error.code).toBe('INVALID_PUSH_KEYS');

    // CHECK do banco para protocolo https://
    await expect(
      prisma.pushSubscription.create({
        data: {
          userId: patientId,
          endpoint: 'http://fcm.googleapis.com/fcm/send/inseguro',
          p256dh: validSubscription.keys.p256dh,
          auth: validSubscription.keys.auth,
        },
      }),
    ).rejects.toThrow();
  });

  it('pausa lembretes até uma data válida e permite retomar a qualquer momento', async () => {
    const agent = await loginAgent(PATIENT);

    const past = await agent.post('/reminders/pause').send({ until: '2020-01-01' });
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe('DATE_OUT_OF_RANGE');

    const paused = await agent.post('/reminders/pause').send({ until: '2026-12-01' });
    expect(paused.status).toBe(200);
    expect(paused.body.settings.pausedUntil).toBe('2026-12-01');

    const resumed = await agent.delete('/reminders/pause');
    expect(resumed.status).toBe(200);
    expect(resumed.body.settings.pausedUntil).toBeNull();
  });

  it('integra com logout, troca de senha e sair de todos os aparelhos (DEC-085, DEC-089)', async () => {
    const deviceA = await loginAgent(PATIENT);
    const deviceB = await loginAgent(PATIENT);
    const deviceC = await loginAgent(PATIENT);

    await deviceA.post('/reminders/push-subscriptions').send({
      ...validSubscription,
      endpoint: 'https://fcm.googleapis.com/fcm/send/aparelho-a',
    });
    await deviceB.post('/reminders/push-subscriptions').send({
      ...validSubscription,
      endpoint: 'https://fcm.googleapis.com/fcm/send/aparelho-b',
    });
    await deviceC.post('/reminders/push-subscriptions').send({
      ...validSubscription,
      endpoint: 'https://fcm.googleapis.com/fcm/send/aparelho-c',
    });
    expect(await prisma.pushSubscription.count({ where: { userId: patientId } })).toBe(3);

    // 1. Sair apenas no aparelho C remove só a inscrição da sessão C:
    expect((await deviceC.post('/auth/logout')).status).toBe(204);
    const afterSingleLogout = await prisma.pushSubscription.findMany({ where: { userId: patientId } });
    expect(afterSingleLogout.map((s) => s.endpoint).sort()).toEqual([
      'https://fcm.googleapis.com/fcm/send/aparelho-a',
      'https://fcm.googleapis.com/fcm/send/aparelho-b',
    ]);

    // 2. Trocar senha no aparelho A derruba a inscrição do aparelho B e mantém a do aparelho A:
    const newPassword = 'nova-senha-ficticia-456';
    const changeRes = await deviceA
      .post('/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword });
    expect(changeRes.status).toBe(204);

    const afterPasswordChange = await prisma.pushSubscription.findMany({ where: { userId: patientId } });
    expect(afterPasswordChange.map((s) => s.endpoint)).toEqual([
      'https://fcm.googleapis.com/fcm/send/aparelho-a',
    ]);

    // 3. Sair de todos os aparelhos apaga todas as inscrições restantes:
    expect((await deviceA.post('/auth/logout-all').send({ password: newPassword })).status).toBe(204);
    expect(await prisma.pushSubscription.count({ where: { userId: patientId } })).toBe(0);
  });
});

describe('agendador de lembretes, idempotência, horário de silêncio e regra 3 (neutralidade)', () => {
  it('dispara manhã só com item PLANEJADO hoje e noite com item PLANEJADO/PENDENTE até hoje, com idempotência', async () => {
    const service = createRemindersService(mailer, pushSender);
    await service.update(patientId, {
      ...validSettings,
      morningTime: '08:00',
      eveningTime: '20:00',
    });

    // 10/11/2026 às 08:05 em São Paulo (11:05 UTC), sem nenhuma atividade ou ação: não envia nada.
    const morningNow = new Date('2026-11-10T11:05:00.000Z');
    expect(await service.runDueReminders(morningNow)).toBe(0);
    expect(mailer.sent).toHaveLength(0);

    // Cria atividade PLANEJADA para hoje com nome e observação sensíveis (nunca podem ir no lembrete!):
    await prisma.activity.create({
      data: {
        userId: patientId,
        name: 'SegredoClinicoDaAtividade',
        activityDate: dateOnlyToDate('2026-11-10'),
        status: 'PLANEJADA',
      },
    });

    // Agora envia o lembrete da manhã uma única vez (idempotência via NotificationLog, DEC-006):
    expect(await service.runDueReminders(morningNow)).toBe(1);
    expect(await service.runDueReminders(morningNow)).toBe(0);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.subject).toBe('Seu lembrete da manhã no Faísca');
    expect(mailer.sent[0]?.text).not.toContain('SegredoClinicoDaAtividade');
    expect(mailer.sent[0]?.html).not.toContain('SegredoClinicoDaAtividade');

    // À noite (20:05 em São Paulo = 23:05 UTC): atividade passou a PENDENTE, então envia o da noite:
    await prisma.activity.updateMany({
      where: { userId: patientId },
      data: { status: 'PENDENTE', wantBefore: 7 },
    });
    const eveningNow = new Date('2026-11-10T23:05:00.000Z');
    expect(await service.runDueReminders(eveningNow)).toBe(1);
    expect(await service.runDueReminders(eveningNow)).toBe(0);
    expect(mailer.sent).toHaveLength(2);
    expect(mailer.sent[1]?.subject).toBe('Seu lembrete da noite no Faísca');
    expect(mailer.sent[1]?.text).not.toContain('SegredoClinicoDaAtividade');
    expect(mailer.sent[1]?.html).not.toContain('SegredoClinicoDaAtividade');
  });

  it('também dispara quando há Ação PLANEJADA e respeita pausa e linguagem direta', async () => {
    const service = createRemindersService(mailer, pushSender);
    await prisma.user.update({ where: { id: patientId }, data: { directLanguage: true } });
    await service.update(patientId, {
      ...validSettings,
      morningTime: '08:00',
      eveningEnabled: false,
    });

    await prisma.behavioralAction.create({
      data: {
        userId: patientId,
        name: 'AcaoSecretaDeConexao',
        category: 'CONEXAO',
        status: 'PLANEJADA',
        actionDate: dateOnlyToDate('2026-11-10'),
        expectation: 6,
      },
    });

    // Enquanto pausado até 2026-11-10, não dispara:
    await service.pause(patientId, '2026-11-10', new Date('2026-11-10T10:00:00.000Z'));
    expect(await service.runDueReminders(new Date('2026-11-10T11:05:00.000Z'))).toBe(0);

    // Retoma e dispara com texto de Linguagem direta, sem o nome da ação:
    await service.resume(patientId, new Date('2026-11-10T11:05:00.000Z'));
    expect(await service.runDueReminders(new Date('2026-11-10T11:05:00.000Z'))).toBe(1);
    expect(mailer.sent[0]?.text).toContain('Há itens planejados para hoje no Faísca.');
    expect(mailer.sent[0]?.text).not.toContain('AcaoSecretaDeConexao');
  });

  it('respeita o horário de silêncio: retém na madrugada/noite e libera no fim do silêncio', async () => {
    const service = createRemindersService(mailer, pushSender);
    await service.update(
      patientId,
      {
        ...validSettings,
        morningEnabled: true,
        morningTime: '06:30',
        eveningEnabled: true,
        eveningTime: '22:30',
        quietHoursEnabled: true,
        quietStart: '22:00',
        quietEnd: '07:00',
      },
      new Date('2026-11-09T12:00:00.000Z'),
    );
    await prisma.reminderSettings.update({
      where: { userId: patientId },
      data: { createdAt: new Date('2026-11-09T12:00:00.000Z') },
    });

    await prisma.activity.createMany({
      data: [
        {
          userId: patientId,
          name: 'Atividade de ontem',
          activityDate: dateOnlyToDate('2026-11-09'),
          status: 'PENDENTE',
          wantBefore: 5,
        },
        {
          userId: patientId,
          name: 'Atividade de hoje',
          activityDate: dateOnlyToDate('2026-11-10'),
          status: 'PLANEJADA',
        },
      ],
    });

    // 1. 09/11 às 22:35 em São Paulo (10/11 01:35 UTC): dentro do silêncio (22:00–07:00) → não envia.
    expect(await service.runDueReminders(new Date('2026-11-10T01:35:00.000Z'))).toBe(0);

    // 2. 10/11 às 06:35 em São Paulo (09:35 UTC): ainda dentro do silêncio → não envia.
    expect(await service.runDueReminders(new Date('2026-11-10T09:35:00.000Z'))).toBe(0);

    // 3. 10/11 às 07:00 em São Paulo (10:00 UTC): fim do silêncio! Libera o da noite de ontem (22:30)
    // e o da manhã de hoje (06:30), sem disparar o da noite de hoje antes das 22:30.
    expect(await service.runDueReminders(new Date('2026-11-10T10:00:00.000Z'))).toBe(2);
    expect(mailer.sent.map((m) => m.subject).sort()).toEqual([
      'Seu lembrete da manhã no Faísca',
      'Seu lembrete da noite no Faísca',
    ]);
  });

  it('envia por Web Push, remove inscrição expirada (410) e cai para e-mail quando o push falha', async () => {
    const service = createRemindersService(mailer, pushSender);
    const expiredSub = 'https://fcm.googleapis.com/fcm/send/expirado';
    const activeSub = 'https://fcm.googleapis.com/fcm/send/ativo';

    await service.savePushSubscription(patientId, 'sess-1', {
      ...validSubscription,
      endpoint: expiredSub,
    });
    await service.savePushSubscription(patientId, 'sess-2', {
      ...validSubscription,
      endpoint: activeSub,
    });
    await service.update(patientId, {
      ...validSettings,
      channel: 'PUSH',
      morningEnabled: true,
      morningTime: '08:00',
      eveningEnabled: true,
      eveningTime: '20:00',
    });

    await prisma.activity.create({
      data: {
        userId: patientId,
        name: 'NomeQueNuncaSaiNoPush',
        activityDate: dateOnlyToDate('2026-11-10'),
        status: 'PLANEJADA',
      },
    });

    // De manhã: um aparelho responde 410 (expirado) e o outro recebe o push com sucesso:
    pushSender.setOutcomeForEndpoint(expiredSub, 'expired');
    pushSender.setOutcomeForEndpoint(activeSub, 'sent');
    expect(await service.runDueReminders(new Date('2026-11-10T11:05:00.000Z'))).toBe(1);
    expect(pushSender.sent).toHaveLength(1);
    expect(pushSender.sent[0]?.message.body).not.toContain('NomeQueNuncaSaiNoPush');
    expect(mailer.sent).toHaveLength(0);
    // O aparelho expirado foi apagado:
    expect(await prisma.pushSubscription.count({ where: { endpoint: expiredSub } })).toBe(0);

    // À noite: o único aparelho restante também expira → cai automaticamente para e-mail e grava lastFallbackAt:
    pushSender.setOutcomeForEndpoint(activeSub, 'expired');
    const eveningNow = new Date('2026-11-10T23:05:00.000Z');
    expect(await service.runDueReminders(eveningNow)).toBe(1);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.text).toContain('Não conseguimos entregar a notificação no seu aparelho');
    expect(mailer.sent[0]?.text).not.toContain('NomeQueNuncaSaiNoPush');

    const status = await service.get(patientId, eveningNow);
    expect(status.settings.lastFallbackAt).toBe(eveningNow.toISOString());
    expect(status.push.hasSubscription).toBe(false);
  });
});

describe('autorização (regra 1)', () => {
  it('sem sessão: 401 em todas as rotas de lembretes', async () => {
    expect((await request(app).get('/reminders')).status).toBe(401);
    expect((await request(app).put('/reminders').send(validSettings)).status).toBe(401);
    expect((await request(app).post('/reminders/pause').send({ until: '2026-12-01' })).status).toBe(401);
    expect((await request(app).delete('/reminders/pause')).status).toBe(401);
    expect((await request(app).post('/reminders/push-subscriptions').send(validSubscription)).status).toBe(401);
    expect(
      (await request(app).delete('/reminders/push-subscriptions').send({ endpoint: validSubscription.endpoint }))
        .status,
    ).toBe(401);
  });

  it('conta só de terapeuta: 403 PATIENT_PROFILE_REQUIRED em todas as rotas, nada gravado', async () => {
    const therapist = await loginAgent(THERAPIST);

    for (const res of [
      await therapist.get('/reminders'),
      await therapist.put('/reminders').send(validSettings),
      await therapist.post('/reminders/pause').send({ until: '2026-12-01' }),
      await therapist.delete('/reminders/pause'),
      await therapist.post('/reminders/push-subscriptions').send(validSubscription),
      await therapist.delete('/reminders/push-subscriptions').send({ endpoint: validSubscription.endpoint }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PATIENT_PROFILE_REQUIRED');
    }
    expect(await prisma.reminderSettings.count()).toBe(0);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('recusa userId ou patientId no corpo (400) e nunca expõe userId na resposta', async () => {
    const agent = await loginAgent(PATIENT);

    expect((await agent.put('/reminders').send({ ...validSettings, userId: otherPatientId })).status).toBe(400);
    expect((await agent.put('/reminders').send({ ...validSettings, patientId: otherPatientId })).status).toBe(400);
    expect(
      (await agent.post('/reminders/pause').send({ until: '2026-12-01', userId: otherPatientId })).status,
    ).toBe(400);
    expect(
      (await agent.post('/reminders/push-subscriptions').send({ ...validSubscription, userId: otherPatientId }))
        .status,
    ).toBe(400);

    const ok = await agent.get('/reminders');
    expect(ok.status).toBe(200);
    expect(ok.body.userId).toBeUndefined();
    expect(ok.body.settings.userId).toBeUndefined();
  });

  it('cada paciente só lê e altera os próprios lembretes e inscrições (403 no endpoint de outra pessoa)', async () => {
    const otherAgent = await loginAgent(OTHER_PATIENT);
    await otherAgent.post('/reminders/push-subscriptions').send(validSubscription);
    await otherAgent.put('/reminders').send({ ...validSettings, morningTime: '09:30' });

    const patientAgent = await loginAgent(PATIENT);
    expect((await patientAgent.get('/reminders')).body.settings.morningTime).toBe('08:00');

    // Tentar sobrescrever ou apagar a inscrição de outra pessoa retorna 403 FORBIDDEN:
    const overwrite = await patientAgent.post('/reminders/push-subscriptions').send(validSubscription);
    expect(overwrite.status).toBe(403);
    expect(overwrite.body.error.code).toBe('FORBIDDEN');

    const delOther = await patientAgent
      .delete('/reminders/push-subscriptions')
      .send({ endpoint: validSubscription.endpoint });
    expect(delOther.status).toBe(403);
    expect(delOther.body.error.code).toBe('FORBIDDEN');

    const subInDb = await prisma.pushSubscription.findUniqueOrThrow({
      where: { endpoint: validSubscription.endpoint },
    });
    expect(subInDb.userId).toBe(otherPatientId);
  });
});
