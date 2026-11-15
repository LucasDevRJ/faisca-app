import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { addDays, dateOnlyToDate, todayInAppZone, timeOnlyToDate } from '../../lib/dates.js';
import { freezeTaskDeadline } from './tasks.service.js';
import { TASKS_MAX } from './tasks.schema.js';

let app: ReturnType<typeof createApp>;
let patientId: string; let otherId: string; let therapistId: string; let linkId: string;
afterEach(() => vi.useRealTimers());
const taskBody = { description: 'Reflexão fictícia combinada na consulta.', title: 'Tarefa fictícia' };
const reply = { responseStatus: 'RESPONDIDA', responseText: 'Resposta fictícia.' };
beforeEach(async () => {
  await resetDatabase(); app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ privacyVersion: '2026-11.6' })).id;
  otherId = (await createConfirmedUser({ email: 'outra@faisca.test', privacyVersion: '2026-11.6' })).id;
  therapistId = (await createConfirmedUser({ email: 'profissional@faisca.test', patient: false, therapist: true, privacyVersion: '2026-11.6' })).id;
  await createConfirmedUser({ email: 'sem-vinculo@faisca.test', patient: false, therapist: true, privacyVersion: '2026-11.6' });
  await createConfirmedUser({ email: 'sem-aceite@faisca.test', privacyVersion: '2026-11.5' });
  linkId = (await createTestLink({ patientId, therapistId })).id;
});
async function login(email = 'paciente@faisca.test') {
  const agent = request.agent(app);
  expect((await agent.post('/auth/login').send({ email, password: 'senha-ficticia-123' })).status).toBe(200);
  return agent;
}
async function seed(userId = patientId) { return prisma.homeworkTask.create({ data: { ...taskBody, userId } }); }

describe('autorização (regra 1)', () => {
  it('exige sessão em todas as rotas e perfil de paciente para escrever', async () => {
    const task = await seed(); const anon = request(app); const professional = await login('profissional@faisca.test');
    for (const agent of [anon, professional]) {
      const code = agent === anon ? 401 : 403;
      expect((await agent.get('/tasks')).status).toBe(code);
      expect((await agent.post('/tasks').send(taskBody)).status).toBe(code);
      expect((await agent.patch(`/tasks/${task.id}`).send(taskBody)).status).toBe(code);
      expect((await agent.delete(`/tasks/${task.id}`)).status).toBe(code);
      expect((await agent.put(`/tasks/${task.id}/response`).send(reply)).status).toBe(code);
    }
    expect((await prisma.homeworkTask.findUniqueOrThrow({ where: { id: task.id } })).respondedAt).toBeNull();
  });
  it('lista só os próprios dados e recusa alterações de outro paciente', async () => {
    const own = await seed(); const other = await seed(otherId); const agent = await login();
    const list = await agent.get('/tasks'); expect(list.status).toBe(200);
    expect(list.body.tasks.map((t: {id: string}) => t.id)).toEqual([own.id]);
    expect(list.body.tasks[0]).not.toHaveProperty('userId');
    expect((await agent.patch(`/tasks/${other.id}`).send({ description: 'Mudança fictícia' })).status).toBe(403);
    expect((await agent.delete(`/tasks/${other.id}`)).status).toBe(403);
    expect((await agent.put(`/tasks/${other.id}/response`).send(reply)).status).toBe(403);
    expect((await prisma.homeworkTask.findUniqueOrThrow({ where: { id: other.id } })).responseText).toBeNull();
  });
  it('exige o novo aceite e recusa ids de usuário no corpo', async () => {
    const old = await login('sem-aceite@faisca.test'); const task = await seed();
    for (const result of [await old.get('/tasks'), await old.post('/tasks').send(taskBody), await old.patch(`/tasks/${task.id}`).send(taskBody), await old.delete(`/tasks/${task.id}`), await old.put(`/tasks/${task.id}/response`).send(reply)]) {
      expect(result.status).toBe(403); expect(result.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
    }
    const agent = await login();
    for (const field of ['userId', 'patientId']) expect((await agent.post('/tasks').send({ ...taskBody, [field]: otherId })).status).toBe(400);
  });
  it('só aceita uma profissional vinculada em combinada com', async () => {
    const agent = await login();
    const accepted = await agent.post('/tasks').send({ ...taskBody, agreedLinkId: linkId });
    expect(accepted.status).toBe(201); expect(accepted.body.task.agreedWith.name).toBe('Pessoa Fictícia');
    await prisma.therapistLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
    expect((await agent.post('/tasks').send({ ...taskBody, agreedLinkId: linkId })).status).toBe(403);
  });
  it('profissional só lê com vínculo e área liberada; não escreve respostas nem tarefas', async () => {
    const task = await seed(); const professional = await login('profissional@faisca.test');
    const path = `/therapist/patients/${patientId}/tasks`;
    expect((await professional.get(path)).status).toBe(200);
    for (const agent of [request(app), professional]) {
      expect((await agent.post(path).send(taskBody)).status).toBe(403);
      expect((await agent.patch(`${path}/${task.id}`).send(taskBody)).status).toBe(403);
      expect((await agent.delete(`${path}/${task.id}`)).status).toBe(403);
      expect((await agent.put(`${path}/${task.id}/response`).send(reply)).status).toBe(403);
    }
    const stranger = await login('sem-vinculo@faisca.test');
    expect((await stranger.get(path)).status).toBe(403);
    expect((await professional.get(`/therapist/patients/${otherId}/tasks`)).status).toBe(403);
    expect((await professional.get('/therapist/patients/invalido/tasks')).status).toBe(403);
    expect((await request(app).get(path)).status).toBe(401);
    const patient = await login(); expect((await patient.get(path)).status).toBe(403);
    await prisma.therapistLink.update({ where: { id: linkId }, data: { sharedAreas: [] } });
    expect((await professional.get(path)).status).toBe(403);
    await prisma.therapistLink.update({ where: { id: linkId }, data: { sharedAreas: ['TASKS'] } });
    const allowed = await professional.get(path); expect(allowed.status).toBe(200);
    expect(allowed.body.tasks[0]).toMatchObject({ agreedWith: null, agreedLinkId: null, responseDeadline: null, responseEditable: false });
    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: '2026-11.5' } });
    expect((await professional.get(path)).status).toBe(403);
    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: '2026-11.6' } });
    await prisma.therapistLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
    expect((await professional.get(path)).status).toBe(403);
  });
});

