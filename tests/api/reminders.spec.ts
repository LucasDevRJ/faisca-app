import { createECDH } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { users } from '../fixtures/users.js';

// Lembretes do paciente (DEC-089, issue #32) contra a API de testes: configuração, pausa,
// inscrição de Web Push e autorização por perfil.

function fakePushSubscription(endpoint: string) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint,
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: Buffer.alloc(16, 11).toString('base64url'),
    },
  };
}

test('paciente lê, configura, inscreve push, pausa e retoma lembretes; terapeuta recebe 403', async ({
  playwright,
  baseURL,
}) => {
  const patient = await playwright.request.newContext({ baseURL });
  const therapist = await playwright.request.newContext({ baseURL });
  try {
    expect((await patient.post('/auth/login', { data: users.reminders })).status()).toBe(200);
    expect((await therapist.post('/auth/login', { data: users.therapist })).status()).toBe(200);

    // Terapeuta sem perfil de paciente recebe 403:
    expect((await therapist.get('/reminders')).status()).toBe(403);
    expect(
      (
        await therapist.put('/reminders', {
          data: {
            channel: 'EMAIL',
            morningEnabled: true,
            morningTime: '08:00',
            eveningEnabled: false,
            eveningTime: '20:00',
            quietHoursEnabled: true,
            quietStart: '22:00',
            quietEnd: '07:00',
          },
        })
      ).status(),
    ).toBe(403);

    // Paciente começa com valores padrão:
    const initial = await patient.get('/reminders');
    expect(initial.status()).toBe(200);
    const initialBody = await initial.json();
    expect(initialBody.settings.channel).toBe('EMAIL');
    expect(initialBody.settings.morningEnabled).toBe(false);

    // Inscreve aparelho de Web Push e muda o canal para PUSH:
    const sub = fakePushSubscription('https://fcm.googleapis.com/fcm/send/e2e-aparelho-1');
    const subRes = await patient.post('/reminders/push-subscriptions', { data: sub });
    expect(subRes.status()).toBe(200);
    expect((await subRes.json()).push.hasSubscription).toBe(true);

    const updated = await patient.put('/reminders', {
      data: {
        channel: 'PUSH',
        morningEnabled: true,
        morningTime: '08:30',
        eveningEnabled: true,
        eveningTime: '20:15',
        quietHoursEnabled: true,
        quietStart: '22:00',
        quietEnd: '07:00',
      },
    });
    expect(updated.status()).toBe(200);
    expect((await updated.json()).settings).toMatchObject({
      channel: 'PUSH',
      morningEnabled: true,
      morningTime: '08:30',
      eveningEnabled: true,
      eveningTime: '20:15',
    });

    // Pausa e retoma:
    const paused = await patient.post('/reminders/pause', { data: { until: '2026-12-15' } });
    expect(paused.status()).toBe(200);
    expect((await paused.json()).settings.pausedUntil).toBe('2026-12-15');

    const resumed = await patient.delete('/reminders/pause');
    expect(resumed.status()).toBe(200);
    expect((await resumed.json()).settings.pausedUntil).toBeNull();
  } finally {
    await Promise.all([patient.dispose(), therapist.dispose()]);
  }
});

test('sem sessão, /reminders responde 401', async ({ request }) => {
  expect((await request.get('/reminders')).status()).toBe(401);
});
