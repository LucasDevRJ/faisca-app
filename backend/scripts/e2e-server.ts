import express from 'express';
import { prepareTestDatabase, testDatabaseUrls } from './test-db.js';

// API para os testes do Playwright (tests/), no banco faisca_test (DEC-026).
// Fica fora de src/: nunca entra no build nem em produção.
// Em cada subida: aplica as migrations, apaga os dados e cria os usuários fictícios.

const { appUrl } = testDatabaseUrls();
process.env.DATABASE_URL = appUrl;
process.env.PORT = process.env.E2E_API_PORT ?? '3334';
// Valores fictícios quando o .env não tiver (ex.: CI). Nenhum e-mail sai daqui: o mailer é em memória.
process.env.FRONTEND_URL ??= 'http://localhost:5173';
process.env.JWT_SECRET ??= 'segredo-ficticio-so-para-testes-e2e-0123456789';
process.env.LINK_CODE_SECRET ??= 'segredo-ficticio-dos-codigos-e2e-0123456789';
process.env.RESEND_API_KEY = 're_nao_usado_nos_testes';
process.env.EMAIL_FROM ??= 'Faísca <testes@faisca.test>';
process.env.LOG_LEVEL ??= 'warn';

await prepareTestDatabase();

// Import dinâmico: o env.ts valida process.env no carregamento, então precisa vir depois dos ajustes acima.
const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { logger } = await import('../src/lib/logger.js');
const { prisma } = await import('../src/lib/prisma.js');
const { hashPassword } = await import('../src/lib/password.js');
const { FakeMailer } = await import('../src/test/fake-mailer.js');

// Usuários fictícios (regra 5). As mesmas credenciais estão em tests/fixtures/users.ts.
const SEED_PASSWORD = 'senha-ficticia-123';
const SEED_USERS = [
  { name: 'Paciente Fictícia', email: 'paciente@faisca.test', patient: true, therapist: false },
  { name: 'Terapeuta Fictícia', email: 'terapeuta@faisca.test', patient: false, therapist: true },
  { name: 'Pessoa Fictícia', email: 'dois-perfis@faisca.test', patient: true, therapist: true },
  // Só para os testes de atividades no navegador: não mistura dados com os testes de API.
  { name: 'Dora Fictícia', email: 'registros@faisca.test', patient: true, therapist: false },
  // Só para os testes de vínculo: um vínculo ativo não interfere nos outros testes.
  { name: 'Vera Fictícia', email: 'vinculo-paciente@faisca.test', patient: true, therapist: false },
  { name: 'Tina Fictícia', email: 'vinculo-terapeuta@faisca.test', patient: false, therapist: true },
  // Só para o teste de excluir a conta: some no meio da execução.
  { name: 'Edu Fictício', email: 'excluir@faisca.test', patient: true, therapist: false },
  // Só para o Registro de Pensamentos (api/thought-records.spec.ts): vínculo e aceite próprios.
  { name: 'Rita Fictícia', email: 'rpd-paciente@faisca.test', patient: true, therapist: false },
  { name: 'Lia Fictícia', email: 'rpd-terapeuta@faisca.test', patient: false, therapist: true },
  // Só para as telas do Registro de Pensamentos (e2e/thought-records.spec.ts).
  { name: 'Nina Fictícia', email: 'rpd-tela-paciente@faisca.test', patient: true, therapist: false },
  { name: 'Olga Fictícia', email: 'rpd-tela-terapeuta@faisca.test', patient: false, therapist: true },
];

await prisma.activity.deleteMany();
await prisma.thoughtRecord.deleteMany();
await prisma.appointment.deleteMany();
await prisma.authToken.deleteMany();
await prisma.linkCodeAttempt.deleteMany();
await prisma.linkCode.deleteMany();
await prisma.linkInvite.deleteMany();
await prisma.therapistLink.deleteMany();
await prisma.user.deleteMany();
const passwordHash = await hashPassword(SEED_PASSWORD);
await prisma.user.createMany({
  data: SEED_USERS.map((u) => ({
    name: u.name,
    email: u.email,
    passwordHash,
    hasPatientProfile: u.patient,
    hasTherapistProfile: u.therapist,
    emailConfirmedAt: new Date(),
  })),
});

const mailer = new FakeMailer();
const server = express();

// Caixa de entrada dos testes: devolve o último e-mail enviado para um endereço.
// Existe só neste servidor de testes, nunca no app de verdade.
server.get('/__test__/emails/latest', (req, res) => {
  const message = typeof req.query.to === 'string' ? mailer.lastTo(req.query.to) : undefined;
  if (!message) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Nenhum e-mail para este endereço.' } });
    return;
  }
  res.json(message);
});
server.use(createApp({ mailer }));

server.listen(env.PORT, () => {
  logger.warn({ port: env.PORT }, 'API de testes E2E no ar (banco faisca_test)');
});