describe('tarefa única e resposta', () => {
  it('cria, edita e apaga antes de responder; valida limites e corpo estrito', async () => {
    const agent = await login();
    for (const body of [{ description: '' }, { description: 'x'.repeat(5001) }, { ...taskBody, title: 'x'.repeat(121) }]) expect((await agent.post('/tasks').send(body)).status).toBe(400);
    const created = await agent.post('/tasks').send(taskBody); expect(created.status).toBe(201);
    const path = `/tasks/${created.body.task.id}`;
    expect((await agent.patch(path).send({ title: null })).status).toBe(200);
    expect((await agent.delete(path)).status).toBe(204);
    expect((await agent.put(`${path}/response`).send(reply)).status).toBe(404);
  });
  it('permite as três respostas e edição sem consulta; não muda nem apaga a tarefa respondida', async () => {
    const task = await seed(); const agent = await login(); const path = `/tasks/${task.id}`;
    expect((await agent.put(`${path}/response`).send({ responseStatus: 'RESPONDIDA' })).status).toBe(400);
    expect((await agent.put(`${path}/response`).send({ ...reply, responseText: 'x'.repeat(10001) })).status).toBe(400);
    const first = await agent.put(`${path}/response`).send(reply); expect(first.status).toBe(200);
    expect(first.body.task).toMatchObject({ responseStatus: 'RESPONDIDA', responseDeadline: null, responseEditable: true });
    for (const responseStatus of ['NAO_CONSEGUI', 'NAO_FAZ_SENTIDO']) {
      const result = await agent.put(`${path}/response`).send({ responseStatus });
      expect(result.status).toBe(200); expect(result.body.task.responseText).toBeNull();
      expect(result.body.task.respondedAt).toBe(first.body.task.respondedAt);
    }
    expect((await agent.patch(path).send(taskBody)).status).toBe(409);
    expect((await agent.delete(path)).status).toBe(409);
  });
  it('congela o prazo na próxima sessão e não o reabre depois de apagar a consulta', async () => {
    const task = await seed(); const agent = await login();
    await prisma.appointment.create({ data: { userId: patientId, appointmentDate: dateOnlyToDate(addDays(todayInAppZone(), 1)), appointmentTime: timeOnlyToDate('10:00') } });
    const result = await agent.put(`/tasks/${task.id}/response`).send(reply);
    expect(result.status).toBe(200); expect(result.body.task.responseDeadline).not.toBeNull();
    await prisma.appointment.deleteMany();
    expect((await agent.get('/tasks')).body.tasks[0].responseDeadline).toBe(result.body.task.responseDeadline);
    await prisma.homeworkTask.update({ where: { id: task.id }, data: { responseDeadlineAt: new Date(Date.now() - 60000) } });
    expect((await agent.put(`/tasks/${task.id}/response`).send(reply)).status).toBe(409);
    expect((await agent.get('/tasks')).body.tasks[0].responseEditable).toBe(false);
  });
  it('limita o total por conta', async () => {
    await prisma.homeworkTask.createMany({ data: Array.from({ length: TASKS_MAX }, () => ({ ...taskBody, userId: patientId })) });
    expect((await (await login()).post('/tasks').send(taskBody)).status).toBe(409);
  });
  it('só respostas entram em Para ler e editar depois de lida volta a contar', async () => {
    const task = await seed(); const professional = await login('profissional@faisca.test'); const patient = await login();
    const path = `/therapist/patients/${patientId}/unread`;
    expect((await professional.get(path)).body.tasks).toEqual([]);
    expect((await patient.put(`/tasks/${task.id}/response`).send(reply)).status).toBe(200);
    expect((await professional.get(path)).body.counts.tasks).toBe(1);
    const mark = `/therapist/read-marks/${patientId}`; const body = { items: [{ type: 'TASK', id: task.id }] };
    expect((await professional.put(mark).send(body)).status).toBe(200);
    expect((await professional.get(path)).body.counts.tasks).toBe(0);
    expect((await patient.put(`/tasks/${task.id}/response`).send({ ...reply, responseText: 'Reflexão fictícia ampliada.' })).status).toBe(200);
    expect((await professional.get(path)).body.tasks[0].readStatus).toBe('ATUALIZADO');
    const other = await seed(otherId);
    expect((await professional.put(mark).send({ items: [{ type: 'TASK', id: other.id }] })).status).toBe(403);
    await prisma.therapistLink.update({ where: { id: linkId }, data: { sharedAreas: [] } });
    expect((await professional.get(path)).body.tasks).toBeNull();
    expect((await professional.put(mark).send(body)).status).toBe(403);
    expect((await professional.delete(mark).send(body)).status).toBe(403);
  });
});

