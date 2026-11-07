import { createApp } from './app.js';
import { env } from './config/env.js';
import { detachedRunner } from './lib/background.js';
import { logger } from './lib/logger.js';
import { createResendMailer } from './lib/mailer.js';
import { prisma } from './lib/prisma.js';
import { createWebPushSender } from './lib/web-push.js';
import { scheduleDeletedAccountsPrune } from './modules/auth/deleted-accounts.js';
import { createRemindersService, scheduleRemindersJob } from './modules/reminders/reminders.service.js';

const mailer = createResendMailer();
const pushSender = createWebPushSender();

const server = createApp({ mailer, pushSender }).listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API do Faísca no ar');
});

// A lista de contas excluídas some depois do prazo das cópias de segurança (DEC-077).
const stopPrune = scheduleDeletedAccountsPrune();
// Agendador dos lembretes a cada 5 minutos (DEC-006, DEC-089).
const stopReminders = scheduleRemindersJob(createRemindersService(mailer, pushSender));

// Encerramento gracioso: o Railway manda SIGTERM a cada deploy.
function shutdown(signal: string) {
  logger.info({ signal }, 'Encerrando a API');
  stopPrune();
  stopReminders();
  server.close(async () => {
    // E-mails que ainda estão saindo depois da resposta (DEC-073): espera um pouco por eles.
    await detachedRunner.idle(5000);
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
