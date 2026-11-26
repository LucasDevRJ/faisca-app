import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { actionVideoOutputKey, actionVideoSourceKey, createActionVideoWorker } from './action-video-worker.js';
import { createActionVideosService } from './action-videos.service.js';

const store = {
  get: vi.fn<Parameters<typeof createActionVideoWorker>[1]['get']>(async () => ({ body: Readable.from([]) })),
  put: vi.fn<Parameters<typeof createActionVideoWorker>[1]['put']>(async () => {}),
  delete: vi.fn<(key: string) => Promise<void>>(async () => {}),
  list: vi.fn<(prefix: string) => AsyncIterable<string>>(),
};

async function* listKeys(...keys: string[]) {
  yield* keys;
}

beforeEach(async () => {
  await resetDatabase();
  vi.resetAllMocks();
  store.get.mockImplementation(async () => ({ body: Readable.from([]) }));
  store.put.mockImplementation(async (_key, { body }) => {
    await body.toArray();
  });
  store.delete.mockResolvedValue(undefined);
  store.list.mockImplementation(() => listKeys());
});

async function createAction() {
  const user = await createConfirmedUser();
  return prisma.behavioralAction.create({
    data: {
      userId: user.id, name: 'Atividade fictícia', actionDate: new Date(), category: 'PRAZER',
      status: 'AVALIADA', expectation: 4, pleasure: 5, achievement: 6, evaluatedAt: new Date(),
    },
  });
}

async function enqueue(state: 'UPLOADING' | 'PENDING' | 'PROCESSING' = 'PENDING', keepAudio?: boolean) {
  const action = await createAction();
  return prisma.actionVideo.create({ data: { actionId: action.id, state, keepAudio } });
}

describe('fila de vídeo da Ação', () => {
  it.each([undefined, false])('processa um envio e remove o original, respeitando áudio %s', async (keepAudio) => {
    const job = await enqueue('PENDING', keepAudio);
    const convert = vi.fn(async () => {});
    const workerA = createActionVideoWorker(prisma, store, convert);
    const workerB = createActionVideoWorker(prisma, store, convert);
    await Promise.all([workerA.runOnce(), workerB.runOnce()]);

    const ready = await prisma.actionVideo.findUniqueOrThrow({ where: { id: job.id } });
    expect(ready.state).toBe('READY');
    const sourceKey = actionVideoSourceKey(job.id);
    const outputKey = actionVideoOutputKey(job.id, ready.outputVersion!);
    expect(convert).toHaveBeenCalledExactlyOnceWith(store, { sourceKey, outputKey, keepAudio: keepAudio ?? true });
    store.list.mockReturnValueOnce(listKeys(outputKey));
    await workerA.runOnce();
    expect(store.delete).toHaveBeenCalledExactlyOnceWith(sourceKey);
    expect(await prisma.actionVideo.findUnique({ where: { id: job.id } })).toMatchObject({ cleanupPending: false });
  });

  it('retoma uma conversão interrompida após o prazo e descarta originais e saídas de falhas', async () => {
    const job = await enqueue('PROCESSING');
    const convert = vi.fn(async () => { throw new Error('falha fictícia'); });
    const worker = createActionVideoWorker(prisma, store, convert);
    expect(await worker.runOnce()).toBe(false);
    await worker.runOnce(new Date(Date.now() + 16 * 60_000));
    const failed = await prisma.actionVideo.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed.state).toBe('FAILED');
    const outputKey = actionVideoOutputKey(job.id, failed.outputVersion!);
    store.list.mockReturnValueOnce(listKeys(outputKey));
    await worker.runOnce();
    expect(store.delete.mock.calls).toEqual([[actionVideoSourceKey(job.id)], [outputKey]]);
  });

  it('apaga os objetos depois da exclusão da Ação', async () => {
    const job = await enqueue();
    const worker = createActionVideoWorker(prisma, store, vi.fn(async () => {}));
    await worker.runOnce();
    const ready = await prisma.actionVideo.findUniqueOrThrow({ where: { id: job.id } });
    const outputKey = actionVideoOutputKey(job.id, ready.outputVersion!);
    store.list.mockReturnValueOnce(listKeys(outputKey));
    await prisma.behavioralAction.delete({ where: { id: job.actionId! } });
    await worker.runOnce();
    expect(store.delete.mock.calls).toEqual([[actionVideoSourceKey(job.id)], [outputKey]]);
    expect(await prisma.actionVideo.findUnique({ where: { id: job.id } })).toBeNull();
  });
});

describe('envio de vídeo da Ação', () => {
  function video() {
    return { body: Readable.from([Buffer.from('fictício')]), contentType: 'video/mp4', contentLength: 9 };
  }

  it.each([undefined, false])('reserva, armazena e enfileira com a escolha de áudio %s', async (keepAudio) => {
    const action = await createAction();
    const service = createActionVideosService(store);
    expect(await service.upload(action.userId, action.id, video(), keepAudio))
      .toEqual({ state: 'PENDING', keepAudio: keepAudio ?? true });
    const job = await prisma.actionVideo.findUniqueOrThrow({ where: { actionId: action.id } });
    expect(store.put).toHaveBeenCalledOnce();
    expect(store.put.mock.lastCall?.[0]).toBe(actionVideoSourceKey(job.id));
    await expect(service.upload(action.userId, action.id, video())).rejects.toMatchObject({ code: 'ACTION_VIDEO_EXISTS' });
    await service.remove(action.userId, action.id);
    expect(await service.status(action.userId, action.id)).toBeNull();
  });

  it('nega envio para outra conta antes de chegar ao armazenamento', async () => {
    const action = await createAction();
    const other = await createConfirmedUser({ email: 'outra@faisca.test' });
    const service = createActionVideosService(store);
    await expect(service.upload(other.id, action.id, video())).rejects.toMatchObject({ statusCode: 403 });
    expect(store.put).not.toHaveBeenCalled();
    expect(await prisma.actionVideo.count()).toBe(0);
  });

  it('rejeita um arquivo cujo fluxo termina antes do tamanho informado', async () => {
    const action = await createAction();
    const service = createActionVideosService(store);
    await expect(service.upload(action.userId, action.id, { ...video(), contentLength: 10 }))
      .rejects.toMatchObject({ code: 'VIDEO_UPLOAD_INCOMPLETE' });
    expect(await service.status(action.userId, action.id)).toMatchObject({ state: 'FAILED' });
  });

  it('entrega só a saída pronta da Ação e aceita leitura parcial para reprodução', async () => {
    const action = await createAction();
    const service = createActionVideosService(store);
    await service.upload(action.userId, action.id, video());
    await expect(service.openReady(action.userId, action.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(store.get).not.toHaveBeenCalled();

    const worker = createActionVideoWorker(prisma, store, vi.fn(async () => {}));
    await worker.runOnce();
    const job = await prisma.actionVideo.findUniqueOrThrow({ where: { actionId: action.id } });
    await expect(service.openReady(action.userId, action.id, 'bytes=0-1,4-8')).rejects.toMatchObject({ statusCode: 416 });
    await service.openReady(action.userId, action.id, 'bytes=0-1');
    expect(store.get).toHaveBeenCalledExactlyOnceWith(actionVideoOutputKey(job.id, job.outputVersion!), 'bytes=0-1');
  });
});
