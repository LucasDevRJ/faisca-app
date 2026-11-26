import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, rmdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { processActionVideo } from '../src/lib/action-video-processing.js';
import { ACTION_VIDEO_MAX_BYTES } from '../src/lib/action-video.js';

const root = await mkdtemp(join(tmpdir(), 'faisca-video-'));
const input = join(root, 'entrada.mov');
const silent = join(root, 'sem-audio.mp4');
const audible = join(root, 'com-audio.mp4');
const long = join(root, 'longo.mp4');
const rejected = join(root, 'rejeitado.mp4');
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

  async function checkOutput(output: string, keepAudio?: boolean) {
    await processActionVideo(store, { sourceKey: input, outputKey: output, keepAudio });
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

  await checkOutput(silent, false);
  await checkOutput(audible);

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
} finally {
  await Promise.all([input, silent, audible, long, rejected].map((path) => rm(path, { force: true })));
  await rmdir(root);
}
