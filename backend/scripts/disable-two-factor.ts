// Último recurso da verificação em duas etapas (DEC-092): a pessoa perdeu o aparelho, o acesso ao
// e-mail do código e os códigos de recuperação, e o responsável conferiu a identidade dela por fora
// do app. Desliga o 2FA da conta e manda o e-mail neutro de "desligada". Passo a passo no DEPLOY.
// Uso: npm run 2fa:disable -- pessoa@exemplo.com
import { createResendMailer } from '../src/lib/mailer.js';
import { prisma } from '../src/lib/prisma.js';
import { twoFactorDisabledEmail } from '../src/modules/two-factor/two-factor.emails.js';

// Script de terminal: escreve direto na saída, sem o logger da API.
function say(text: string, stream: NodeJS.WriteStream = process.stdout) {
  stream.write(`${text}\n`);
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  say('Informe o e-mail da conta: npm run 2fa:disable -- pessoa@exemplo.com', process.stderr);
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  say('Nenhuma conta com esse e-mail.', process.stderr);
  process.exit(1);
}

await prisma.$transaction([
  prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEmail: false,
      totpSecret: null,
      totpEnabledAt: null,
      totpLastStep: null,
      totpPendingSecret: null,
      twoFactorLastMethod: null,
      // Derruba as sessões abertas: quem estiver na conta precisa entrar de novo.
      sessionVersion: { increment: 1 },
    },
  }),
  prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
  prisma.twoFactorChallenge.deleteMany({ where: { userId: user.id } }),
]);

try {
  await createResendMailer().send(twoFactorDisabledEmail(user.email, user.name));
} catch {
  say('O 2FA foi desligado, mas o e-mail de aviso não saiu. Avise a pessoa por outro meio.', process.stderr);
}

// Só o id, nunca o e-mail (regra 7).
say(`Verificação em duas etapas desligada para a conta ${user.id}.`);
await prisma.$disconnect();
