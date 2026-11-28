import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { HELP_CONSENT_VERSION } from './help-assistant.schema.js';
import { createHelpAssistantService } from './help-assistant.service.js';
import { dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';

const input = { question: 'Como ligo dois registros?', accepted: true, consentVersion: HELP_CONSENT_VERSION } as const;
const provider = vi.fn(async () => ({ answer: 'Use Ligar a outro registro.', sources: ['buscar-ligar'] }));
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  await resetDatabase();
  provider.mockClear();
  app = createApp({ mailer: new FakeMailer(), helpProvider: provider });
});
async function login(therapist = false) {
  const user = await createConfirmedUser({ email: therapist ? 'ajuda-profissional@faisca.test' : 'ajuda-paciente@faisca.test', patient: !therapist, therapist });
  const agent = request.agent(app);
  expect((await agent.post('/auth/login').send({ email: user.email, password: 'senha-ficticia-123' })).status).toBe(200);
  return { user, agent };
}

describe('autorização e consentimento da ajuda', () => {
  it('exige sessão antes de consultar o provedor', async () => {
    expect((await request(app).post('/help/ask').send(input)).status).toBe(401);
    expect(provider).not.toHaveBeenCalled();
  });
  it.each([false, true])('atende a própria conta, com perfil profissional %s', async (therapist) => {
    const { user, agent } = await login(therapist);
    const response = await agent.post('/help/ask').send(input);
    expect(response.status).toBe(200);
    expect(response.body.sources).toEqual([{ title: 'Buscar e ligar registros', href: '/como-funciona#buscar-ligar' }]);
    expect(provider).toHaveBeenCalledExactlyOnceWith(input.question);
    const usage = await prisma.helpAssistantUsage.findFirstOrThrow({ where: { userId: user.id } });
    expect(usage.count).toBe(1);
    expect(usage.consentVersion).toBe(HELP_CONSENT_VERSION);
    expect(Object.keys(usage)).not.toContain('question');
  });
  it('rejeita aceite ausente, versão errada, excesso de texto e identificação de paciente no corpo', async () => {
    const { agent } = await login();
    expect((await agent.post('/help/ask').send({ ...input, accepted: false })).status).toBe(400);
    expect((await agent.post('/help/ask').send({ ...input, consentVersion: 'antiga' })).status).toBe(400);
    expect((await agent.post('/help/ask').send({ ...input, patientId: 'outra-pessoa' })).status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });
  it('mantém a ajuda indisponível quando a integração está desligada', async () => {
    app = createApp({ mailer: new FakeMailer() });
    const { agent } = await login();
    expect((await agent.post('/help/ask').send(input)).status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
  });
});

describe('cota persistente e resposta conferida', () => {
  it('reserva só as dez primeiras solicitações mesmo simultâneas, separando contas', async () => {
    const { user } = await login();
    const other = await createConfirmedUser({ email: 'outra-ajuda@faisca.test' });
    const service = createHelpAssistantService(provider);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => service.ask(user.id, input)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(10);
    expect(provider).toHaveBeenCalledTimes(10);
    expect(await service.ask(other.id, input)).toHaveProperty('answer');
  });
  it('um contador de ontem não impede o uso hoje e a exclusão da conta apaga a cota', async () => {
    const { user } = await login();
    const yesterday = dateOnlyToDate(todayInAppZone());
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await prisma.helpAssistantUsage.create({ data: { userId: user.id, day: yesterday, count: 10, consentVersion: HELP_CONSENT_VERSION } });
    await expect(createHelpAssistantService(provider).ask(user.id, input)).resolves.toHaveProperty('answer');
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.helpAssistantUsage.count({ where: { userId: user.id } })).toBe(0);
  });
  it('rejeita fontes fora do guia e substitui respostas sem fonte pela orientação de suporte', async () => {
    const { user } = await login();
    const invalid = createHelpAssistantService(async () => ({ answer: 'Resposta fictícia', sources: ['https://exemplo.test'] }));
    await expect(invalid.ask(user.id, input)).rejects.toHaveProperty('code', 'HELP_INVALID_SOURCE');
    const unsupported = createHelpAssistantService(async () => ({ answer: 'Diagnóstico inventado', sources: [] }));
    const result = await unsupported.ask(user.id, input);
    expect(result.answer).toContain('suporte@minhafaisca.com.br');
    expect(result.answer).not.toContain('Diagnóstico');
  });
  it('descarta texto inventado do provedor mesmo com fonte válida', async () => {
    const { user } = await login();
    const service = createHelpAssistantService(async () => ({ answer: 'Altere a dose do remédio.', sources: ['vinculo'] }));
    const result = await service.ask(user.id, input);
    expect(result.answer).toContain('O paciente escolhe quais áreas');
    expect(result.answer).not.toContain('dose');
  });
});
