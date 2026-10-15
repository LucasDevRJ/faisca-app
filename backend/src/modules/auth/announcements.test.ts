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

describe('card de Novidades (DEC-054)', () => {
  it('quem já usava vê a novidade atual até tocar em "Entendi"', async () => {
    const agent = await loginAgent();

    expect((await agent.get('/auth/me')).body.user.pendingAnnouncement).toBe(CURRENT_ANNOUNCEMENT);

    const seen = await agent.post('/auth/announcement-seen').send({ announcement: CURRENT_ANNOUNCEMENT });
    expect(seen.status).toBe(200);
    expect(seen.body.user.pendingAnnouncement).toBeNull();
    // Fica no banco: vale em qualquer aparelho.
    expect((await request.agent(app).post('/auth/login').send({ email: PATIENT, password: PASSWORD })).body.user
      .pendingAnnouncement).toBeNull();
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
  });

  it('só a novidade atual pode ser marcada; sem sessão, 401', async () => {
    const agent = await loginAgent();

    expect((await agent.post('/auth/announcement-seen').send({ announcement: 'novidade-antiga' })).status).toBe(400);
    expect((await agent.post('/auth/announcement-seen').send({})).status).toBe(400);
    expect(
      (await request(app).post('/auth/announcement-seen').send({ announcement: CURRENT_ANNOUNCEMENT })).status,
    ).toBe(401);
  });

  it('pendente é sempre a atual, a menos que já tenha sido vista', () => {
    expect(pendingAnnouncement(null)).toBe(CURRENT_ANNOUNCEMENT);
    expect(pendingAnnouncement('novidade-antiga')).toBe(CURRENT_ANNOUNCEMENT);
    expect(pendingAnnouncement(CURRENT_ANNOUNCEMENT)).toBeNull();
  });
});
