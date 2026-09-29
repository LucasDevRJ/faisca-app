// Cria (ou atualiza) uma terapeuta fictícia já confirmada, para testar o vínculo no navegador
// sem precisar de um segundo e-mail de verdade (DEC-032). Só roda em desenvolvimento.
// Uso: npm run db:seed-dev (com a API de dev configurada no .env).

// Dados fictícios (regra 5). A senha é pública de propósito: a conta só existe no banco local.
const DEV_THERAPIST = {
  name: 'Terapeuta Dev (fictícia)',
  email: 'terapeuta.dev@faisca.test',
  password: 'senha-ficticia-123',
};

if (process.env.NODE_ENV !== 'development') {
  // Antes do logger: importá-lo validaria o .env, e o recado aqui é outro.
  process.stderr.write('db:seed-dev só roda com NODE_ENV=development.\n');
  process.exit(1);
}

// Import dinâmico: o env.ts valida process.env no carregamento, depois da checagem acima.
const { prisma } = await import('../src/lib/prisma.js');
const { hashPassword } = await import('../src/lib/password.js');
const { logger } = await import('../src/lib/logger.js');

const passwordHash = await hashPassword(DEV_THERAPIST.password);
await prisma.user.upsert({
  where: { email: DEV_THERAPIST.email },
  create: {
    name: DEV_THERAPIST.name,
    email: DEV_THERAPIST.email,
    passwordHash,
    hasTherapistProfile: true,
    emailConfirmedAt: new Date(),
  },
  // Rodar de novo devolve a conta ao estado conhecido, sem apagar vínculos.
  update: { passwordHash, hasTherapistProfile: true, emailConfirmedAt: new Date() },
});
await prisma.$disconnect();

// Sem e-mail nem senha no log (regra 7): os dois estão no backend/README.md.
logger.info('Terapeuta fictícia pronta (e-mail e senha no backend/README.md)');
