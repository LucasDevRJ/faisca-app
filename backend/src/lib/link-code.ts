import { createHmac, randomInt } from 'node:crypto';
import { env } from '../config/env.js';

// Códigos de vínculo (SPEC, "Código de vínculo"): 8 caracteres, sem os ambíguos (0/O, 1/I/L, U/V).
// São 30 símbolos: 30^8 ≈ 6,6 × 10^11 combinações, cerca de 39 bits.
export const LINK_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const LINK_CODE_LENGTH = 8;

const VALID_CODE = new RegExp(`^[${LINK_CODE_ALPHABET}]{${LINK_CODE_LENGTH}}$`);

// Forma guardada e comparada: 8 caracteres, maiúsculos e sem traço (ex.: 'K7M4P9QX').
export function generateLinkCode(): string {
  let code = '';
  // randomInt usa o gerador criptográfico e não tem viés de módulo.
  for (let i = 0; i < LINK_CODE_LENGTH; i++) code += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
  return code;
}

// Aceita o que a terapeuta digitar: minúsculas, traço e espaços. null = formato impossível.
export function normalizeLinkCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return VALID_CODE.test(code) ? code : null;
}

// Como o código aparece na tela: 'K7M4-P9QX'.
export function formatLinkCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// HMAC em vez de SHA-256 puro: com só 39 bits, quem tivesse uma cópia do banco testaria todas
// as combinações de um hash simples em pouco tempo. Sem a chave, que fica fora do banco, não dá.
export function hashLinkCode(code: string): string {
  return createHmac('sha256', env.LINK_CODE_SECRET).update(code).digest('hex');
}
