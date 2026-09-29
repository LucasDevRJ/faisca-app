import { describe, expect, it } from 'vitest';
import { formatLinkCode, generateLinkCode, hashLinkCode, LINK_CODE_ALPHABET, normalizeLinkCode } from './link-code.js';

describe('código de vínculo', () => {
  it('gera 8 caracteres só do alfabeto sem ambíguos', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateLinkCode();
      expect(code).toHaveLength(8);
      for (const char of code) expect(LINK_CODE_ALPHABET).toContain(char);
    }
  });

  it('o alfabeto não tem caracteres que se confundem', () => {
    for (const char of '01OILU') expect(LINK_CODE_ALPHABET).not.toContain(char);
  });

  it('normaliza o que a terapeuta digita', () => {
    expect(normalizeLinkCode('k7m4-p9qx')).toBe('K7M4P9QX');
    expect(normalizeLinkCode(' K7M4 P9QX ')).toBe('K7M4P9QX');
  });

  it('recusa formato impossível', () => {
    expect(normalizeLinkCode('K7M4-P9Q')).toBeNull();
    expect(normalizeLinkCode('K7M4-P9QXZ')).toBeNull();
    expect(normalizeLinkCode('O0I1-LUAA')).toBeNull();
  });

  it('formata com traço no meio', () => {
    expect(formatLinkCode('K7M4P9QX')).toBe('K7M4-P9QX');
  });

  it('o hash é HMAC: estável, sem o código em texto', () => {
    const hash = hashLinkCode('K7M4P9QX');
    expect(hash).toBe(hashLinkCode('K7M4P9QX'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(hashLinkCode('K7M4P9QY'));
  });
});
