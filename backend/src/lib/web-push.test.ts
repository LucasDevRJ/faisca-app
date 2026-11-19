import { createDecipheriv, createECDH, createPublicKey, hkdfSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createVapidAuthorization,
  encryptWebPushPayload,
  generateVapidKeys,
  isAllowedPushEndpoint,
  isValidPushKeys,
  padP256PrivateKey,
} from './web-push.js';

// Chave privada fixa cujo primeiro byte é zero. Sem esse zero ela tem 31 bytes, como o Node
// devolve em getPrivateKey() em cerca de 1 a cada 256 chaves: o caso que fazia o teste do VAPID
// falhar de vez em quando. O vetor curto é montado à mão para não depender do Node.
function shortPrivateKeyPair() {
  const scalar = Buffer.concat([
    Buffer.from([0x00]),
    Buffer.from(Array.from({ length: 31 }, (_, i) => i + 1)),
  ]);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(scalar);
  return { ecdh, scalar, short: scalar.subarray(1) };
}

describe('web-push (VAPID, aes128gcm e validação de endpoint)', () => {
  it('aceita apenas endpoints HTTPS dos serviços oficiais de Web Push e barra SSRF', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc123')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/Qabc123')).toBe(true);
    expect(isAllowedPushEndpoint('https://wns2-bl2p.notify.windows.com/w/?token=abc')).toBe(true);

    // SSRF e endereços inválidos:
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/fcm/send/abc')).toBe(false);
    expect(isAllowedPushEndpoint('https://user:pass@fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isAllowedPushEndpoint('https://localhost:3333/internal')).toBe(false);
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedPushEndpoint('https://evil.example.com/fcm.googleapis.com')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/')).toBe(false);
  });

  it('valida chaves P-256 e segredo auth da inscrição do navegador', () => {
    const client = generateVapidKeys();
    const auth = Buffer.alloc(16, 7).toString('base64url');
    expect(isValidPushKeys(client.publicKey, auth)).toBe(true);

    expect(isValidPushKeys('invalida', auth)).toBe(false);
    expect(isValidPushKeys(client.publicKey, 'curto')).toBe(false);
  });

  it('gera cabeçalho VAPID ES256 e criptografa carga aes128gcm decifrável pelo receptor', () => {
    const vapid = generateVapidKeys();
    const header = createVapidAuthorization(
      'https://fcm.googleapis.com',
      'mailto:contato@minhafaisca.com.br',
      vapid.publicKey,
      vapid.privateKey,
      1_700_000_000,
    );
    expect(header).toMatch(/^vapid t=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+, k=[A-Za-z0-9_-]+$/);

    // Simula o navegador decifrando a mensagem (RFC 8291):
    const uaEcdh = createECDH('prime256v1');
    uaEcdh.generateKeys();
    const uaPublic = uaEcdh.getPublicKey();
    const authSecret = Buffer.alloc(16, 42);

    const payload = JSON.stringify({
      title: 'Faísca',
      body: 'Bom dia! Você planejou algo para hoje no Faísca. Quando quiser, passe por lá.',
      url: '/registros',
    });
    const encrypted = encryptWebPushPayload(
      payload,
      uaPublic.toString('base64url'),
      authSecret.toString('base64url'),
    );

    const salt = encrypted.subarray(0, 16);
    const rs = encrypted.readUInt32BE(16);
    const idlen = encrypted.readUInt8(20);
    expect(rs).toBe(4096);
    expect(idlen).toBe(65);

    const asPublic = encrypted.subarray(21, 21 + idlen);
    const body = encrypted.subarray(21 + idlen);
    const ciphertext = body.subarray(0, body.length - 16);
    const tag = body.subarray(body.length - 16);

    const shared = uaEcdh.computeSecret(asPublic);
    const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'ascii'), uaPublic, asPublic]);
    const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
    const cek = Buffer.from(
      hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16),
    );
    const nonce = Buffer.from(
      hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12),
    );

    const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
    decipher.setAuthTag(tag);
    const decryptedPadded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    expect(decryptedPadded[decryptedPadded.length - 1]).toBe(2);
    const decryptedText = decryptedPadded.subarray(0, decryptedPadded.length - 1).toString('utf8');
    expect(decryptedText).toBe(payload);
  });

  it('completa com zeros à esquerda a chave privada que o Node devolve com menos de 32 bytes', () => {
    const { scalar, short } = shortPrivateKeyPair();
    expect(short.length).toBe(31);

    const padded = padP256PrivateKey(short);
    expect(padded.length).toBe(32);
    expect(padded.equals(scalar)).toBe(true);

    expect(() => padP256PrivateKey(Buffer.alloc(0))).toThrow('Chaves VAPID em formato inválido');
    expect(() => padP256PrivateKey(Buffer.alloc(33, 1))).toThrow('Chaves VAPID em formato inválido');
  });

  it('gera o cabeçalho VAPID com chave privada curta (já configurada sem os zeros) e a assinatura confere', () => {
    const { ecdh, scalar, short } = shortPrivateKeyPair();
    const publicKey = ecdh.getPublicKey().toString('base64url');
    const shortPrivateKey = short.toString('base64url');
    const paddedPrivateKey = scalar.toString('base64url');

    for (const privateKey of [shortPrivateKey, paddedPrivateKey]) {
      const header = createVapidAuthorization(
        'https://fcm.googleapis.com',
        'mailto:contato@minhafaisca.com.br',
        publicKey,
        privateKey,
        1_700_000_000,
      );
      const match = /^vapid t=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(header);
      expect(match).not.toBeNull();
      const [, signingInput = '', signature = '', k = ''] = match ?? [];
      expect(k).toBe(publicKey);

      const pub = Buffer.from(publicKey, 'base64url');
      const verifier = createPublicKey({
        key: {
          kty: 'EC',
          crv: 'P-256',
          x: pub.subarray(1, 33).toString('base64url'),
          y: pub.subarray(33, 65).toString('base64url'),
        },
        format: 'jwk',
      });
      const ok = verify(
        'sha256',
        Buffer.from(signingInput),
        { key: verifier, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      );
      expect(ok).toBe(true);
    }
  });

  it('generateVapidKeys sempre devolve a chave privada com 32 bytes', () => {
    // Com 2.000 chaves, a chance de não aparecer nenhuma curta é menor que 0,05%; o caso curto em
    // si é coberto de forma determinística pelos testes acima.
    for (let i = 0; i < 2000; i++) {
      const { privateKey } = generateVapidKeys();
      expect(Buffer.from(privateKey, 'base64url').length).toBe(32);
    }
  });
});
