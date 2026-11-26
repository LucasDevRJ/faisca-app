import { randomUUID } from 'node:crypto';
import { createPrivateFileStore, readPrivateFileStorageConfig } from '../src/lib/private-file-store.js';

async function checkStorage(config: ReturnType<typeof readPrivateFileStorageConfig>) {
  const store = createPrivateFileStore(config);
  const key = `probe/${randomUUID()}`;
  const content = Buffer.from('faisca-probe');
  try {
    try {
      await store.put(key, { body: content, contentType: 'application/octet-stream', contentLength: content.byteLength });
      const file = await store.get(key, 'bytes=0-5');
      const received = await file.body.transformToString();
      if (file.contentRange !== `bytes 0-5/${content.byteLength}` || received !== 'faisca') {
        throw new Error('A leitura parcial do arquivo de teste retornou um conteúdo inesperado.');
      }
      const listed = [];
      for await (const item of store.list(key)) listed.push(item);
      if (listed.length !== 1 || listed[0] !== key) throw new Error('O arquivo de teste não apareceu na listagem.');
    } finally {
      await store.delete(key);
    }
    for await (const item of store.list(key)) {
      if (item === key) throw new Error('O arquivo de teste ainda existe.');
    }
  } finally {
    store.close();
  }
}

const config = readPrivateFileStorageConfig(process.env);
try {
  await checkStorage(config);
  process.stdout.write('R2: gravação autenticada, leitura parcial, listagem e remoção conferidas.\n');
} catch (error) {
  // Erros do provedor podem conter detalhes da requisição autenticada.
  const code = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
  const known = [
    'AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch', 'NoSuchBucket', 'TimeoutError',
    'Forbidden', 'NotFound', 'InvalidArgument', 'InvalidRequest', 'UnknownError', 'ENOTFOUND',
  ];
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
  const reason = typeof code === 'string' && known.includes(code)
    ? ` (${code})`
    : typeof status === 'number' ? ` (HTTP ${status})` : '';
  process.stderr.write(`Falha na verificação do R2 privado${reason}. Confira o bucket, as permissões e a conectividade.\n`);
  process.exitCode = 1;
}
