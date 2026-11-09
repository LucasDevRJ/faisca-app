import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { describeDevice } from '../../lib/device.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { FakePushSender } from '../../test/fake-push-sender.js';
import { generateVapidKeys } from '../../lib/web-push.js';
import { createLinksService } from '../links/links.service.js';
import { createAuthService } from './auth.service.js';

// Aviso de login novo por e-mail e push (DEC-091). Dados fictícios (regra 5).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER = 'outra@faisca.test';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

let mailer: FakeMailer;
let pushSender: FakePushSender;
let app: ReturnType<typeof createApp>;
let patientId: string;

beforeEach(async () => {
  await resetDatabase();
  mailer = new FakeMailer();
  pushSender = new FakePushSender();
  app = createApp({ mailer, pushSender });
  patientId = (await createConfirmedUser({ name: 'Paula Fictícia', email: PATIENT })).id;
  // Conta que já entrou antes: o próximo login não é o primeiro de todos.
  await prisma.user.update({ where: { id: patientId }, data: { hasLoggedIn: true } });
});

function login(email = PATIENT, password = PASSWORD) {
  return request(app).post('/auth/login').set('User-Agent', ANDROID_CHROME).send({ email, password });
}

async function subscribe(userId: string, endpoint: string) {
  const keys = generateVapidKeys();
  await prisma.pushSubscription.create({
    data: { userId, endpoint, p256dh: keys.publicKey, auth: 'YXV0aC1maWN0aWNpYQ' },
  });
}

describe('aviso de login novo', () => {
  it('login com a senha certa: e-mail neutro, com a data, o aparelho e sem link', async () => {
    expect((await login()).status).toBe(200);

    await vi.waitFor(() => expect(mailer.lastTo(PATIENT)).toBeDefined());
    const email = mailer.lastTo(PATIENT)!;
    expect(email.subject).toBe('Novo acesso à sua conta no Faísca');
    expect(email.text).toContain('Olá, Paula Fictícia.');
    expect(email.text).toMatch(/em \d{2}\/\d{2}\/\d{4}, às \d{2}:\d{2} \(horário de Brasília\), pelo Chrome no Android\./);
    expect(email.text).toContain('Esqueci minha senha');
    expect(email.text).toContain('Conta → Segurança');
    expect(email.text).not.toMatch(/https?:\/\//);
    expect(email.html).not.toMatch(/<a\s/);
    expect(mailer.sent).toHaveLength(1);
  });

  it('senha errada não gera aviso', async () => {
    expect((await login(PATIENT, 'senha-errada-456')).status).toBe(401);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mailer.sent).toHaveLength(0);
  });

  // Só o primeiro de todos: um segundo login, mesmo logo em seguida, avisa (achado dos revisores).
  it('o primeiro login de todos não gera aviso; o seguinte, logo depois, gera', async () => {
    await prisma.user.update({ where: { id: patientId }, data: { hasLoggedIn: false } });
    expect((await login()).status).toBe(200);
    await vi.waitFor(async () =>
      expect((await prisma.user.findUniqueOrThrow({ where: { id: patientId } })).hasLoggedIn).toBe(true),
    );
    expect(mailer.sent).toHaveLength(0);

    expect((await login()).status).toBe(200);
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1));
  });

  // Logins em série numa conta não gastam a cota de e-mails: até 5 por dia; o push continua.
  it('no máximo 5 e-mails por conta em 24 h; o push sai em todo login', async () => {
    await subscribe(patientId, 'https://fcm.googleapis.com/fcm/send/aparelho-ficticio-1');
    for (let i = 0; i < 7; i++) {
      expect((await login()).status).toBe(200);
      await vi.waitFor(() => expect(pushSender.sent).toHaveLength(i + 1));
    }
    expect(mailer.sent.filter((m) => m.subject === 'Novo acesso à sua conta no Faísca')).toHaveLength(5);
  }, 30_000);

  it('também avisa por push nos aparelhos com notificação, e apaga a inscrição vencida', async () => {
    await subscribe(patientId, 'https://fcm.googleapis.com/fcm/send/aparelho-ficticio-1');
    await subscribe(patientId, 'https://fcm.googleapis.com/fcm/send/aparelho-vencido');
    pushSender.setOutcomeForEndpoint('https://fcm.googleapis.com/fcm/send/aparelho-vencido', 'expired');

    expect((await login()).status).toBe(200);

    await vi.waitFor(() => expect(pushSender.sent).toHaveLength(1));
    expect(pushSender.sent[0]!.message.body).toContain('Alguém entrou na sua conta');
    await vi.waitFor(async () =>
      expect(await prisma.pushSubscription.count({ where: { userId: patientId } })).toBe(1),
    );
  });

  it('o push nunca vai para os aparelhos de outra pessoa', async () => {
    const otherId = (await createConfirmedUser({ name: 'Olga Fictícia', email: OTHER })).id;
    await subscribe(otherId, 'https://fcm.googleapis.com/fcm/send/aparelho-da-outra');

    expect((await login()).status).toBe(200);
    await vi.waitFor(() => expect(mailer.lastTo(PATIENT)).toBeDefined());

    expect(pushSender.sent).toHaveLength(0);
    expect(mailer.lastTo(OTHER)).toBeUndefined();
  });

  it('desligado em Conta: nem e-mail nem push', async () => {
    await subscribe(patientId, 'https://fcm.googleapis.com/fcm/send/aparelho-ficticio-1');
    const agent = request.agent(app);
    expect((await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD })).status).toBe(200);
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1));

    const res = await agent.put('/auth/login-alert').send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.user.loginAlert).toBe(false);
    // Desligar avisa por e-mail: uma sessão roubada não desliga em silêncio.
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(2));
    const disabled = mailer.sent[1]!;
    expect(disabled.subject).toBe('O aviso de novos acessos foi desligado');
    expect(disabled.text).toContain('Esqueci minha senha');
    expect(disabled.text).not.toMatch(/https?:\/\//);

    expect((await login()).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mailer.sent).toHaveLength(2);
    expect(pushSender.sent).toHaveLength(1);
  });
});

