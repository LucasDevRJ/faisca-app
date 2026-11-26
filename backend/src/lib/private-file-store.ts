import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { z } from 'zod';

const setting = z.string().trim().min(1).refine((value) => !value.startsWith('CHANGE_ME'));
const storageConfig = z.object({
  PRIVATE_FILES_R2_ENDPOINT: setting.pipe(
    z.string().regex(/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com\/?$/),
  ),
  PRIVATE_FILES_R2_BUCKET: setting.pipe(
    z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/).refine((name) => name !== 'faisca-backup'),
  ),
  PRIVATE_FILES_R2_ACCESS_KEY_ID: setting,
  PRIVATE_FILES_R2_SECRET_ACCESS_KEY: setting,
}).refine(
  (config) => !config.PRIVATE_FILES_R2_ENDPOINT.startsWith(`https://${config.PRIVATE_FILES_R2_ACCESS_KEY_ID}.`),
  { path: ['PRIVATE_FILES_R2_ENDPOINT'], message: 'Use o ID da conta no endpoint S3, separado do Access Key ID.' },
);

type StorageConfig = z.infer<typeof storageConfig>;

export function readPrivateFileStorageConfig(source: NodeJS.ProcessEnv): StorageConfig {
  const result = storageConfig.safeParse(source);
  if (!result.success) {
    const keys = Object.keys(z.flattenError(result.error).fieldErrors);
    throw new Error(`Configuração de arquivos privados ausente ou inválida: ${keys.join(', ')}`);
  }
  return result.data;
}

type PrivateFileUpload = {
  body: Buffer | Readable;
  contentType: string;
  contentLength: number;
};

// A autorização fica no serviço de cada área. O armazenamento recebe só chaves opacas,
// sem nome original ou identificador de paciente.
export function createPrivateFileStore(config: StorageConfig) {
  const bucket = config.PRIVATE_FILES_R2_BUCKET;
  const client = new S3Client({
    endpoint: config.PRIVATE_FILES_R2_ENDPOINT,
    region: 'auto',
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.PRIVATE_FILES_R2_ACCESS_KEY_ID,
      secretAccessKey: config.PRIVATE_FILES_R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return {
    async put(key: string, file: PrivateFileUpload, { ifMissing = false } = {}) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.body,
        ContentType: file.contentType,
        ContentLength: file.contentLength,
        CacheControl: 'private, no-store',
        ...(ifMissing ? { IfNoneMatch: '*' } : {}),
      }), { abortSignal: AbortSignal.timeout(120_000) });
    },
    async get(key: string, range?: string) {
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }), {
        abortSignal: AbortSignal.timeout(120_000),
      });
      if (!(object.Body instanceof Readable)) throw new Error('O arquivo privado retornou sem um fluxo de leitura.');
      return {
        body: object.Body,
        contentType: object.ContentType,
        contentLength: object.ContentLength,
        contentRange: object.ContentRange,
      };
    },
    async delete(key: string) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(30_000),
      });
    },
    async exists(key: string) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(30_000) });
        return true;
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
        if (status !== 404) throw error;
        return false;
      }
    },
    async *list(prefix: string) {
      let cursor: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({
          Bucket: bucket, Prefix: prefix, ContinuationToken: cursor,
        }), { abortSignal: AbortSignal.timeout(30_000) });
        for (const object of page.Contents ?? []) {
          if (object.Key?.startsWith(prefix)) yield object.Key;
        }
        cursor = page.NextContinuationToken;
      } while (cursor);
    },
    close() {
      client.destroy();
    },
  };
}
