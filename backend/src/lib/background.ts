import { logger } from './logger.js';

// Trabalho que segue depois da resposta (DEC-073). O cadastro, o "esqueci a senha" e o reenvio da
// confirmação respondem antes de buscar a conta e mandar o e-mail: assim levam o mesmo tempo,
// exista a conta ou não, e ninguém descobre pelo relógio quais e-mails estão cadastrados.
export type RunAfterResponse = (kind: string, task: () => Promise<void>) => Promise<void>;

// Só o nome e o código do erro: a mensagem de um erro do Prisma ou do Resend pode citar o e-mail,
// e o redact do logger olha as chaves, não o texto.
function logFailure(kind: string, err: unknown) {
  const { name, code } = (err ?? {}) as { name?: unknown; code?: unknown };
  logger.error({ task: kind, errName: name, errCode: code }, 'Falha em tarefa depois da resposta');
}

// Com limite, para quem forja IPs não encher a memória com pedidos: até maxRunning de uma vez e
// maxQueuedPerKind esperando de cada tipo. Cada tipo tem a própria cota, então uma enxurrada de
// cadastros não barra o "esqueci a senha" de ninguém. O que passar é descartado com log (a pessoa
// vê a resposta neutra e pode pedir de novo).
export function createDetachedRunner({ maxRunning = 4, maxQueuedPerKind = 50 } = {}) {
  const queue: { kind: string; task: () => Promise<void> }[] = [];
  const queuedByKind = new Map<string, number>();
  const idleWaiters: (() => void)[] = [];
  let running = 0;

  function next() {
    if (running === 0 && queue.length === 0) idleWaiters.splice(0).forEach((resolve) => resolve());
    while (running < maxRunning && queue.length > 0) {
      const { kind, task } = queue.shift()!;
      queuedByKind.set(kind, queuedByKind.get(kind)! - 1);
      running++;
      // Promise.resolve().then: um erro síncrono da tarefa também cai no catch e devolve a vaga.
      Promise.resolve()
        .then(task)
        .catch((err: unknown) => logFailure(kind, err))
        .finally(() => {
          running--;
          next();
        });
    }
  }

  const run: RunAfterResponse = async (kind, task) => {
    const queued = queuedByKind.get(kind) ?? 0;
    if (queued >= maxQueuedPerKind) {
      logger.warn({ task: kind }, 'Fila de tarefas cheia: pedido descartado');
      return;
    }
    queuedByKind.set(kind, queued + 1);
    queue.push({ kind, task });
    next();
  };

  // Para o encerramento (deploy): espera as tarefas pendentes, com prazo.
  function idle(timeoutMs: number): Promise<void> {
    if (running === 0 && queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      idleWaiters.push(resolve);
      setTimeout(resolve, timeoutMs).unref();
    });
  }

  return { run, idle, stats: () => ({ running, queued: queue.length }) };
}

// O da API de verdade: um só por processo.
export const detachedRunner = createDetachedRunner();
export const runDetached: RunAfterResponse = detachedRunner.run;

// Nos testes que leem o e-mail logo depois da requisição: roda antes de responder.
export const runInline: RunAfterResponse = (_kind, task) => task();
