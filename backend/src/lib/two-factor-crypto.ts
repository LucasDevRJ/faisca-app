import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt } from 'node:crypto';
import { env } from '../config/env.js';

// Segredos do 2FA (DEC-092). Uma chave de ambiente só (TWO_FACTOR_SECRET), fora do banco, de
// onde saem duas: uma para cifrar o segredo do app autenticador (AES-256-GCM) e outra para o
// HMAC dos códigos (por e-mail e de recuperação), que têm pouca entropia. Quem tiver uma cópia
// do banco não lê os segredos nem testa os códigos sem a chave.

function subkey(purpose: string): Buffer {
  const master = env.TWO_FACTOR_SECRET;
  if (!master) throw new Error('TWO_FACTOR_SECRET não configurada');
  return Buffer.from(hkdfSync('sha256', master, 'faisca-2fa', purpose, 32));
}

export function twoFactorConfigured(): boolean {
  return Boolean(env.TWO_FACTOR_SECRET);
}

// Formato guardado: "v1.<iv>.<tag>.<texto cifrado>", em base64url. A conta entra como dado
// associado (AAD): um segredo copiado para outra conta não abre. Tag sempre de 16 bytes.
export function encryptSecret(plain: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', subkey('totp-secret'), iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(userId, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), ciphertext].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join('.');
}

export function decryptSecret(stored: string, userId: string): string {
  const [version, iv, tag, ciphertext] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Segredo em formato desconhecido');
  const authTag = Buffer.from(tag, 'base64url');
  if (authTag.length !== 16) throw new Error('Segredo em formato desconhecido');
  const decipher = createDecipheriv('aes-256-gcm', subkey('totp-secret'), Buffer.from(iv, 'base64url'), {
    authTagLength: 16,
  });
  decipher.setAAD(Buffer.from(userId, 'utf8'));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

export function hashCode(code: string): string {
  return createHmac('sha256', subkey('codes')).update(code).digest('hex');
}

// Código por e-mail: 6 números.
export function generateEmailCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// Códigos de recuperação: 10 códigos de 8 caracteres sem os ambíguos (como os de vínculo),
// mostrados como "K7M4-P9QX". Cerca de 39 bits cada, guardados só com HMAC.
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return code;
}

// Aceita minúsculas, traço e espaços; null = formato impossível.
export function normalizeRecoveryCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return new RegExp(`^[${RECOVERY_ALPHABET}]{8}$`).test(code) ? code : null;
}

export function formatRecoveryCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
