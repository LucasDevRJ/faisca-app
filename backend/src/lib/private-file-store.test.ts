import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createPrivateFileStore, readPrivateFileStorageConfig } from './private-file-store.js';

const sdk = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }));
vi.mock('@aws-sdk/client-s3', async (importOriginal) => ({
  ...await importOriginal<typeof import('@aws-sdk/client-s3')>(),
  S3Client: class {
    send = sdk.send;
    destroy = sdk.destroy;
  },
}));

const fakeConfig = {
  PRIVATE_FILES_R2_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
  PRIVATE_FILES_R2_BUCKET: 'faisca-media-teste',
  PRIVATE_FILES_R2_ACCESS_KEY_ID: 'somente-teste',
  PRIVATE_FILES_R2_SECRET_ACCESS_KEY: 'segredo-ficticio',
};

describe('armazenamento privado de arquivos', () => {
  it('recusa o Access Key ID usado como identificador da conta no endpoint', () => {
    expect(() => readPrivateFileStorageConfig({
      ...fakeConfig, PRIVATE_FILES_R2_ACCESS_KEY_ID: 'a'.repeat(32),
    })).toThrow('PRIVATE_FILES_R2_ENDPOINT');
  });

  it('recusa um endpoint diferente do R2, o bucket de backup e credenciais de exemplo', () => {
    expect(() => readPrivateFileStorageConfig({
      ...fakeConfig,
      PRIVATE_FILES_R2_ENDPOINT: 'https://host-ficticio.test',
      PRIVATE_FILES_R2_BUCKET: 'faisca-backup',
      PRIVATE_FILES_R2_SECRET_ACCESS_KEY: 'CHANGE_ME',
    })).toThrow(/PRIVATE_FILES_R2_ENDPOINT, PRIVATE_FILES_R2_BUCKET, PRIVATE_FILES_R2_SECRET_ACCESS_KEY/);
  });

  it('grava sem cache, preserva os parâmetros de leitura parcial e remove o objeto', async () => {
    const key = 'probe/ficticio';
    const content = Buffer.from('exemplo');
    const stream = Readable.from([Buffer.from('exe')]);
    sdk.send.mockResolvedValueOnce({}).mockResolvedValueOnce({
      Body: stream,
      ContentType: 'application/octet-stream',
      ContentLength: 3,
      ContentRange: 'bytes 0-2/7',
    }).mockResolvedValueOnce({});
    const store = createPrivateFileStore(readPrivateFileStorageConfig(fakeConfig));
    await store.put(key, { body: content, contentType: 'application/octet-stream', contentLength: content.length });
    expect(await store.get(key, 'bytes=0-2')).toEqual({
      body: stream,
      contentType: 'application/octet-stream',
      contentLength: 3,
      contentRange: 'bytes 0-2/7',
    });
    await store.delete(key);
    store.close();

    expect(sdk.send.mock.calls.map(([command]) => command.input)).toEqual([
      { Bucket: fakeConfig.PRIVATE_FILES_R2_BUCKET, Key: key, Body: content, ContentType: 'application/octet-stream',
        ContentLength: content.length, CacheControl: 'private, no-store' },
      { Bucket: fakeConfig.PRIVATE_FILES_R2_BUCKET, Key: key, Range: 'bytes=0-2' },
      { Bucket: fakeConfig.PRIVATE_FILES_R2_BUCKET, Key: key },
    ]);
    expect(sdk.destroy).toHaveBeenCalledOnce();
  });
});
