import { setTimeout } from 'node:timers/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createPrivateFileStore, readPrivateFileStorageConfig } from '../src/lib/private-file-store.js';
import { createActionVideoWorker } from '../src/modules/actions/action-video-worker.js';

const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ }).safeParse(process.env.DATABASE_URL);
if (!databaseUrl.success) throw new Error('DATABASE_URL do worker de vídeo ausente ou inválida.');
const store = createPrivateFileStore(readPrivateFileStorageConfig(process.env));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl.data }) });
const worker = createActionVideoWorker(prisma, store);
let stopping = false;
const stop = () => { stopping = true; };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

try {
  while (!stopping) {
    let worked = false;
    try {
      worked = await worker.runOnce();
    } catch {
      process.stderr.write('Falha no processamento de vídeos. A fila será consultada novamente.\n');
    }
    if (!worked && !stopping) await setTimeout(5000);
  }
} finally {
  store.close();
  await prisma.$disconnect();
}
