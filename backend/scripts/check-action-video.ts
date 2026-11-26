import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, rmdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { processActionVideo } from '../src/lib/action-video-processing.js';
import { ACTION_VIDEO_MAX_BYTES } from '../src/lib/action-video.js';
import { createPrivateFileStore, readPrivateFileStorageConfig } from '../src/lib/private-file-store.js';

async function checkR2(input: string, downloaded: string, isGif = false) {
  const store = createPrivateFileStore(readPrivateFileStorageConfig(process.env));
  const prefix = `probe/${randomUUID()}/`;
  const sourceKey = `${prefix}${isGif ? 'entrada.gif' : 'entrada.mov'}`;
  const outputKey = `${prefix}convertido.mp4`;
  try {
    const body = await readFile(input);
    await store.put(sourceKey, { body, contentType: isGif ? 'image/gif' : 'video/quicktime', contentLength: body.length }, { ifMissing: true });
    await processActionVideo(store, { sourceKey, outputKey, keepAudio: false, isGif });
    const file = await store.get(outputKey);
    await pipeline(file.body, createWriteStream(downloaded, { flags: 'wx' }), { signal: AbortSignal.timeout(120_000) });
    assert.equal(file.contentType, 'video/mp4');
    assert.equal((await stat(downloaded)).size, file.contentLength);
  } finally {
    const keys = [sourceKey, outputKey];
    try {
      const deleted = await Promise.allSettled(keys.map((key) => store.delete(key)));
      assert.ok(deleted.every(({ status }) => status === 'fulfilled'));
      assert.deepEqual(await Promise.all(keys.map((key) => store.exists(key))), [false, false]);
    } finally {
      store.close();
    }
  }
}

const root = await mkdtemp(join(tmpdir(), 'faisca-video-'));
const input = join(root, 'entrada.mov');
const silent = join(root, 'sem-audio.mp4');
const audible = join(root, 'com-audio.mp4');
const long = join(root, 'longo.mp4');
const rejected = join(root, 'rejeitado.mp4');
const fromR2 = join(root, 'recebido-do-r2.mp4');
const gif = join(root, 'animacao.gif');
const fromGif = join(root, 'animacao.mp4');
const fromGifR2 = join(root, 'animacao-recebida-do-r2.mp4');
try {
  const commandOptions = { timeout: 30_000, windowsHide: true };
  const trackLabel = 'Faixa fictícia';

  execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'color=blue:s=1080x1920:r=12:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-metadata', 'location=+00.0000+000.0000/',
    '-metadata:s:v:0', `handler_name=${trackLabel}`,
    '-metadata:s:a:0', `handler_name=${trackLabel}`,
    '-c:v', 'libx264', '-c:a', 'aac', '-threads', '2', input,
  ], commandOptions);

  function probe(path: string) {
    return execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height:stream_tags:format_tags',
      '-of', 'json', path,
    ], { ...commandOptions, encoding: 'utf8' });
  }
  const source = probe(input);
  assert.match(source, /location/i);
  assert.ok(source.includes(trackLabel));

  const store = {
    async get(key: string) {
      return { body: createReadStream(key), contentLength: (await stat(key)).size };
    },
    async put(key: string, file: { body: NodeJS.ReadableStream; contentType: string; contentLength: number }) {
      assert.equal(file.contentType, 'video/mp4');
      await pipeline(file.body, createWriteStream(key, { flags: 'wx' }));
      assert.equal((await stat(key)).size, file.contentLength);
    },
  };

  function checkOutput(output: string, keepAudio?: boolean) {
    const data = probe(output);
    const result = JSON.parse(data);
    const video = result.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video');
    assert.equal(video.codec_name, 'h264');
    assert.equal(video.width, 720);
    assert.equal(video.height, 1280);
    const audio = result.streams.find((stream: { codec_type: string }) => stream.codec_type === 'audio');
    assert.equal(audio?.codec_name, keepAudio !== false ? 'aac' : undefined);
    assert.doesNotMatch(data, /location/i);
    assert.ok(!data.includes(trackLabel));
  }

  function checkGifOutput(output: string) {
    const data = probe(output);
    assert.match(data, /"codec_name": "h264"/);
    assert.doesNotMatch(data, /"codec_type": "audio"/);
  }

  await processActionVideo(store, { sourceKey: input, outputKey: silent, keepAudio: false });
  checkOutput(silent, false);
  await processActionVideo(store, { sourceKey: input, outputKey: audible });
  checkOutput(audible);

  execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=64x64:r=8:d=1', '-loop', '0', gif,
  ], commandOptions);
  await processActionVideo(store, { sourceKey: gif, outputKey: fromGif, isGif: true });
  checkGifOutput(fromGif);
  process.stdout.write('GIF fictício convertido para MP4 sem áudio e sem repetição automática.\n');

  execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'color=blue:s=64x64:r=1:d=61',
    '-c:v', 'libx264', '-threads', '2', long,
  ], commandOptions);
  await assert.rejects(processActionVideo(store, { sourceKey: long, outputKey: rejected }), /60 segundos/);
  const oversizedStore = {
    ...store,
    async get() {
      return { body: createReadStream(input), contentLength: ACTION_VIDEO_MAX_BYTES + 1 };
    },
  };
  await assert.rejects(processActionVideo(oversizedStore, { sourceKey: input, outputKey: rejected }), /100 MB/);
  process.stdout.write('Vídeo da Ação: MP4 vertical, áudio ligado por padrão, remoção de áudio e metadados e limites conferidos.\n');
  if (process.argv.includes('--r2')) {
    try {
      await checkR2(input, fromR2);
      checkOutput(fromR2, false);
      await checkR2(gif, fromGifR2, true);
      checkGifOutput(fromGifR2);
      process.stdout.write('R2: vídeo e GIF fictícios convertidos, conferidos e removidos.\n');
    } catch {
      // Erros do provedor podem conter detalhes da requisição autenticada.
      process.stderr.write('Falha ao converter, conferir ou limpar o vídeo fictício no R2. Confira a configuração do serviço.\n');
      process.exitCode = 1;
    }
  }
} finally {
  await Promise.all([input, silent, audible, long, rejected, fromR2, gif, fromGif, fromGifR2].map((path) => rm(path, { force: true })));
  await rmdir(root);
}
