import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { CURRENT_ANNOUNCEMENT, pendingAnnouncement } from './announcements.js';

// Card de Novidades (DEC-054). Dados fictícios (regra 5 do AGENTS.md).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';

let app: ReturnType<typeof createApp>;
let mailer: FakeMailer;

beforeEach(async () => {
  await resetDatabase();
  mailer = new FakeMailer();
  app = createApp({ mailer });
  await createConfirmedUser({ email: PATIENT });
});

async function loginAgent(email = PATIENT) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const ALTERNATIVE = '2026-10-explicacao-alternativa';
const READ_MARKS = '2026-10-lido';
const PHOTOS = '2026-10-fotos-acao';

describe('card de Novidades (DEC-054, DEC-058)', () => {
  it('a paciente vê a novidade que é para ela até tocar em "Entendi"; fica no banco', async () => {
    const agent = await loginAgent();

    expect((await agent.get('/auth/me')).body.user.pendingAnnouncement).toBe(PHOTOS);

    const seen = await agent.post('/auth/announcement-seen').send({ announcement: PHOTOS });
    expect(seen.status).toBe(200);
    expect(seen.body.user.pendingAnnouncement).toBeNull();
    expect((await request.agent(app).post('/auth/login').send({ email: PATIENT, password: PASSWORD })).body.user
      .pendingAnnouncement).toBeNull();
  });

  it('a terapeuta recebe a mais recente para ela, e não uma anterior', async () => {
    await createConfirmedUser({ email: 'terapeuta@faisca.test', patient: false, therapist: true });
    const agent = await loginAgent('terapeuta@faisca.test');

    expect((await agent.get('/auth/me')).body.user.pendingAnnouncement).toBe(PHOTOS);
    // A anterior não pode ser marcada no lugar da que está aparecendo.
    expect((await agent.post('/auth/announcement-seen').send({ announcement: READ_MARKS })).status).toBe(400);
    expect((await agent.post('/auth/announcement-seen').send({ announcement: PHOTOS })).status).toBe(200);
  });

  it('conta nova não recebe como novidade o que já existia no cadastro', async () => {
    await request(app)
      .post('/auth/signup')
      .send({
        name: 'Pessoa Nova Fictícia',
        email: 'nova@faisca.test',
        password: PASSWORD,
        profiles: { patient: true, therapist: false },
        acceptPrivacy: true,
      });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'nova@faisca.test' } });
    expect(user.seenAnnouncement).toBe(CURRENT_ANNOUNCEMENT);
    expect(pendingAnnouncement(user.seenAnnouncement, { patient: true, therapist: false })).toBeNull();
  });

  it('id desconhecido ou corpo vazio: 400; sem sessão, 401', async () => {
    const agent = await loginAgent();

    expect((await agent.post('/auth/announcement-seen').send({ announcement: 'novidade-antiga' })).status).toBe(400);
    expect((await agent.post('/auth/announcement-seen').send({})).status).toBe(400);
    expect((await request(app).post('/auth/announcement-seen').send({ announcement: PHOTOS })).status).toBe(401);
  });

  it('a pendente é a mais recente para o perfil, depois da última vista', () => {
    const patient = { patient: true, therapist: false };
    const therapist = { patient: false, therapist: true };
    const both = { patient: true, therapist: true };

    expect(pendingAnnouncement(null, patient)).toBe(PHOTOS);
    expect(pendingAnnouncement(null, therapist)).toBe(PHOTOS);
    expect(pendingAnnouncement(ALTERNATIVE, patient)).toBe(PHOTOS);
    expect(pendingAnnouncement(ALTERNATIVE, therapist)).toBe(PHOTOS);
    expect(pendingAnnouncement(READ_MARKS, both)).toBe(PHOTOS);
    expect(pendingAnnouncement(PHOTOS, both)).toBeNull();
    expect(pendingAnnouncement('desconhecida', patient)).toBe(PHOTOS);
  });
});
