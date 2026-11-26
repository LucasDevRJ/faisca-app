import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, rmdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ACTION_VIDEO_MAX_BYTES, convertActionVideo } from './action-video.js';

export type ActionVideoProcessingStore = {
  get(key: string, range?: string): Promise<{ body: Readable; contentLength?: number; contentRange?: string }>;
  put(key: string, file: { body: Readable; contentType: string; contentLength: number }): Promise<void>;
};

// Executado pelo futuro worker para um trabalho já autorizado e com chaves geradas pelo backend.
// A fila mantém o original até confirmar que a saída pode ser publicada; uma falha é retomável.
export async function processActionVideo(
  store: ActionVideoProcessingStore,
  { sourceKey, outputKey, keepAudio }: { sourceKey: string; outputKey: string; keepAudio?: boolean },
) {
  if (sourceKey === outputKey) throw new Error('O vídeo original e o processado precisam de chaves diferentes.');

  const directory = await mkdtemp(join(tmpdir(), 'faisca-conversao-'));
  const input = join(directory, 'origem.mov');
  const output = join(directory, 'convertido.mp4');

  try {
    const source = await store.get(sourceKey);
    if (source.contentLength !== undefined && source.contentLength > ACTION_VIDEO_MAX_BYTES) {
      source.body.destroy();
      throw new Error('Envie um vídeo de até 100 MB.');
    }
    let bytes = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.byteLength;
        if (bytes > ACTION_VIDEO_MAX_BYTES) callback(new Error('Envie um vídeo de até 100 MB.'));
        else callback(null, chunk);
      },
    });
    await pipeline(source.body, limit, createWriteStream(input, { flags: 'wx', mode: 0o600 }), {
      signal: AbortSignal.timeout(120_000),
    });

    await convertActionVideo(input, output, { keepAudio });
    const { size } = await stat(output);
    const body = createReadStream(output);
    try {
      await store.put(outputKey, { body, contentType: 'video/mp4', contentLength: size });
    } finally {
      // No Windows o arquivo precisa estar fechado antes da limpeza do diretório.
      if (!body.closed) {
        await new Promise<void>((resolve) => {
          body.once('close', resolve);
          body.destroy();
        });
      }
    }
  } finally {
    await Promise.all([input, output].map((path) => rm(path, { force: true })));
    await rmdir(directory);
  }
}
