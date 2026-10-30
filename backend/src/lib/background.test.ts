import { describe, expect, it, vi } from 'vitest';
import { createDetachedRunner } from './background.js';
import { logger } from './logger.js';

// Tarefa presa até o teste soltar.
function stuckTask() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { task: () => gate, release };
}

describe('createDetachedRunner (DEC-073)', () => {
  it('roda no máximo maxRunning de uma vez; as outras esperam a vez', async () => {
    const runner = createDetachedRunner({ maxRunning: 2, maxQueuedPerKind: 10 });
    const tasks = [stuckTask(), stuckTask(), stuckTask()];

    for (const { task } of tasks) await runner.run('teste', task);
    expect(runner.stats()).toEqual({ running: 2, queued: 1 });

    tasks[0]!.release();
    await vi.waitFor(() => expect(runner.stats()).toEqual({ running: 2, queued: 0 }));
    tasks[1]!.release();
    tasks[2]!.release();
    await runner.idle(1000);
    expect(runner.stats()).toEqual({ running: 0, queued: 0 });
  });

  it('com a fila do tipo cheia, descarta o pedido com aviso no log', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const runner = createDetachedRunner({ maxRunning: 1, maxQueuedPerKind: 1 });
    const busy = stuckTask();
    const waiting = stuckTask();
    const dropped = vi.fn(async () => undefined);

    await runner.run('teste', busy.task);
    await runner.run('teste', waiting.task);
    await runner.run('teste', dropped);

    expect(dropped).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith({ task: 'teste' }, expect.any(String));
    busy.release();
    waiting.release();
    await runner.idle(1000);
    warn.mockRestore();
  });

  it('falha vai para o log só com o tipo, o nome e o código, sem a mensagem', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const runner = createDetachedRunner();

    await runner.run('forgot-password', async () => {
      throw Object.assign(new Error('falhou para ana.teste@faisca.test'), { code: 'P1001' });
    });
    await runner.idle(1000);

    expect(error).toHaveBeenCalledWith({ task: 'forgot-password', errName: 'Error', errCode: 'P1001' }, expect.any(String));
    expect(JSON.stringify(error.mock.calls)).not.toContain('ana.teste');
    error.mockRestore();
  });

  it('a fila cheia de um tipo não barra os outros tipos', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const runner = createDetachedRunner({ maxRunning: 1, maxQueuedPerKind: 1 });
    const busy = stuckTask();
    const waitingSignup = stuckTask();
    const forgot = vi.fn(async () => undefined);

    await runner.run('signup', busy.task);
    await runner.run('signup', waitingSignup.task);
    await runner.run('signup', async () => undefined);
    await runner.run('forgot-password', forgot);

    busy.release();
    waitingSignup.release();
    await runner.idle(1000);
    expect(forgot).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  it('erro síncrono numa tarefa devolve a vaga e não trava as próximas', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const runner = createDetachedRunner({ maxRunning: 1 });
    const after = vi.fn(async () => undefined);

    await runner.run('teste', (() => {
      throw new Error('síncrono');
    }) as unknown as () => Promise<void>);
    await runner.run('teste', after);
    await runner.idle(1000);

    expect(after).toHaveBeenCalledOnce();
    expect(runner.stats()).toEqual({ running: 0, queued: 0 });
    vi.restoreAllMocks();
  });
});
