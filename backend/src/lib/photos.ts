import type { Response } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { processImage } from './images.js';
import { prisma } from './prisma.js';
import { createRateLimit } from '../middlewares/rate-limit.js';

// Fotos dos registros (Ação, DEC-064; atividades, DEC-103): o mesmo tratamento, os mesmos limites
// e um teto por conta que soma as duas áreas.

// Até 10 por registro; a grande cabe em 2560 px e a miniatura é um quadrado de 400 px.
export const MAX_PHOTOS = 10;
// Teto por conta (DEC-074), somando a Ação e as atividades (DEC-103): o limite por registro não
// segura quem cria registros sem fim, e cada foto ocupa o banco.
export const MAX_PHOTOS_PER_ACCOUNT = 300;
// Câmeras de celular de até 50 MP; a fila de lib/images.ts trata uma foto por vez na API toda.
const PHOTO_MAX_PIXELS = 50_000_000;
const PHOTO_OUTPUTS = [
  { width: 2560, height: 2560, fit: 'inside' as const, quality: 85 },
  { width: 400, height: 400, fit: 'cover' as const, quality: 75 },
];

// A foto chega como o próprio arquivo; o tipo real é conferido pelo conteúdo (lib/images.ts).
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_MAX_BYTES = '20mb';

// thumb: a miniatura dos cartões; full: a foto grande, ao tocar.
export const photoSizeSchema = z.object({ size: z.enum(['thumb', 'full']).default('thumb') });

// Processar foto é caro: o limite por conta evita que envios em sequência derrubem a API. Cada área
// tem o seu contador, criado com as rotas (cada app de teste começa do zero).
export function createPhotoUploadLimit() {
  return createRateLimit({ windowMinutes: 60, limit: 60, key: 'user' });
}

// A imagem grande e a miniatura, sem metadados.
export async function processPhoto(
  upload: Uint8Array,
): Promise<{ image: Uint8Array<ArrayBuffer>; thumbnail: Uint8Array<ArrayBuffer> }> {
  const [image, thumbnail] = await processImage(upload, PHOTO_MAX_PIXELS, PHOTO_OUTPUTS);
  return { image: new Uint8Array(image!), thumbnail: new Uint8Array(thumbnail!) };
}

type Client = Prisma.TransactionClient | typeof prisma;

// Quantas fotos a conta guarda, somando a Ação e as atividades.
export async function countAccountPhotos(client: Client, userId: string): Promise<number> {
  const [actions, activities] = await Promise.all([
    client.actionPhoto.count({ where: { action: { userId } } }),
    client.activityPhoto.count({ where: { activity: { userId } } }),
  ]);
  return actions + activities;
}

export function accountPhotoLimit() {
  return new AppError(
    409,
    'ACCOUNT_PHOTO_LIMIT',
    `Sua conta chegou ao limite de ${MAX_PHOTOS_PER_ACCOUNT} fotos. Para adicionar outra, remova uma foto de alguma ação ou atividade que ainda esteja no prazo.`,
  );
}

// O prazo congelado das fotos já passou (a consulta começou). Conferido de novo na transação, com o
// registro travado, porque o tratamento da imagem pode terminar depois do horário.
export function isPastDeadline(deadlineAt: Date | null, now: Date = new Date()): boolean {
  return deadlineAt !== null && deadlineAt <= now;
}

export function photoNotFound() {
  return new AppError(404, 'PHOTO_NOT_FOUND', 'Foto não encontrada.');
}

// Sem Content-Type de imagem, o express.raw não lê o corpo.
export function assertPhotoBody(body: unknown): asserts body is Buffer {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie uma foto em JPEG, PNG ou WebP.');
  }
}

// Sem cache nenhum (DEC-066): a foto é dado de saúde e não pode ficar no disco do aparelho depois
// de sair da conta ou de desfazer o vínculo. O custo é baixar de novo a cada visita.
export function sendPhoto(res: Response, image: Uint8Array) {
  res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' });
  res.status(200).send(Buffer.from(image));
}
