import { api } from '../../lib/api';
import type { SessionUser } from './auth-api';

// Chamadas às rotas /auth/2fa da API (DEC-092). O código vai no campo "otp", que a API esconde
// nos logs.

export type TwoFactorMethod = 'EMAIL' | 'TOTP';
// Jeito de confirmar: um dos métodos ou um código de recuperação.
export type CodeVia = TwoFactorMethod | 'RECOVERY';

export type TwoFactorStatus = {
  // Sem a chave no servidor, o 2FA fica indisponível (503) e a tela avisa.
  available: boolean;
  emailEnabled: boolean;
  totpEnabled: boolean;
  recoveryCodesLeft: number;
};

// Login com 2FA: a senha certa só abre este passo; a sessão abre com o código.
export type TwoFactorLoginStep = {
  methods: TwoFactorMethod[];
  preferred: TwoFactorMethod;
  // E-mail parcialmente escondido ("lu•••@gmail.com").
  emailHint: string;
};

export type Proof = { via: CodeVia; otp: string };

export type SetupStart = { method: 'EMAIL'; emailHint: string } | { method: 'TOTP'; secret: string; uri: string };

export async function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
  const { data } = await api.get<TwoFactorStatus>('/auth/2fa');
  return data;
}

// Com um jeito já ligado, a API pede também um código dele (proof).
export async function startTwoFactorSetup(input: {
  password: string;
  method: TwoFactorMethod;
  proof?: Proof;
}): Promise<SetupStart> {
  const { data } = await api.post<SetupStart>('/auth/2fa/setup', {
    password: input.password,
    method: input.method,
    ...input.proof,
  });
  return data;
}

// No primeiro método, a resposta traz os códigos de recuperação; no segundo, null.
export async function confirmTwoFactorSetup(input: { method: TwoFactorMethod; otp: string }): Promise<string[] | null> {
  const { data } = await api.post<{ recoveryCodes: string[] | null }>('/auth/2fa/setup/confirm', input);
  return data.recoveryCodes;
}

export async function regenerateRecoveryCodes(input: { password: string } & Proof): Promise<string[]> {
  const { data } = await api.post<{ recoveryCodes: string[] }>('/auth/2fa/recovery-codes', input);
  return data.recoveryCodes;
}

// Código por e-mail para confirmar uma ação com a sessão aberta (adicionar, gerar códigos, desligar).
export async function sendActionEmailCode(): Promise<{ emailHint: string }> {
  const { data } = await api.post<{ emailHint: string }>('/auth/2fa/email-code');
  return data;
}

export async function disableTwoFactor(input: { password: string } & Proof): Promise<void> {
  await api.post('/auth/2fa/disable', input);
}

export async function sendLoginEmailCode(): Promise<void> {
  await api.post('/auth/2fa/login/email');
}

export async function verifyTwoFactorLogin(input: Proof): Promise<SessionUser> {
  const { data } = await api.post<{ user: SessionUser }>('/auth/2fa/login/verify', input);
  return data.user;
}
