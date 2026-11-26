import { randomUUID } from 'node:crypto';
import { processActionVideo, type ActionVideoProcessingStore } from '../../lib/action-video-processing.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// Mais longo que os prazos somados de download, sondagem, conversão e upload.
const leaseMs = 15 * 60 * 1000;
const workerLock = 143_001;

export function actionVideoSourceKey(id: string) {
  return `action-video/source/${id}`;
}

function actionVideoOutputPrefix(id: string) {
  return `action-video/ready/${id}/`;
}

export function actionVideoOutputKey(id: string, version: string) {
  return `${actionVideoOutputPrefix(id)}${version}`;
}

type WorkerStore = ActionVideoProcessingStore & {
  delete(key: string): Promise<void>;
  list(prefix: string): AsyncIterable<string>;
};

export function createActionVideoWorker(
  db: PrismaClient,
  store: WorkerStore,
  convert = processActionVideo,
) {
  async function claim(stale: Date) {
    return db.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${workerLock}::bigint) AS locked`;
      if (!lock?.locked) return null;
      if (await tx.actionVideo.findFirst({ where: { state: 'PROCESSING', updatedAt: { gt: stale } }, select: { id: true } })) {
        return null;
      }
      const job = await tx.actionVideo.findFirst({
        where: {
          actionId: { not: null },
          OR: [{ state: 'PENDING' }, { state: 'PROCESSING', updatedAt: { lte: stale } }],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!job) return null;
      const locked = await tx.actionVideo.updateMany({
        where: { id: job.id, actionId: job.actionId, state: job.state, updatedAt: job.updatedAt },
        data: { state: 'PROCESSING', outputVersion: randomUUID() },
      });
      if (locked.count !== 1) return null;
      return tx.actionVideo.findUniqueOrThrow({ where: { id: job.id } });
    });
  }

  async function cleanup(stale: Date) {
    const video = await db.actionVideo.findFirst({
      where: {
        OR: [
          {
            actionId: null,
            OR: [
              { state: { notIn: ['UPLOADING', 'PROCESSING'] } },
              { updatedAt: { lte: stale } },
            ],
          },
          { actionId: { not: null }, state: { in: ['READY', 'FAILED'] }, cleanupPending: true },
        ],
      },
      orderBy: { updatedAt: 'asc' },
    });
    if (!video) return false;
    const where = { id: video.id, state: video.state, actionId: video.actionId, updatedAt: video.updatedAt };
    try {
      await store.delete(actionVideoSourceKey(video.id));
      const keep = video.actionId && video.state === 'READY' && video.outputVersion
        ? actionVideoOutputKey(video.id, video.outputVersion)
        : null;
      for await (const key of store.list(actionVideoOutputPrefix(video.id))) {
        if (key !== keep) await store.delete(key);
      }
    } catch {
      // A pendência continua no banco e cede a posição às outras limpezas.
      await db.actionVideo.updateMany({ where, data: { updatedAt: new Date() } });
      return false;
    }
    if (video.actionId === null) await db.actionVideo.deleteMany({ where });
    else await db.actionVideo.updateMany({ where, data: { cleanupPending: false } });
    return true;
  }

  async function runOnce(now = new Date()) {
    const stale = new Date(now.getTime() - leaseMs);
    await db.actionVideo.updateMany({
      where: { actionId: { not: null }, state: 'UPLOADING', updatedAt: { lte: stale } },
      data: { state: 'FAILED' },
    });
    // Limpeza é idempotente. Se o R2 falhar, o trabalho permanece registrado para outra tentativa.
    if (await cleanup(stale)) return true;

    const job = await claim(stale);
    if (!job?.outputVersion) return false;

    const outputKey = actionVideoOutputKey(job.id, job.outputVersion);
    let state: 'READY' | 'FAILED' = 'READY';
    try {
      await convert(store, { sourceKey: actionVideoSourceKey(job.id), outputKey, keepAudio: job.keepAudio });
    } catch {
      state = 'FAILED';
    }
    const result = await db.actionVideo.updateMany({
      where: { id: job.id, actionId: job.actionId, state: 'PROCESSING', outputVersion: job.outputVersion },
      data: { state },
    });
    // Outro worker assumiu a reserva ou a Ação foi removida. Só apaga a saída desta tentativa.
    if (result.count === 0) await store.delete(outputKey);
    return true;
  }

  return { runOnce };
}
