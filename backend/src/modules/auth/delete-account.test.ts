import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { SESSION_COOKIE } from '../../lib/session.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';

// Excluir a própria conta (SPEC, "Privacidade"; DEC-035). Dados fictícios (regra 5).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';

let mailer: FakeMailer;
let app: ReturnType<typeof createApp>;
let patientId: string;
let therapistId: string;

beforeEach(async () => {
  await resetDatabase();
  mailer = new FakeMailer();
  app = createApp({ mailer });
  patientId = (await createConfirmedUser({ name: 'Paula Fictícia', email: PATIENT })).id;
  therapistId = (await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true })).id;
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

// Um pouco de tudo o que pertence à paciente: atividade, consulta, vínculo, convite e código.
async function seedPatientData() {
  const date = dateOnlyToDate(todayInAppZone());
  await prisma.activity.create({
    data: { userId: patientId, name: 'Caminhada fictícia', activityDate: date, status: 'PLANEJADA' },
  });
  await prisma.appointment.create({ data: { userId: patientId, appointmentDate: date } });
  await prisma.therapistLink.create({ data: { patientId, therapistId, method: 'CODE' } });
  await prisma.linkInvite.create({
    data: { patientId, therapistEmail: 'outra@faisca.test', tokenHash: 'hash-ficticio-convite', canceledAt: new Date() },
  });
  await prisma.linkCode.create({
    data: { patientId, codeHash: 'hash-ficticio-codigo', expiresAt: new Date(Date.now() + 60_000) },
  });
}

describe('POST /auth/delete-account', () => {
  it('com a senha certa, apaga a conta e tudo dela, limpa o cookie e manda um e-mail neutro', async () => {
    await seedPatientData();
    const agent = await loginAgent(PATIENT);

    const res = await agent.post('/auth/delete-account').send({ password: PASSWORD });

    expect(res.status).toBe(204);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`))).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(await prisma.user.findUnique({ where: { id: patientId } })).toBeNull();
    expect(await prisma.activity.count()).toBe(0);
    expect(await prisma.appointment.count()).toBe(0);
    expect(await prisma.therapistLink.count()).toBe(0);
    expect(await prisma.linkInvite.count()).toBe(0);
    expect(await prisma.linkCode.count()).toBe(0);
    // A terapeuta continua existindo.
    expect(await prisma.user.findUnique({ where: { id: therapistId } })).not.toBeNull();

    const email = mailer.lastTo(PATIENT);
    expect(email?.subject).toBe('Sua conta no Faísca foi excluída');
    expect(email?.text).not.toContain('Caminhada');
    expect(email?.text).not.toMatch(/https?:\/\//);
  });

  it('depois de excluir, a mesma sessão e as outras abertas perdem o acesso', async () => {
    const phone = await loginAgent(PATIENT);
    const laptop = await loginAgent(PATIENT);

    expect((await phone.post('/auth/delete-account').send({ password: PASSWORD })).status).toBe(204);

    expect((await laptop.get('/auth/me')).status).toBe(401);
    expect((await laptop.get('/activities').query({ from: todayInAppZone(), to: todayInAppZone() })).status).toBe(401);
    expect((await request(app).post('/auth/login').send({ email: PATIENT, password: PASSWORD })).status).toBe(401);
  });

  it('senha errada: 400 e nada é apagado', async () => {
    await seedPatientData();
    const agent = await loginAgent(PATIENT);

    const res = await agent.post('/auth/delete-account').send({ password: 'senha-errada-456' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PASSWORD');
    expect(await prisma.user.count()).toBe(2);
    expect(await prisma.activity.count()).toBe(1);
    expect(mailer.sent).toHaveLength(0);
    expect((await agent.get('/auth/me')).status).toBe(200);
  });

  // A conta apagada é sempre a da sessão: um id no corpo é recusado, não usado.
  it('sem senha ou com campo a mais: 400', async () => {
    const agent = await loginAgent(PATIENT);

    expect((await agent.post('/auth/delete-account').send({})).status).toBe(400);
    expect((await agent.post('/auth/delete-account').send({ password: PASSWORD, userId: therapistId })).status).toBe(400);
    expect(await prisma.user.count()).toBe(2);
  });

  it('sem sessão: 401', async () => {
    expect((await request(app).post('/auth/delete-account').send({ password: PASSWORD })).status).toBe(401);
    expect(await prisma.user.count()).toBe(2);
  });

  it('paciente se exclui: a terapeuta perde o acesso (403) e a paciente sai da lista', async () => {
    await seedPatientData();
    const therapist = await loginAgent(THERAPIST);
    expect((await therapist.get(`/therapist/patients/${patientId}`)).status).toBe(200);

    const patient = await loginAgent(PATIENT);
    expect((await patient.post('/auth/delete-account').send({ password: PASSWORD })).status).toBe(204);

    expect((await therapist.get(`/therapist/patients/${patientId}`)).status).toBe(403);
    expect((await therapist.get('/links/patients')).body.patients).toEqual([]);
  });

  it('terapeuta se exclui: a paciente fica sem vínculo e com os registros intactos', async () => {
    await seedPatientData();
    const therapist = await loginAgent(THERAPIST);
    expect((await therapist.post('/auth/delete-account').send({ password: PASSWORD })).status).toBe(204);

    const patient = await loginAgent(PATIENT);
    expect((await patient.get('/link')).body.link).toBeNull();
    expect(await prisma.activity.count({ where: { userId: patientId } })).toBe(1);
  });

  it('responde 429 depois de 10 senhas erradas na mesma conta', async () => {
    const agent = await loginAgent(PATIENT);
    for (let i = 0; i < 10; i += 1) {
      expect((await agent.post('/auth/delete-account').send({ password: 'senha-errada-456' })).status).toBe(400);
    }

    const res = await agent.post('/auth/delete-account').send({ password: PASSWORD });

    expect(res.status).toBe(429);
    expect(await prisma.user.findUnique({ where: { id: patientId } })).not.toBeNull();
  });
});
