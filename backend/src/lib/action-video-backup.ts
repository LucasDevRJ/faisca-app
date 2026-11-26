import { z } from 'zod';
import { addAbortSignal, type Readable } from 'node:stream';
import { actionVideoOutputKey } from '../modules/actions/action-video-worker.js';

const referenceSchema = z.strictObject({ id: z.uuid(), outputVersion: z.uuid() });
const inventorySchema = z.array(referenceSchema);
export type VideoReference = z.infer<typeof referenceSchema>;

type FileStore = {
  get(key: string): Promise<{ body: Readable; contentLength?: number }>;
  put(
    key: string,
    file: { body: Buffer; contentType: string; contentLength: number },
    options?: { ifMissing: boolean },
  ): Promise<void>;
};

export type VideoBackupCrypto = {
  encrypt(body: Buffer): Buffer;
  decrypt(body: Buffer): Buffer;
};

// Limite de uma saída da conversão, com folga para o teto de 60 segundos a 2,5 Mb/s.
const maxVideo = 40 * 1024 * 1024;
const maxInventory = 4 * 1024 * 1024;
const encryptionAllowance = 256 * 1024;

export function videoSnapshotPrefix(snapshot: string) {
  return `action-video-backup/v1/${z.uuid().parse(snapshot)}/`;
}

function objectKey(video: VideoReference) {
  const { id, outputVersion } = referenceSchema.parse(video);
  return actionVideoOutputKey(id, outputVersion);
}

function archiveKey(prefix: string, video: VideoReference) {
  return `${prefix}${video.id}/${video.outputVersion}.mp4.age`;
}

async function readBounded(store: FileStore, key: string, max: number) {
  const { body, contentLength } = await store.get(key);
  try {
    if (contentLength !== undefined && contentLength > max) throw new Error('Arquivo acima do limite da cópia de vídeo.');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of addAbortSignal(AbortSignal.timeout(120_000), body)) {
      if (!(chunk instanceof Uint8Array)) throw new Error('Arquivo da cópia retornou conteúdo inválido.');
      bytes += chunk.byteLength;
      if (bytes > max) throw new Error('Arquivo acima do limite da cópia de vídeo.');
      chunks.push(chunk);
    }
    if (!bytes || (contentLength !== undefined && bytes !== contentLength)) {
      throw new Error('Arquivo da cópia incompleto.');
    }
    return Buffer.concat(chunks, bytes);
  } finally {
    body.destroy();
  }
}

function storeEncrypted(store: FileStore, key: string, data: Buffer) {
  return store.put(key, { body: data, contentLength: data.byteLength, contentType: 'application/octet-stream' },
    { ifMissing: true });
}

// O inventário só é gravado depois de todos os vídeos. Sem ele, a cópia está incompleta.
export async function copyVideoSnapshot(
  source: FileStore,
  backup: FileStore,
  encrypt: VideoBackupCrypto['encrypt'],
  snapshot: string,
  references: readonly VideoReference[],
) {
  const prefix = videoSnapshotPrefix(snapshot);
  const videos = inventorySchema.parse(references);
  const inventory = Buffer.from(JSON.stringify({ snapshot, videos }));
  if (inventory.length > maxInventory) throw new Error('Inventário de vídeo acima do limite.');
  for (const video of videos) {
    const key = objectKey(video);
    const bytes = await readBounded(source, key, maxVideo);
    // A identidade dentro do arquivo cifrado detecta a troca acidental de arquivos entre referências.
    const data = Buffer.concat([Buffer.from(`${snapshot}/${key}\n`), bytes]);
    await storeEncrypted(backup, archiveKey(prefix, video), encrypt(data));
  }
  await storeEncrypted(backup, `${prefix}inventory.json.age`, encrypt(inventory));
}

export async function restoreVideoSnapshot(
  backup: FileStore,
  destination: FileStore & { exists(key: string): Promise<boolean> },
  decrypt: VideoBackupCrypto['decrypt'],
  snapshot: string,
  recovered: readonly VideoReference[],
  authoritative: readonly VideoReference[],
) {
  const prefix = videoSnapshotPrefix(snapshot);
  const inventory = z.strictObject({ snapshot: z.literal(snapshot), videos: inventorySchema }).parse(JSON.parse(decrypt(
    await readBounded(backup, `${prefix}inventory.json.age`, maxInventory + encryptionAllowance),
  ).toString()));
  const included = new Set(inventory.videos.map(objectKey));
  const allowed = new Set(authoritative.map(objectKey));
  for (const video of recovered) {
    const key = objectKey(video);
    if (!allowed.has(key) && await destination.exists(key)) {
      throw new Error('O destino contém um vídeo fora das referências atuais. Use um bucket de recuperação isolado.');
    }
  }
  let restored = 0;
  let existing = 0;
  let skipped = 0;
  for (const video of recovered) {
    const key = objectKey(video);
    if (!included.has(key) || !allowed.has(key)) {
      skipped++;
      continue;
    }
    const ciphertext = await readBounded(backup, archiveKey(prefix, video), maxVideo + encryptionAllowance);
    const decoded = decrypt(ciphertext);
    const header = Buffer.from(`${snapshot}/${key}\n`);
    if (!decoded.subarray(0, header.length).equals(header)) throw new Error('O vídeo não corresponde à referência da cópia.');
    const body = decoded.subarray(header.length);
    if (!body.length || body.length > maxVideo) throw new Error('O vídeo da cópia tem tamanho inválido.');
    try {
      await destination.put(key, { body, contentType: 'video/mp4', contentLength: body.byteLength }, { ifMissing: true });
      restored++;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
      // Se já existe um arquivo com esta versão, preserve-o. Uma disputa de gravação continua sendo erro.
      if (status !== 412) throw error;
      existing++;
    }
  }
  return { restored, existing, skipped };
}
