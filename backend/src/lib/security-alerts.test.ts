import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createConfirmedUser, resetDatabase } from '../test/db.js';
import { FakeMailer } from '../test/fake-mailer.js';
import {
  ALERT_COOLDOWN_MINUTES,
  ALERT_WINDOW_MINUTES,
  SECURITY_ALERT_KINDS,
  createSecurityAlerts,
  type SecurityAlertKind,
  type SecurityAlerts,
} from './security-alerts.js';

const TO = 'alertas@faisca.test';
const MINUTE = 60 * 1000;

function setup() {
  let clock = Date.UTC(2026, 10, 26, 12, 0, 0);
  const mailer = new FakeMailer();
  const alerts = createSecurityAlerts({ mailer, to: TO, now: () => clock });
  return {
    mailer,
    alerts,
    advance(minutes: number) {
      clock += minutes * MINUTE;
    },
  };
}

function repeat(alerts: SecurityAlerts, kind: SecurityAlertKind, times: number, accountId?: string) {
  for (let i = 0; i < times; i++) alerts.record(kind, accountId);
}

describe('createSecurityAlerts (DEC-141)', () => {
  it('não avisa abaixo do limite e avisa uma vez ao chegar nele', () => {
    const { mailer, alerts } = setup();
    repeat(alerts, 'login_failed', SECURITY_ALERT_KINDS.login_failed.limit - 1);
    expect(mailer.sent).toHaveLength(0);

    alerts.record('login_failed');
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe(TO);
  });

  it('o e-mail é neutro: só o tipo e o número, sem id de conta', () => {
    const { mailer, alerts } = setup();
    const accountId = randomUUID();
    repeat(alerts, 'forbidden', SECURITY_ALERT_KINDS.forbidden.limit, accountId);

    const message = mailer.sent[0];
    expect(message?.subject).toBe('Faísca: alerta de segurança');
    expect(message?.text).toContain(`${SECURITY_ALERT_KINDS.forbidden.limit} acessos negados (403)`);
    expect(message?.text).not.toContain(accountId);
    expect(message?.html).not.toContain(accountId);
  });

  it('o 403 conta por conta: contas diferentes não somam', () => {
    const { mailer, alerts } = setup();
    const limit = SECURITY_ALERT_KINDS.forbidden.limit;
    repeat(alerts, 'forbidden', limit - 1, randomUUID());
    repeat(alerts, 'forbidden', limit - 1, randomUUID());
    expect(mailer.sent).toHaveLength(0);
  });

  it('esquece o que saiu da janela de 10 minutos', () => {
    const { mailer, alerts, advance } = setup();
    const limit = SECURITY_ALERT_KINDS.server_error.limit;
    repeat(alerts, 'server_error', limit - 1);
    advance(ALERT_WINDOW_MINUTES);
    alerts.record('server_error');
    expect(mailer.sent).toHaveLength(0);
  });

  it('no máximo um e-mail por tipo a cada hora, e cada tipo tem o seu', () => {
    const { mailer, alerts, advance } = setup();
    repeat(alerts, 'rate_limited', SECURITY_ALERT_KINDS.rate_limited.limit + 30);
    repeat(alerts, 'server_error', SECURITY_ALERT_KINDS.server_error.limit);
    expect(mailer.sent).toHaveLength(2);

    advance(ALERT_COOLDOWN_MINUTES - 1);
    repeat(alerts, 'rate_limited', SECURITY_ALERT_KINDS.rate_limited.limit);
    expect(mailer.sent).toHaveLength(2);

    advance(1);
    alerts.record('rate_limited');
    expect(mailer.sent).toHaveLength(3);
  });

  it('sem destinatário, não envia e-mail (fica só no log)', () => {
    const mailer = new FakeMailer();
    const alerts = createSecurityAlerts({ mailer, to: undefined });
    repeat(alerts, 'login_failed', SECURITY_ALERT_KINDS.login_failed.limit);
    expect(mailer.attempts).toHaveLength(0);
  });

  it('falha no envio não derruba quem registrou', async () => {
    const { mailer, alerts } = setup();
    mailer.sendError = new Error('Resend fora do ar');
    expect(() => repeat(alerts, 'server_error', SECURITY_ALERT_KINDS.server_error.limit)).not.toThrow();
    await Promise.resolve();
    expect(mailer.attempts).toHaveLength(1);
  });
});

describe('securityAlertsMiddleware: o que cada resposta conta', () => {
  const recorded: { kind: SecurityAlertKind; accountId?: string }[] = [];
  const spy: SecurityAlerts = { record: (kind, accountId) => void recorded.push({ kind, accountId }) };
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    await resetDatabase();
    recorded.length = 0;
    app = createApp({ mailer: new FakeMailer(), securityAlerts: spy });
  });

  it('login com senha errada conta como login_failed; login certo não conta', async () => {
    await createConfirmedUser({ email: 'paciente@faisca.test', password: 'senha-ficticia-123' });
    expect((await request(app).post('/auth/login').send({ email: 'paciente@faisca.test', password: 'errada-123456' })).status).toBe(401);
    expect((await request(app).post('/auth/login').send({ email: 'paciente@faisca.test', password: 'senha-ficticia-123' })).status).toBe(200);
    expect(recorded).toEqual([{ kind: 'login_failed', accountId: undefined }]);
  });

  it('401 fora do login (sem sessão) não conta', async () => {
    expect((await request(app).get('/activities')).status).toBe(401);
    expect(recorded).toEqual([]);
  });

  it('403 conta com o id da conta que tentou', async () => {
    const patient = await createConfirmedUser({ email: 'paciente@faisca.test', password: 'senha-ficticia-123' });
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: 'paciente@faisca.test', password: 'senha-ficticia-123' });

    const res = await agent.get(`/therapist/patients/${randomUUID()}/tasks`);
    expect(res.status).toBe(403);
    expect(recorded).toEqual([{ kind: 'forbidden', accountId: patient.id }]);
  });

  it('/health não conta nada', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
    expect(recorded).toEqual([]);
  });
});