describe('PUT /auth/login-alert', () => {
  it('liga e desliga só na própria conta; o /auth/me mostra o valor', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    expect((await agent.get('/auth/me')).body.user.loginAlert).toBe(true);

    expect((await agent.put('/auth/login-alert').send({ enabled: false })).status).toBe(200);
    expect((await agent.get('/auth/me')).body.user.loginAlert).toBe(false);
    expect((await agent.put('/auth/login-alert').send({ enabled: true })).body.user.loginAlert).toBe(true);
  });

  it('corpo inválido ou com campo a mais: 400', async () => {
    const otherId = (await createConfirmedUser({ email: OTHER })).id;
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD });

    expect((await agent.put('/auth/login-alert').send({ enabled: 'nao' })).status).toBe(400);
    expect((await agent.put('/auth/login-alert').send({ enabled: false, userId: otherId })).status).toBe(400);
    const other = await prisma.user.findUniqueOrThrow({ where: { id: otherId } });
    expect(other.loginAlertEnabled).toBe(true);
  });

  it('sem sessão: 401', async () => {
    expect((await request(app).put('/auth/login-alert').send({ enabled: false })).status).toBe(401);
  });
});

describe('um aviso pendente por conta', () => {
  it('a segunda reserva da mesma conta vira "extra"; outra conta não é afetada; a reserva vence em 2 min', () => {
    const service = createAuthService(new FakeMailer(), createLinksService(new FakeMailer()));
    const now = Date.now();
    expect(service.claimLoginAlert('conta-a', 'navegador-1', now)).toBe(true);
    expect(service.claimLoginAlert('conta-a', 'navegador-2', now + 1000)).toBe(false);
    expect(service.claimLoginAlert('conta-b', 'navegador-1', now + 1000)).toBe(true);
    // Liberar devolve o login extra, para ele também ser avisado.
    expect(service.releaseLoginAlert('conta-a')).toEqual({ userAgent: 'navegador-2', at: new Date(now + 1000) });
    expect(service.releaseLoginAlert('conta-a')).toBeNull();
    expect(service.claimLoginAlert('conta-a', 'navegador-1', now)).toBe(true);
    expect(service.claimLoginAlert('conta-a', 'navegador-1', now + 3 * 60 * 1000)).toBe(true);
  });

  // Dois acessos quase juntos: os dois são avisados, e não só o primeiro (achado do revisor-seguranca).
  it('dois logins seguidos da mesma conta geram dois avisos', async () => {
    const [first, second] = await Promise.all([login(), login()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await vi.waitFor(() =>
      expect(mailer.sent.filter((m) => m.subject === 'Novo acesso à sua conta no Faísca')).toHaveLength(2),
    );
  });

  // Ligar e desligar em loop não gasta a cota de e-mail: entra no mesmo teto de 5 por dia.
  it('desligar o aviso várias vezes: no máximo 5 e-mails por dia, somando com os de acesso', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1));
    for (let i = 0; i < 6; i++) {
      expect((await agent.put('/auth/login-alert').send({ enabled: false })).status).toBe(200);
      expect((await agent.put('/auth/login-alert').send({ enabled: true })).status).toBe(200);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(mailer.sent).toHaveLength(5);
  });
});

describe('describeDevice', () => {
  it.each([
    [ANDROID_CHROME, 'Chrome no Android'],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari no iPhone',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
      'Samsung Internet no Android',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0',
      'Edge no Windows',
    ],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0', 'Firefox no Mac'],
  ])('%s → %s', (ua, expected) => {
    expect(describeDevice(ua)).toBe(expected);
  });

  it('sem cabeçalho, desconhecido ou gigante: null', () => {
    expect(describeDevice(undefined)).toBeNull();
    expect(describeDevice('curl/8.0')).toBeNull();
    expect(describeDevice('x'.repeat(2000))).toBeNull();
  });
});
