import { Readable } from 'node:stream';
import { AppError } from '../../errors/app-error.js';
import { ACTION_VIDEO_MAX_BYTES } from '../../lib/action-video.js';
import type { ActionVideoProcessingStore } from '../../lib/action-video-processing.js';
import { prisma } from '../../lib/prisma.js';
import { assertActionMediaOpen, findOwnedAction } from './actions.service.js';
import { assertActivityMediaOpen, findOwnedActivity } from '../activities/activities.service.js';
import { actionVideoOutputKey, actionVideoSourceKey } from './action-video-worker.js';

const videoContentTypes = new Set(['video/mp4', 'video/quicktime']);

type VideoUpload = Parameters<ActionVideoProcessingStore['put']>[1];

function validateUploadStream(file: VideoUpload) {
  return Readable.from((async function* () {
    let received = 0;
    for await (const chunk of file.body) {
      if (!(chunk instanceof Uint8Array)) {
        throw new AppError(400, 'VIDEO_UPLOAD_INCOMPLETE', 'Não foi possível receber o arquivo de vídeo.');
      }
      received += chunk.byteLength;
      if (received > file.contentLength) {
        throw new AppError(413, 'VIDEO_TOO_LARGE', 'O tamanho do vídeo excede o informado.');
      }
      yield chunk;
    }
    if (received !== file.contentLength) {
      throw new AppError(400, 'VIDEO_UPLOAD_INCOMPLETE', 'O envio do vídeo ficou incompleto.');
    }
  })(), { objectMode: false });
}

export function createActionVideosService(storage: ActionVideoProcessingStore, target: 'action' | 'activity' = 'action') {
  const belongsTo = target === 'action' ? 'actionId' : 'activityId';
  const key = (id: string) => belongsTo === 'actionId' ? { actionId: id } : { activityId: id };
  const findOwned = target === 'action' ? findOwnedAction : findOwnedActivity;
  const assertOpen = async (userId: string, id: string, removing = false) => {
    if (target === 'action') {
      await assertActionMediaOpen(userId, await findOwnedAction(userId, id), 'video');
    } else {
      const activity = await findOwnedActivity(userId, id);
      if (!(removing && activity.status === 'NAO_REALIZADA')) {
        await assertActivityMediaOpen(userId, activity, 'video');
      }
    }
  };

  async function status(userId: string, recordId: string) {
    await findOwned(userId, recordId);
    return prisma.actionVideo.findUnique({
      where: key(recordId),
      select: { state: true, keepAudio: true },
    });
  }

  async function upload(userId: string, recordId: string, file: VideoUpload, keepAudio = true) {
    await assertOpen(userId, recordId);
    const isGif = target === 'activity' && file.contentType === 'image/gif';
    if (!isGif && !videoContentTypes.has(file.contentType)) {
      throw new AppError(415, 'INVALID_VIDEO_TYPE', target === 'activity' ? 'Envie um arquivo MP4, MOV ou GIF.' : 'Envie um arquivo MP4 ou MOV.');
    }
    if (!Number.isSafeInteger(file.contentLength) || file.contentLength < 1 || file.contentLength > ACTION_VIDEO_MAX_BYTES) {
      throw new AppError(413, 'VIDEO_TOO_LARGE', 'Envie um vídeo de até 100 MB.');
    }

    const job = await prisma.$transaction(async (tx) => {
      // Serializa as reservas da conta. Um envio em andamento não ocupa várias vagas.
      const [owner] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "User" WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
      if (!owner) throw new AppError(404, 'ACTION_NOT_FOUND', 'Ação não encontrada.');
      await findOwned(userId, recordId, tx);
      const existing = await tx.actionVideo.findUnique({ where: key(recordId) });
      if (existing && existing.state !== 'FAILED') {
        throw new AppError(409, 'ACTION_VIDEO_EXISTS', target === 'activity'
          ? 'Esta atividade já tem um vídeo, GIF ou envio em andamento.'
          : 'Esta ação já tem um vídeo ou envio em andamento.');
      }
      const busy = await tx.actionVideo.findFirst({
        where: { OR: [{ action: { userId } }, { activity: { userId } }], state: { in: ['UPLOADING', 'PENDING', 'PROCESSING'] } },
        select: { id: true },
      });
      if (busy) throw new AppError(409, 'ACTION_VIDEO_BUSY', 'Aguarde o processamento do outro vídeo antes de enviar um novo.');
      if (existing) await tx.actionVideo.update({ where: { id: existing.id }, data: { [belongsTo]: null } });
      return tx.actionVideo.create({ data: { ...key(recordId), keepAudio: !isGif && keepAudio, isGif } });
    });

    const body = validateUploadStream(file);
    try {
      await storage.put(actionVideoSourceKey(job.id), { ...file, body });
      await assertOpen(userId, recordId);
      const queued = await prisma.actionVideo.updateMany({
        where: { id: job.id, ...key(recordId), state: 'UPLOADING' }, data: { state: 'PENDING' },
      });
      if (queued.count !== 1) throw new AppError(409, 'ACTION_VIDEO_CANCELLED', 'O envio do vídeo foi encerrado.');
      return { state: 'PENDING' as const, keepAudio: job.keepAudio };
    } catch (error) {
      // A fila remove o original, inclusive se o provedor aceitou o envio mas a resposta falhou.
      await prisma.actionVideo.updateMany({
        where: { id: job.id, ...key(recordId), state: 'UPLOADING' }, data: { state: 'FAILED' },
      });
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'VIDEO_STORAGE_UNAVAILABLE', 'Não foi possível guardar o vídeo. Tente novamente.');
    } finally {
      body.destroy();
    }
  }

  async function remove(userId: string, recordId: string) {
    await assertOpen(userId, recordId, true);
    const removed = await prisma.actionVideo.updateMany({
      where: { ...key(recordId), state: { not: 'UPLOADING' } }, data: { [belongsTo]: null },
    });
    if (removed.count === 0 && await prisma.actionVideo.findUnique({ where: key(recordId), select: { id: true } })) {
      throw new AppError(409, 'ACTION_VIDEO_BUSY', 'Aguarde o envio terminar para remover o vídeo.');
    }
    if (removed.count === 0) throw new AppError(404, 'ACTION_VIDEO_NOT_FOUND', 'Vídeo não encontrado.');
  }

  // A leitura da profissional deve chegar aqui só depois de conferir vínculo, área e aceites.
  async function openReady(ownerId: string, recordId: string, range?: string) {
    await findOwned(ownerId, recordId);
    if (range !== undefined && !/^bytes=(?:\d{1,15}-\d{0,15}|-\d{1,15})$/.test(range)) {
      throw new AppError(416, 'INVALID_VIDEO_RANGE', 'Intervalo de vídeo inválido.');
    }
    const video = await prisma.actionVideo.findFirst({
      where: { ...key(recordId), state: 'READY', [target]: { userId: ownerId } },
      select: { id: true, outputVersion: true },
    });
    if (!video?.outputVersion) throw new AppError(404, 'ACTION_VIDEO_NOT_FOUND', 'Vídeo não encontrado.');
    return storage.get(actionVideoOutputKey(video.id, video.outputVersion), range);
  }

  return { status, upload, remove, openReady };
}
