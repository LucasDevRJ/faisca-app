import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';
import { env } from '../config/env.js';

export type PushSubscriptionTarget = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushMessage = {
  title: string;
  body: string;
  url: string;
};

export type PushSendResult = 'sent' | 'expired' | 'failed';

// Interface para os testes trocarem o envio real por um sender em memória (como o Mailer).
export interface PushSender {
  readonly configured: boolean;
  readonly publicKey: string | null;
  send(target: PushSubscriptionTarget, message: PushMessage): Promise<PushSendResult>;
}

// Domínios oficiais dos serviços de Web Push dos navegadores (Chrome/Android/Edge, Firefox,
// Safari/iOS e Windows). Impede SSRF: a API nunca faz requisição para um endereço arbitrário
// enviado no corpo da inscrição.
const ALLOWED_PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/i,
  /^(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com$/i,
  /^(?:[a-z0-9-]+\.)+push\.apple\.com$/i,
  /^(?:[a-z0-9-]+\.)+notify\.windows\.com$/i,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length < 12 || endpoint.length > 2048) return false;
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.port !== '' || parsed.username !== '' || parsed.password !== '') return false;
  if (!parsed.pathname || parsed.pathname === '/') return false;
  return ALLOWED_PUSH_HOSTS.some((pattern) => pattern.test(parsed.hostname));
}

// Confere se p256dh é um ponto P-256 não comprimido válido (65 bytes começando por 0x04, na curva)
// e se auth tem pelo menos 16 bytes em base64url.
export function isValidPushKeys(p256dh: string, auth: string): boolean {
  if (!/^[A-Za-z0-9_-]{80,120}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,64}$/.test(auth)) {
    return false;
  }
  try {
    const pub = Buffer.from(p256dh, 'base64url');
    const authBuf = Buffer.from(auth, 'base64url');
    if (pub.length !== 65 || pub[0] !== 0x04 || authBuf.length < 16) return false;
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    // computeSecret valida que o ponto público do navegador pertence à curva P-256.
    ecdh.computeSecret(pub);
    return true;
  } catch {
    return false;
  }
}

// Gera um par de chaves VAPID P-256 no formato base64url (65 bytes pública, 32 bytes privada).
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: ecdh.getPrivateKey().toString('base64url'),
  };
}

// RFC 8292: cabeçalho Authorization VAPID assinado com ES256 (P-256 + SHA-256 em formato IEEE P1363).
export function createVapidAuthorization(
  endpointOrigin: string,
  subject: string,
  publicKeyBase64Url: string,
  privateKeyBase64Url: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const pub = Buffer.from(publicKeyBase64Url, 'base64url');
  const priv = Buffer.from(privateKeyBase64Url, 'base64url');
  if (pub.length !== 65 || pub[0] !== 0x04 || priv.length !== 32) {
    throw new Error('Chaves VAPID em formato inválido');
  }
  const x = pub.subarray(1, 33).toString('base64url');
  const y = pub.subarray(33, 65).toString('base64url');
  const d = priv.toString('base64url');
  const key = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x, y, d },
    format: 'jwk',
  });

  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      aud: endpointOrigin,
      exp: nowSeconds + 12 * 60 * 60,
      sub: subject,
    }),
  ).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');

  return `vapid t=${signingInput}.${signature}, k=${publicKeyBase64Url}`;
}

// RFC 8291 + RFC 8188: criptografia de carga útil Web Push no formato aes128gcm.
export function encryptWebPushPayload(
  plaintext: string,
  clientPublicKeyBase64Url: string,
  clientAuthBase64Url: string,
): Buffer {
  const uaPublic = Buffer.from(clientPublicKeyBase64Url, 'base64url');
  const authSecret = Buffer.from(clientAuthBase64Url, 'base64url');
  const serverEcdh = createECDH('prime256v1');
  serverEcdh.generateKeys();
  const asPublic = serverEcdh.getPublicKey();
  const sharedSecret = serverEcdh.computeSecret(uaPublic);
  const salt = randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'ascii'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12),
  );

  // Delimitador 0x02 do último registro (RFC 8188 §2).
  const padded = Buffer.concat([Buffer.from(plaintext, 'utf8'), Buffer.from([2])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  // Cabeçalho aes128gcm (86 bytes): salt (16B) || rs=4096 (4B BE) || idlen=65 (1B) || asPublic (65B).
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);

  return Buffer.concat([header, asPublic, ciphertext]);
}

export function createWebPushSender(): PushSender {
  const publicKey = env.VAPID_PUBLIC_KEY ?? null;
  const privateKey = env.VAPID_PRIVATE_KEY ?? null;
  const subject = env.VAPID_SUBJECT ?? null;
  const configured = Boolean(publicKey && privateKey && subject);

  return {
    configured,
    publicKey,
    async send(target, message): Promise<PushSendResult> {
      if (!publicKey || !privateKey || !subject) return 'failed';
      if (!isAllowedPushEndpoint(target.endpoint) || !isValidPushKeys(target.p256dh, target.auth)) {
        return 'failed';
      }
      try {
        const origin = new URL(target.endpoint).origin;
        const authorization = createVapidAuthorization(origin, subject, publicKey, privateKey);
        const body = encryptWebPushPayload(JSON.stringify(message), target.p256dh, target.auth);
        const response = await fetch(target.endpoint, {
          method: 'POST',
          headers: {
            Authorization: authorization,
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: '86400',
            Urgency: 'normal',
          },
          body: new Uint8Array(body),
          // Nunca seguir redirecionamento (defesa contra SSRF).
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status >= 200 && response.status < 300) return 'sent';
        if (response.status === 404 || response.status === 410) return 'expired';
        return 'failed';
      } catch {
        return 'failed';
      }
    },
  };
}