it('uma gravação tardia de listagem não estende um prazo já congelado mais curto', async () => {
  const task = await prisma.homeworkTask.create({ data: { ...taskBody, userId: patientId, respondedAt: new Date(), responseStatus: 'NAO_CONSEGUI' } });
  const short = new Date(Date.now() + 60000); const long = new Date(Date.now() + 120000);
  // Duas listagens leram a mesma versão antes de uma alteração da agenda. A de prazo maior
  // chega depois: não pode sobrescrever a primeira, mesmo com o updatedAt ainda igual.
  expect((await prisma.$transaction((tx) => freezeTaskDeadline(tx, task, short))).count).toBe(1);
  expect((await prisma.$transaction((tx) => freezeTaskDeadline(tx, task, long))).count).toBe(0);
  const stored = await prisma.homeworkTask.findUniqueOrThrow({ where: { id: task.id } });
  expect(stored.responseDeadlineAt).toEqual(short); expect(stored.updatedAt).toEqual(task.updatedAt);
});

it('permite editar um minuto antes, mas recusa exatamente na hora da consulta', async () => {
  const agent = await login();
  const at = new Date(Math.floor(Date.now() / 60000) * 60000 + 120000);
  const basis = new Date(at.getTime() - 60000);
  const task = await prisma.homeworkTask.create({ data: { ...taskBody, userId: patientId, responseStatus: 'RESPONDIDA', responseText: 'Resposta fictícia.', respondedAt: basis, responseDeadlineAt: at } });
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(basis);
  expect((await agent.put(`/tasks/${task.id}/response`).send(reply)).status).toBe(200);
  vi.setSystemTime(at);
  expect((await agent.put(`/tasks/${task.id}/response`).send(reply)).status).toBe(409);
});
it('antecipa o prazo com nova consulta e congela ao ler como paciente, sem gravação pela profissional', async () => {
  const basis = new Date(); const future = new Date(basis.getTime() + 10 * 86400000);
  const task = await prisma.homeworkTask.create({ data: { ...taskBody, userId: patientId, responseStatus: 'NAO_FAZ_SENTIDO', respondedAt: basis, responseDeadlineAt: future } });
  const appointment = await prisma.appointment.create({ data: { userId: patientId, appointmentDate: dateOnlyToDate(addDays(todayInAppZone(), 1)), appointmentTime: timeOnlyToDate('10:00') } });
  const professional = await login('profissional@faisca.test');
  expect((await professional.get(`/therapist/patients/${patientId}/tasks`)).status).toBe(200);
  expect((await prisma.homeworkTask.findUniqueOrThrow({ where: { id: task.id } })).responseDeadlineAt).toEqual(future);
  const patient = await login(); const result = await patient.get('/tasks');
  const at = new Date(result.body.tasks[0].responseDeadline);
  expect(at < future).toBe(true);
  expect((await prisma.homeworkTask.findUniqueOrThrow({ where: { id: task.id } })).responseDeadlineAt).toEqual(at);
  await prisma.appointment.delete({ where: { id: appointment.id } });
  expect((await patient.get('/tasks')).body.tasks[0].responseDeadline).toBe(at.toISOString());
});
it('uma resposta sem prazo passa a ter prazo ao agendar consulta sem horário', async () => {
  const patient = await login(); const task = await seed();
  expect((await patient.put(`/tasks/${task.id}/response`).send(reply)).body.task.responseDeadline).toBeNull();
  const day = addDays(todayInAppZone(), 1);
  await prisma.appointment.create({ data: { userId: patientId, appointmentDate: dateOnlyToDate(day) } });
  const result = await patient.get('/tasks');
  expect(result.body.tasks[0].responseDeadline).toBe(`${day}T03:00:00.000Z`);
});
