import { Readable } from 'node:stream';
import { AppError } from '../../errors/app-error.js';
import { ACTION_VIDEO_MAX_BYTES } from '../../lib/action-video.js';
import type { ActionVideoProcessingStore } from '../../lib/action-video-processing.js';
import { prisma } from '../../lib/prisma.js';
import { assertActionMediaOpen, findOwnedAction } from './actions.service.js';
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

export function createActionVideosService(storage: ActionVideoProcessingStore) {
  async function status(userId: string, actionId: string) {
    await findOwnedAction(userId, actionId);
    return prisma.actionVideo.findUnique({
      where: { actionId },
      select: { state: true, keepAudio: true },
    });
  }

  async function upload(userId: string, actionId: string, file: VideoUpload, keepAudio = true) {
    const action = await findOwnedAction(userId, actionId);
    await assertActionMediaOpen(userId, action, 'video');
    if (!videoContentTypes.has(file.contentType)) {
      throw new AppError(415, 'INVALID_VIDEO_TYPE', 'Envie um arquivo MP4 ou MOV.');
    }
    if (!Number.isSafeInteger(file.contentLength) || file.contentLength < 1 || file.contentLength > ACTION_VIDEO_MAX_BYTES) {
      throw new AppError(413, 'VIDEO_TOO_LARGE', 'Envie um vídeo de até 100 MB.');
    }

    const job = await prisma.$transaction(async (tx) => {
      // Serializa as reservas da conta. Um envio em andamento não ocupa várias vagas.
      const [owner] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "User" WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
      if (!owner) throw new AppError(404, 'ACTION_NOT_FOUND', 'Ação não encontrada.');
      await findOwnedAction(userId, actionId, tx);
      const existing = await tx.actionVideo.findUnique({ where: { actionId } });
      if (existing && existing.state !== 'FAILED') {
        throw new AppError(409, 'ACTION_VIDEO_EXISTS', 'Esta ação já tem um vídeo ou envio em andamento.');
      }
      const busy = await tx.actionVideo.findFirst({
        where: { action: { userId }, state: { in: ['UPLOADING', 'PENDING', 'PROCESSING'] } },
        select: { id: true },
      });
      if (busy) throw new AppError(409, 'ACTION_VIDEO_BUSY', 'Aguarde o processamento do outro vídeo antes de enviar um novo.');
      if (existing) await tx.actionVideo.update({ where: { id: existing.id }, data: { actionId: null } });
      return tx.actionVideo.create({ data: { actionId, keepAudio } });
    });

    const body = validateUploadStream(file);
    try {
      await storage.put(actionVideoSourceKey(job.id), { ...file, body });
      await assertActionMediaOpen(userId, await findOwnedAction(userId, actionId), 'video');
      const queued = await prisma.actionVideo.updateMany({
        where: { id: job.id, actionId, state: 'UPLOADING' }, data: { state: 'PENDING' },
      });
      if (queued.count !== 1) throw new AppError(409, 'ACTION_VIDEO_CANCELLED', 'O envio do vídeo foi encerrado.');
      return { state: 'PENDING' as const, keepAudio };
    } catch (error) {
      // A fila remove o original, inclusive se o provedor aceitou o envio mas a resposta falhou.
      await prisma.actionVideo.updateMany({
        where: { id: job.id, actionId, state: 'UPLOADING' }, data: { state: 'FAILED' },
      });
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'VIDEO_STORAGE_UNAVAILABLE', 'Não foi possível guardar o vídeo. Tente novamente.');
    } finally {
      body.destroy();
    }
  }

  async function remove(userId: string, actionId: string) {
    await assertActionMediaOpen(userId, await findOwnedAction(userId, actionId), 'video');
    const removed = await prisma.actionVideo.updateMany({
      where: { actionId, state: { not: 'UPLOADING' } }, data: { actionId: null },
    });
    if (removed.count === 0 && await prisma.actionVideo.findUnique({ where: { actionId }, select: { id: true } })) {
      throw new AppError(409, 'ACTION_VIDEO_BUSY', 'Aguarde o envio terminar para remover o vídeo.');
    }
    if (removed.count === 0) throw new AppError(404, 'ACTION_VIDEO_NOT_FOUND', 'Vídeo não encontrado.');
  }

  // A leitura da profissional deve chegar aqui só depois de conferir vínculo, área e aceites.
  async function openReady(ownerId: string, actionId: string, range?: string) {
    await findOwnedAction(ownerId, actionId);
    if (range !== undefined && !/^bytes=(?:\d{1,15}-\d{0,15}|-\d{1,15})$/.test(range)) {
      throw new AppError(416, 'INVALID_VIDEO_RANGE', 'Intervalo de vídeo inválido.');
    }
    const video = await prisma.actionVideo.findFirst({
      where: { actionId, state: 'READY', action: { userId: ownerId } },
      select: { id: true, outputVersion: true },
    });
    if (!video?.outputVersion) throw new AppError(404, 'ACTION_VIDEO_NOT_FOUND', 'Vídeo não encontrado.');
    return storage.get(actionVideoOutputKey(video.id, video.outputVersion), range);
  }

  return { status, upload, remove, openReady };
}
