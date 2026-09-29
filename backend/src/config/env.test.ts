import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

// Valores fictícios, só para validar o formato.
const valid = {
  FRONTEND_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://faisca_app:ficticia@localhost:5434/faisca',
  JWT_SECRET: 'segredo-ficticio-com-mais-de-32-caracteres',
  LINK_CODE_SECRET: 'outro-segredo-ficticio-com-mais-de-32-caracteres',
  RESEND_API_KEY: 're_ficticia',
  EMAIL_FROM: 'Faísca <onboarding@resend.dev>',
};

describe('parseEnv', () => {
  it('aceita uma configuração válida', () => {
    expect(parseEnv(valid).EMAIL_FROM).toBe('Faísca <onboarding@resend.dev>');
  });

  it('recusa o JWT_SECRET de exemplo do .env.example', () => {
    expect(() => parseEnv({ ...valid, JWT_SECRET: 'CHANGE_ME_gere_com_openssl_rand_base64_48' })).toThrow(
      'JWT_SECRET',
    );
  });

  it('recusa o LINK_CODE_SECRET de exemplo e o curto demais', () => {
    expect(() => parseEnv({ ...valid, LINK_CODE_SECRET: 'CHANGE_ME_gere_com_openssl_rand_base64_48' })).toThrow(
      'LINK_CODE_SECRET',
    );
    expect(() => parseEnv({ ...valid, LINK_CODE_SECRET: 'curto' })).toThrow('LINK_CODE_SECRET');
  });

  it('recusa o remetente de exemplo (seu-dominio.com)', () => {
    expect(() => parseEnv({ ...valid, EMAIL_FROM: 'Faísca <nao-responda@seu-dominio.com>' })).toThrow(
      'EMAIL_FROM',
    );
  });

  it('a mensagem de erro cita só o nome da variável, nunca o valor', () => {
    expect(() => parseEnv({ ...valid, JWT_SECRET: 'CHANGE_ME_valor_que_nao_pode_vazar_no_log' })).toThrow(
      /^((?!valor_que_nao_pode_vazar).)*$/,
    );
  });
});
