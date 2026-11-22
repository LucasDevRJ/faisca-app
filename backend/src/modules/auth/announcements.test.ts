import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { runInline } from '../../lib/background.js';
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
  app = createApp({ mailer, runAfterResponse: runInline });
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
const BACKUPS = '2026-10-copias-seguranca';
const MURAL = '2026-10-mural';
const ABOUT_ME = '2026-11-sobre-mim';
const REMINDERS = '2026-11-lembretes';
const PLANS = '2026-11-meus-planos';
const ACTIVITY_PHOTOS = '2026-11-fotos-atividades';
const TASKS = '2026-11-tarefas';
const SLEEP = '2026-11-sono-humor';
const COMMUNITY = '2026-11-comunidade';
const MEDICATIONS = '2026-11-remedios';
const EMAIL_UPDATES = '2026-11-novidades-email';
const READ_RECEIPTS = '2026-11-lido-paciente';

describe('card de Novidades (DEC-054, DEC-058)', () => {
  it('a paciente vê a novidade que é para ela até tocar em "Entendi"; fica no banco', async () => {
    const agent = await loginAgent();

    expect((await agent.get('/auth/me')).body.user.pendingAnnouncement).toBe(READ_RECEIPTS);

    const seen = await agent.post('/auth/announcement-seen').send({ announcement: READ_RECEIPTS });
    expect(seen.status).toBe(200);
    expect(seen.body.user.pendingAnnouncement).toBeNull();
    expect((await request.agent(app).post('/auth/login').send({ email: PATIENT, password: PASSWORD })).body.user
      .pendingAnnouncement).toBeNull();
  });

  it('a terapeuta recebe a mais recente para ela, e não uma anterior', async () => {
    await createConfirmedUser({ email: 'terapeuta@faisca.test', patient: false, therapist: true });
    const agent = await loginAgent('terapeuta@faisca.test');

    expect((await agent.get('/auth/me')).body.user.pendingAnnouncement).toBe(EMAIL_UPDATES);
    // A anterior não pode ser marcada no lugar da que está aparecendo.
    expect((await agent.post('/auth/announcement-seen').send({ announcement: MURAL })).status).toBe(400);
    expect((await agent.post('/auth/announcement-seen').send({ announcement: EMAIL_UPDATES })).status).toBe(200);
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
    expect((await request(app).post('/auth/announcement-seen').send({ announcement: MURAL })).status).toBe(401);
  });

  it('a pendente é a mais recente para o perfil, depois da última vista', () => {
    const patient = { patient: true, therapist: false };
    const therapist = { patient: false, therapist: true };
    const both = { patient: true, therapist: true };

    expect(pendingAnnouncement(null, patient)).toBe(READ_RECEIPTS);
    // O Meus Planos é para os dois perfis (DEC-095): a terapeuta também o recebe.
    expect(pendingAnnouncement(null, therapist)).toBe(EMAIL_UPDATES);
    // A novidade por e-mail vale para os dois perfis; o "Lido" é só para paciente.
    expect(pendingAnnouncement(MURAL, therapist)).toBe(EMAIL_UPDATES);
    expect(pendingAnnouncement(ALTERNATIVE, patient)).toBe(READ_RECEIPTS);
    expect(pendingAnnouncement(READ_MARKS, both)).toBe(READ_RECEIPTS);
    expect(pendingAnnouncement(PHOTOS, both)).toBe(READ_RECEIPTS);
    expect(pendingAnnouncement(BACKUPS, both)).toBe(READ_RECEIPTS);
    expect(pendingAnnouncement(ABOUT_ME, both)).toBe(READ_RECEIPTS);
    expect(pendingAnnouncement(REMINDERS, both)).toBe(READ_RECEIPTS);
    expect(pendingAnnouncement(REMINDERS, therapist)).toBe(EMAIL_UPDATES);
    expect(pendingAnnouncement(PLANS, both)).toBe(READ_RECEIPTS);
    expect(pendingAnnouncement(ACTIVITY_PHOTOS, both)).toBe(READ_RECEIPTS);
    expect(pendingAnnouncement(TASKS, both)).toBe(READ_RECEIPTS);
    expect(pendingAnnouncement(SLEEP, both)).toBe(READ_RECEIPTS);
    expect(pendingAnnouncement(COMMUNITY, both)).toBe(READ_RECEIPTS);
    expect(pendingAnnouncement(MEDICATIONS, both)).toBe(READ_RECEIPTS);
    expect(pendingAnnouncement(MEDICATIONS, therapist)).toBe(EMAIL_UPDATES);
    expect(pendingAnnouncement(EMAIL_UPDATES, therapist)).toBeNull();
    expect(pendingAnnouncement(EMAIL_UPDATES, both)).toBe(READ_RECEIPTS);
    expect(pendingAnnouncement(READ_RECEIPTS, both)).toBeNull();
    expect(pendingAnnouncement('desconhecida', patient)).toBe(READ_RECEIPTS);
  });
});
