import type { RequestHandler, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { AppError } from '../../errors/app-error.js';
import { getAuthUser } from '../../middlewares/require-auth.js';
import type { createActionVideosService } from './action-videos.service.js';

const actionParams = z.object({ id: z.uuid() });
const professionalParams = z.object({ patientId: z.uuid(), actionId: z.uuid() });
const uploadOptions = z.strictObject({ audio: z.enum(['keep', 'remove']).default('keep') });

export function createActionVideosController(service: ReturnType<typeof createActionVideosService>) {
  const status: RequestHandler = async (req, res) => {
    res.json(await service.status(getAuthUser(req).id, actionParams.parse(req.params).id));
  };
  const professionalStatus: RequestHandler = async (req, res) => {
    const { patientId, actionId } = professionalParams.parse(req.params);
    const video = await service.status(patientId, actionId);
    res.json(video?.state === 'READY' ? { state: 'READY' } : null);
  };
  const upload: RequestHandler = async (req, res) => {
    const { id } = actionParams.parse(req.params);
    const { audio } = uploadOptions.parse(req.query);
    if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
      throw new AppError(415, 'INVALID_VIDEO_TYPE', 'Envie o vídeo MP4 ou MOV sem compactação adicional.');
    }
    const length = req.header('Content-Length');
    if (!length || !/^\d+$/.test(length)) {
      throw new AppError(411, 'VIDEO_LENGTH_REQUIRED', 'O tamanho do vídeo precisa ser informado.');
    }
    const result = await service.upload(getAuthUser(req).id, id, {
      body: req,
      contentType: req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase() ?? '',
      contentLength: Number(length),
    }, audio === 'keep');
    res.status(202).json(result);
  };
  const remove: RequestHandler = async (req, res) => {
    await service.remove(getAuthUser(req).id, actionParams.parse(req.params).id);
    res.sendStatus(204);
  };

  async function sendVideo(res: Response, ownerId: string, id: string, range?: string) {
    let file: Awaited<ReturnType<typeof service.openReady>>;
    try {
      file = await service.openReady(ownerId, id, range);
    } catch (error) {
      if (error instanceof AppError) throw error;
      const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
      if (status === 416) throw new AppError(416, 'INVALID_VIDEO_RANGE', 'Intervalo de vídeo inválido.');
      throw new AppError(503, 'VIDEO_STORAGE_UNAVAILABLE', 'Não foi possível abrir o vídeo. Tente novamente.');
    }
    res.status(file.contentRange ? 206 : 200).set({
      'Cache-Control': 'private, no-store',
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    if (file.contentLength !== undefined) res.set('Content-Length', String(file.contentLength));
    if (file.contentRange) res.set('Content-Range', file.contentRange);
    if (res.req.method === 'HEAD') {
      file.body.destroy();
      res.end();
      return;
    }
    try {
      await pipeline(file.body, res);
    } catch {
      res.destroy();
    }
  }

  const playback: RequestHandler = async (req, res) => {
    await sendVideo(res, getAuthUser(req).id, actionParams.parse(req.params).id, req.header('Range'));
  };
  const professionalPlayback: RequestHandler = async (req, res) => {
    const { patientId, actionId } = professionalParams.parse(req.params);
    await sendVideo(res, patientId, actionId, req.header('Range'));
  };

  return { status, upload, remove, playback, professionalStatus, professionalPlayback };
}
