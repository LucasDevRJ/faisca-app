import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { copyVideoSnapshot, restoreVideoSnapshot, videoSnapshotPrefix } from '../src/lib/action-video-backup.js';
import { createPrivateFileStore, readPrivateFileStorageConfig } from '../src/lib/private-file-store.js';

const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ });
const setting = z.string().trim().min(1);
const usage = z.union([
  z.tuple([z.literal('copy')]),
  z.tuple([z.enum(['restore-storage', 'restore-database']), z.uuid()]),
]);

function databaseIdentity(url: string) {
  const parsed = new URL(databaseUrl.parse(url));
  return [parsed.hostname.toLowerCase(), parsed.port || '5432', decodeURIComponent(parsed.pathname)].join('/');
}

async function listReadyVideos(url: string) {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl.parse(url) }) });
  try {
    const videos = await prisma.actionVideo.findMany({
      where: { state: 'READY', OR: [{ actionId: { not: null } }, { activityId: { not: null } }], outputVersion: { not: null } },
      select: { id: true, outputVersion: true },
      orderBy: { id: 'asc' },
    });
    return videos.flatMap(({ id, outputVersion }) => outputVersion === null ? [] : [{ id, outputVersion }]);
  } finally {
    await prisma.$disconnect();
  }
}

function runAge(args: string[], input: Buffer) {
  const { PATH, SystemRoot, WINDIR } = process.env;
  const result = spawnSync('age', args, {
    env: { PATH, SystemRoot, WINDIR },
    input,
    maxBuffer: 42 * 1024 * 1024,
    timeout: 60_000,
    windowsHide: true,
  });
  if (result.status !== 0 || !result.stdout?.length) throw new Error('Falha ao executar age.');
  return result.stdout;
}

async function main() {
  const command = usage.safeParse(process.argv.slice(2));
  if (!command.success) {
    process.stderr.write('Uso: npm run media:backup -- copy | restore-storage <id> | restore-database <id>\n');
    process.exitCode = 1;
    return;
  }

  const [operation, snapshot = randomUUID()] = command.data;
  const mediaConfig = readPrivateFileStorageConfig(process.env);
  const backupConfig = readPrivateFileStorageConfig({
    PRIVATE_FILES_R2_ENDPOINT: process.env.VIDEO_BACKUP_R2_ENDPOINT,
    PRIVATE_FILES_R2_BUCKET: process.env.VIDEO_BACKUP_R2_BUCKET,
    PRIVATE_FILES_R2_ACCESS_KEY_ID: process.env.VIDEO_BACKUP_R2_ACCESS_KEY_ID,
    PRIVATE_FILES_R2_SECRET_ACCESS_KEY: process.env.VIDEO_BACKUP_R2_SECRET_ACCESS_KEY,
  });
  if (mediaConfig.PRIVATE_FILES_R2_BUCKET === backupConfig.PRIVATE_FILES_R2_BUCKET ||
      mediaConfig.PRIVATE_FILES_R2_ACCESS_KEY_ID === backupConfig.PRIVATE_FILES_R2_ACCESS_KEY_ID) {
    throw new Error('A mídia e a cópia exigem buckets e credenciais distintos.');
  }
  const referenceUrl = setting.parse(process.env.VIDEO_BACKUP_DATABASE_URL);
  const media = createPrivateFileStore(mediaConfig);
  const backup = createPrivateFileStore(backupConfig);
  try {
    if (operation === 'copy') {
      const recipient = z.string().regex(/^age1[02-9ac-hj-np-z]{58}$/).parse(process.env.VIDEO_BACKUP_AGE_RECIPIENT);
      const videos = await listReadyVideos(referenceUrl);
      process.stdout.write(`Iniciando cópia ${videoSnapshotPrefix(snapshot)}\n`);
      await copyVideoSnapshot(media, backup, (data) => runAge(['--encrypt', '--recipient', recipient], data), snapshot, videos);
      process.stdout.write(`Cópia concluída. Vídeos: ${videos.length}.\n`);
    } else {
      const identity = setting.parse(process.env.VIDEO_RESTORE_AGE_IDENTITY_FILE);
      const authorityUrl = operation === 'restore-database'
        ? setting.parse(process.env.VIDEO_RESTORE_SOURCE_DATABASE_URL)
        : referenceUrl;
      if (operation === 'restore-database' && databaseIdentity(referenceUrl) === databaseIdentity(authorityUrl)) {
        throw new Error('O banco de referência precisa ser distinto do banco recuperado.');
      }
      const recovered = await listReadyVideos(referenceUrl);
      const authoritative = operation === 'restore-database' ? await listReadyVideos(authorityUrl) : recovered;
      const result = await restoreVideoSnapshot(backup, media, (data) => runAge(['--decrypt', '--identity', identity], data),
        snapshot, recovered, authoritative);
      process.stdout.write(`Restaurados: ${result.restored}. Presentes: ${result.existing}. Ignorados: ${result.skipped}.\n`);
    }
  } finally {
    media.close();
    backup.close();
  }
}

try {
  await main();
} catch {
  // Erros do armazenamento e do banco podem conter detalhes da conexão ou chaves de objetos.
  process.stderr.write('Falha na operação de cópia de vídeos. Confira a configuração e a disponibilidade dos serviços.\n');
  process.exitCode = 1;
}
