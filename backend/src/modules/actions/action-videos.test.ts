import { Readable } from 'node:stream';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { ACTION_VIDEOS_PRIVACY_VERSION } from '../auth/privacy.js';

const password = 'senha-ficticia-123';
const bytes = Buffer.from('ficticio');
const storage = {
  put: vi.fn(async (_key: string, { body }: { body: Readable }) => { await body.toArray(); }),
  get: vi.fn(async (_key: string, range?: string) => ({
    body: Readable.from([range ? bytes.subarray(0, 2) : bytes]),
    contentLength: range ? 2 : bytes.length,
    contentRange: range ? `bytes 0-1/${bytes.length}` : undefined,
  })),
};
const app = createApp({ mailer: new FakeMailer(), actionVideoStorage: storage });

beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
});

async function login(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/auth/login').send({ email, password })).status).toBe(200);
  return agent;
}

async function scenario() {
  const patient = await createConfirmedUser({ privacyVersion: ACTION_VIDEOS_PRIVACY_VERSION });
  const action = await prisma.behavioralAction.create({ data: {
    userId: patient.id, name: 'Ação fictícia', actionDate: new Date(), category: 'PRAZER',
    status: 'AVALIADA', expectation: 3, pleasure: 6, achievement: 5, evaluatedAt: new Date(),
  } });
  const url = `/actions/${action.id}/video`;
  return { patient, action, url };
}

describe('vídeo da Ação: autorização (regra 1)', () => {
  it('permite envio e remoção pelo dono, exige sessão e recusa o acesso de outra conta', async () => {
    const { patient, url } = await scenario();
    const other = await createConfirmedUser({ email: 'outro@faisca.test' });
    const owner = await login(patient.email);
    const unrelated = await login(other.email);
    expect((await request(app).get(url)).status).toBe(401);
    expect((await unrelated.get(url)).status).toBe(403);
    expect((await unrelated.post(url).type('video/mp4').send(bytes)).status).toBe(403);
    expect((await unrelated.delete(url)).status).toBe(403);
    expect(storage.put).not.toHaveBeenCalled();

    const uploaded = await owner.post(`${url}?audio=remove`).type('video/mp4').send(bytes);
    expect(uploaded.status).toBe(202);
    expect(uploaded.body).toEqual({ state: 'PENDING', keepAudio: false });
    expect((await owner.get(`${url}/play`)).status).toBe(404);
    expect((await owner.delete(url)).status).toBe(204);
    expect((await owner.get(url)).body).toBeNull();
  });

  it('só permite leitura à profissional com vínculo, área e aceites de ambas as contas', async () => {
    const { patient, action, url } = await scenario();
    const professional = await createConfirmedUser({
      email: 'profissional@faisca.test', patient: false, therapist: true, privacyVersion: ACTION_VIDEOS_PRIVACY_VERSION,
    });
    const link = await createTestLink({
      patientId: patient.id, therapistId: professional.id, sharedAreas: ['ACTIONS'],
    });
    await prisma.actionVideo.create({
      data: { actionId: action.id, state: 'READY', outputVersion: '96f2219a-b6db-4f5b-80bf-2f0427b616a7' },
    });
    const agent = await login(professional.email);
    const path = `/therapist/patients/${patient.id}${url}`;
    expect((await agent.get(path)).status).toBe(403);
    expect(storage.get).not.toHaveBeenCalled();
    await prisma.therapistLink.update({ where: { id: link.id }, data: { sharedAreas: ['ACTIONS', 'ACTION_VIDEOS'] } });
    await prisma.user.update({ where: { id: patient.id }, data: { privacyVersion: '2026-11.13' } });
    expect((await agent.get(`${path}/play`)).status).toBe(403);
    expect(storage.get).not.toHaveBeenCalled();
    await prisma.user.update({ where: { id: patient.id }, data: { privacyVersion: '2026-11.14' } });
    await prisma.user.update({ where: { id: professional.id }, data: { privacyVersion: '2026-11.13' } });
    expect((await agent.get(`${path}/play`)).status).toBe(403);
    await prisma.user.update({ where: { id: professional.id }, data: { privacyVersion: '2026-11.14' } });
    expect((await agent.get(path)).body).toEqual({ state: 'READY' });

    const stream = await agent.get(`${path}/play`).set('Range', 'bytes=0-1');
    expect(stream.status).toBe(206);
    expect(stream.headers['content-range']).toBe(`bytes 0-1/${bytes.length}`);
    expect(stream.headers['cache-control']).toBe('private, no-store');
    expect((await agent.delete(path)).status).toBe(403);
    await prisma.therapistLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
    expect((await agent.get(`${path}/play`)).status).toBe(403);
  });
});
