import { createApp } from './app.js';
import { env } from './config/env.js';
import { detachedRunner } from './lib/background.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { scheduleDeletedAccountsPrune } from './modules/auth/deleted-accounts.js';

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API do Faísca no ar');
});

// A lista de contas excluídas some depois do prazo das cópias de segurança (DEC-077).
const stopPrune = scheduleDeletedAccountsPrune();

// Encerramento gracioso: o Railway manda SIGTERM a cada deploy.
function shutdown(signal: string) {
  logger.info({ signal }, 'Encerrando a API');
  stopPrune();
  server.close(async () => {
    // E-mails que ainda estão saindo depois da resposta (DEC-073): espera um pouco por eles.
    await detachedRunner.idle(5000);
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
