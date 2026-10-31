import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';

// Contas excluídas, só pelo id (DEC-076): a lista serve para apagar de novo essas contas depois de
// restaurar uma cópia de segurança (DEC-075, docs/DEPLOY.md). Fica o mesmo tempo que as cópias.
export const DELETED_ACCOUNT_RETENTION_DAYS = 35;

const DAY_MS = 24 * 60 * 60 * 1000;

// Apaga da lista o que passou do prazo. Devolve quantos saíram.
export async function pruneDeletedAccounts(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - DELETED_ACCOUNT_RETENTION_DAYS * DAY_MS);
  const { count } = await prisma.deletedAccount.deleteMany({ where: { deletedAt: { lt: before } } });
  return count;
}

// Roda ao subir a API e depois uma vez por dia. Como o Railway troca a API a cada deploy, a limpeza
// também roda nessas horas; ela é idempotente, então rodar a mais não faz mal.
export function scheduleDeletedAccountsPrune(): () => void {
  const run = () => {
    pruneDeletedAccounts().then(
      (count) => {
        if (count > 0) logger.info({ count }, 'Lista de contas excluídas: prazo vencido apagado');
      },
      (err: unknown) => logger.error({ err }, 'Falha ao limpar a lista de contas excluídas'),
    );
  };
  run();
  const timer = setInterval(run, DAY_MS);
  // Não segura a API de pé no encerramento.
  timer.unref();
  return () => clearInterval(timer);
}
