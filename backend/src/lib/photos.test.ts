import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MAX_PENDING_IMAGES } from './images.js';
import { isPastDeadline, processPhoto } from './photos.js';

// Fotos (DEC-064, DEC-103): partes sem banco. Imagens fictícias (regra 5).

describe('fila de imagens com teto (DEC-103)', () => {
  it(`com ${MAX_PENDING_IMAGES} imagens na fila, a seguinte é recusada na hora com 503`, async () => {
    const photo = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#8fa9b8' } })
      .jpeg()
      .toBuffer();

    // Todas entram na fila no mesmo instante: as que passam do teto nem esperam.
    const results = await Promise.allSettled(Array.from({ length: MAX_PENDING_IMAGES + 2 }, () => processPhoto(photo)));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(MAX_PENDING_IMAGES);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.map((r) => [r.reason.statusCode, r.reason.code])).toEqual([
      [503, 'IMAGE_QUEUE_FULL'],
      [503, 'IMAGE_QUEUE_FULL'],
    ]);
    // Depois que a fila esvazia, volta a aceitar.
    await expect(processPhoto(photo)).resolves.toEqual(expect.objectContaining({ image: expect.any(Uint8Array) }));
  });
});

describe('prazo congelado', () => {
  it('passou quando a consulta já começou; sem prazo, nunca', () => {
    const now = new Date('2026-11-12T17:00:00Z');
    expect(isPastDeadline(null, now)).toBe(false);
    expect(isPastDeadline(new Date('2026-11-12T17:00:01Z'), now)).toBe(false);
    expect(isPastDeadline(new Date('2026-11-12T17:00:00Z'), now)).toBe(true);
  });
});
