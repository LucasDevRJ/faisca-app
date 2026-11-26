import { Readable } from 'node:stream';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { ACTIVITY_VIDEOS_PRIVACY_VERSION } from '../auth/privacy.js';

const bytes = Buffer.from('GIF89a-ficticio');
const storage = {
  put: vi.fn(async (_key: string, { body }: { body: Readable }) => { await body.toArray(); }),
  get: vi.fn(async () => ({
    body: Readable.from([Buffer.from('mp')]),
    contentLength: 2,
    contentRange: 'bytes 0-1/10',
  })),
};
const app = createApp({ mailer: new FakeMailer(), activityVideoStorage: storage });
const privacyVersion = ACTIVITY_VIDEOS_PRIVACY_VERSION;

beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
});

async function login(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/auth/login').send({ email, password: 'senha-ficticia-123' })).status).toBe(200);
  return agent;
}

async function scenario() {
  const patient = await createConfirmedUser({ privacyVersion });
  const activity = await prisma.activity.create({ data: {
    userId: patient.id, name: 'Atividade fictícia', activityDate: new Date('2026-10-01'), status: 'PLANEJADA',
  } });
  return { patient, activity, url: `/activities/${activity.id}/video` };
}

describe('vídeos e GIFs nas atividades', () => {
  it('permite anexar GIF sem som apenas ao dono com o aceite novo', async () => {
    const { patient, activity, url } = await scenario();
    const owner = await login(patient.email);
    const unrelated = await login((await createConfirmedUser({ email: 'outra@faisca.test', privacyVersion })).email);
    expect((await request(app).get(url)).status).toBe(401);
    expect((await unrelated.get(url)).status).toBe(403);
    expect((await unrelated.post(url).type('image/gif').send(bytes)).status).toBe(403);
    expect((await unrelated.delete(url)).status).toBe(403);
    await prisma.user.update({ where: { id: patient.id }, data: { privacyVersion: '2026-11.14' } });
    expect((await owner.post(url).type('image/gif').send(bytes)).status).toBe(403);
    expect(storage.put).not.toHaveBeenCalled();
    await prisma.user.update({ where: { id: patient.id }, data: { privacyVersion } });
    const uploaded = await owner.post(`${url}?audio=keep`).type('image/gif').send(bytes);
    expect(uploaded.status).toBe(202);
    expect(uploaded.body).toEqual({ state: 'PENDING', keepAudio: false });
    expect(await prisma.actionVideo.findUnique({ where: { activityId: activity.id } }))
      .toMatchObject({ actionId: null, isGif: true, keepAudio: false });
    expect((await owner.get(`${url}/play`)).status).toBe(404);
    expect((await owner.delete(url)).status).toBe(204);
    expect((await owner.get(url)).body).toBeNull();
  });

  it('exige as duas áreas, os dois aceites e o vínculo ativo para a leitura profissional', async () => {
    const { patient, activity, url } = await scenario();
    const professional = await createConfirmedUser({
      email: 'profissional@faisca.test', patient: false, therapist: true, privacyVersion,
    });
    const link = await createTestLink({ patientId: patient.id, therapistId: professional.id, sharedAreas: ['ACTIVITIES'] });
    await prisma.actionVideo.create({ data: {
      activityId: activity.id, state: 'READY', outputVersion: '103a1fee-8ee6-4181-ab60-ac238edb9fda',
    } });
    const agent = await login(professional.email);
    const path = `/therapist/patients/${patient.id}${url}`;
    expect((await agent.get(path)).status).toBe(403);
    await prisma.therapistLink.update({ where: { id: link.id }, data: { sharedAreas: ['ACTIVITY_VIDEOS'] } });
    expect((await agent.get(path)).status).toBe(403);
    await prisma.therapistLink.update({ where: { id: link.id }, data: { sharedAreas: ['ACTIVITIES', 'ACTIVITY_VIDEOS'] } });
    await prisma.user.update({ where: { id: patient.id }, data: { privacyVersion: '2026-11.14' } });
    expect((await agent.get(`${path}/play`)).status).toBe(403);
    await prisma.user.update({ where: { id: patient.id }, data: { privacyVersion } });
    await prisma.user.update({ where: { id: professional.id }, data: { privacyVersion: '2026-11.14' } });
    expect((await agent.get(`${path}/play`)).status).toBe(403);
    expect(storage.get).not.toHaveBeenCalled();
    await prisma.user.update({ where: { id: professional.id }, data: { privacyVersion } });
    expect((await agent.get(path)).body).toEqual({ state: 'READY' });
    const part = await agent.get(`${path}/play`).set('Range', 'bytes=0-1');
    expect(part.status).toBe(206);
    expect(part.headers['cache-control']).toBe('private, no-store');
    expect((await agent.delete(path)).status).toBe(403);
    await prisma.therapistLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
    expect((await agent.get(`${path}/play`)).status).toBe(403);
  });

  it('permite retirar um anexo existente de atividade não realizada sem alterar o registro', async () => {
    const { patient, activity, url } = await scenario();
    const owner = await login(patient.email);
    await prisma.activity.update({ where: { id: activity.id }, data: { status: 'NAO_REALIZADA', wantBefore: 5 } });
    await prisma.actionVideo.create({ data: { activityId: activity.id, state: 'READY' } });
    expect((await owner.post(url).type('image/gif').send(bytes)).status).toBe(409);
    expect((await owner.delete(url)).status).toBe(204);
    expect(await prisma.activity.findUnique({ where: { id: activity.id } })).toMatchObject({ status: 'NAO_REALIZADA' });
  });

  it('limita a atividade concluída à leitura quando o prazo das fotos passa', async () => {
    const { patient, activity, url } = await scenario();
    const owner = await login(patient.email);
    await prisma.activity.update({ where: { id: activity.id }, data: {
      status: 'CONCLUIDA', wantBefore: 5, pleasure: 6, achievement: 7,
      completedAt: new Date('2026-10-01T15:00:00Z'), photosDeadlineAt: new Date('2026-10-08T15:00:00Z'),
    } });
    const video = await prisma.actionVideo.create({ data: { activityId: activity.id, state: 'READY' } });
    expect((await owner.post(url).type('image/gif').send(bytes)).status).toBe(409);
    expect((await owner.delete(url)).status).toBe(409);
    expect((await owner.get(url)).body).toMatchObject({ state: 'READY' });
    expect(await prisma.actionVideo.findUnique({ where: { id: video.id } })).toMatchObject({ activityId: activity.id });
  });
});
