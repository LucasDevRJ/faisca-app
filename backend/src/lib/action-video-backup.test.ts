import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { copyVideoSnapshot, restoreVideoSnapshot, videoSnapshotPrefix, type VideoReference } from './action-video-backup.js';
import { actionVideoOutputKey } from '../modules/actions/action-video-worker.js';

const snapshot = '00000000-0000-4000-8000-000000000001';
const retained = { id: '00000000-0000-4000-8000-000000000002', outputVersion: '00000000-0000-4000-8000-000000000003' };
const removed = { ...retained, id: '00000000-0000-4000-8000-000000000004' };
const replaced = { ...retained, id: '00000000-0000-4000-8000-000000000005' };
const newVersion = { ...replaced, outputVersion: '00000000-0000-4000-8000-000000000006' };
const sample = Buffer.from('vídeo fictício');
const roundTrip = (data: Buffer) => data;
const liveKey = ({ id, outputVersion }: VideoReference) => actionVideoOutputKey(id, outputVersion);
const archiveKey = ({ id, outputVersion }: VideoReference) => `${videoSnapshotPrefix(snapshot)}${id}/${outputVersion}.mp4.age`;

function memoryStore(videos: VideoReference[] = []) {
  const entries = new Map<string, Buffer>(videos.map((video) => [liveKey(video), sample]));
  return {
    entries,
    async exists(key: string) {
      return entries.has(key);
    },
    async get(key: string) {
      const entry = entries.get(key);
      if (!entry) throw new Error('Objeto ausente.');
      return { body: Readable.from([entry]), contentLength: entry.length };
    },
    async put(key: string, { body }: { body: Buffer }, { ifMissing = false } = {}) {
      if (ifMissing && entries.has(key)) throw Object.assign(new Error('Objeto existente.'), { $metadata: { httpStatusCode: 412 } });
      entries.set(key, body);
    },
  };
}

describe('cópia dos vídeos da Ação', () => {
  it('restaura a versão confirmada pela base atual e ignora vídeos apagados ou substituídos', async () => {
    const recovered = [retained, removed, replaced];
    const backup = memoryStore();
    await copyVideoSnapshot(memoryStore(recovered), backup, roundTrip, snapshot, recovered);

    const destination = memoryStore();
    const result = await restoreVideoSnapshot(backup, destination, roundTrip, snapshot, recovered, [retained, newVersion]);
    expect(result).toEqual({ restored: 1, existing: 0, skipped: 2 });
    expect([...destination.entries]).toEqual([[liveKey(retained), sample]]);
  });

  it('preserva o arquivo existente mesmo se a restauração for repetida', async () => {
    const backup = memoryStore();
    await copyVideoSnapshot(memoryStore([retained]), backup, roundTrip, snapshot, [retained]);

    const destination = memoryStore();
    const existing = Buffer.from('outro arquivo fictício');
    destination.entries.set(liveKey(retained), existing);
    const result = await restoreVideoSnapshot(backup, destination, roundTrip, snapshot, [retained], [retained]);
    expect(result).toEqual({ restored: 0, existing: 1, skipped: 0 });
    expect(destination.entries.get(liveKey(retained))).toBe(existing);
  });

  it('interrompe a restauração se o destino já contiver um vídeo excluído', async () => {
    const recovered = [retained, removed];
    const backup = memoryStore();
    await copyVideoSnapshot(memoryStore(recovered), backup, roundTrip, snapshot, recovered);

    const destination = memoryStore([removed]);
    await expect(restoreVideoSnapshot(backup, destination, roundTrip, snapshot, recovered, [retained]))
      .rejects.toThrow('O destino contém um vídeo fora das referências atuais.');
    expect([...destination.entries.keys()]).toEqual([liveKey(removed)]);
  });

  it('recusa uma cópia interrompida antes de publicar o inventário', async () => {
    const backup = memoryStore();
    await expect(copyVideoSnapshot(memoryStore([retained]), backup, roundTrip, snapshot, [retained, removed]))
      .rejects.toThrow('Objeto ausente.');
    expect(backup.entries.has(archiveKey(retained))).toBe(true);

    const destination = memoryStore();
    await expect(restoreVideoSnapshot(backup, destination, roundTrip, snapshot, [retained], [retained]))
      .rejects.toThrow('Objeto ausente.');
    expect(destination.entries.size).toBe(0);
  });

  it('recusa uma cópia que devolve o arquivo de outra referência', async () => {
    const backup = memoryStore();
    await copyVideoSnapshot(memoryStore([retained, removed]), backup, roundTrip, snapshot, [retained, removed]);
    backup.entries.set(archiveKey(retained), backup.entries.get(archiveKey(removed))!);

    const destination = memoryStore();
    await expect(restoreVideoSnapshot(backup, destination, roundTrip, snapshot, [retained], [retained]))
      .rejects.toThrow('O vídeo não corresponde à referência da cópia.');
    expect(destination.entries.size).toBe(0);
  });
});
