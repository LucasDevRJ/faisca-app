import { z } from 'zod';

// Verificação em duas etapas (DEC-092). O código vai no campo "otp" (e não "code"), para o logger
// esconder o campo sem esconder também o "code" dos erros.

const password = z.string().min(1).max(200);
const otp = z.string().trim().min(1).max(20);
export const twoFactorMethodSchema = z.enum(['EMAIL', 'TOTP']);

const via = z.enum(['EMAIL', 'TOTP', 'RECOVERY']);

// Ativar um método: a senha antes de tudo, para quem pegou o celular desbloqueado não ativar. Com um
// jeito já ligado, também um código dele (via + otp).
export const startSetupSchema = z
  .strictObject({ password, method: twoFactorMethodSchema, via: via.optional(), otp: otp.optional() })
  .refine((body) => (body.via === undefined) === (body.otp === undefined), { error: 'Informe o jeito e o código juntos.' });

// Provar que o método funciona, com um código dele.
export const confirmSetupSchema = z.strictObject({ method: twoFactorMethodSchema, otp });

// Gerar códigos de recuperação novos: a senha e um código de um jeito ligado.
export const regenerateCodesSchema = z.strictObject({ password, via, otp });

// Desligar: a senha e um código de qualquer jeito ligado (ou de recuperação).
export const disableSchema = z.strictObject({ password, via, otp });

// O passo do login entre a senha e o código.
export const loginVerifySchema = z.strictObject({ via, otp });

export type TwoFactorMethod = z.infer<typeof twoFactorMethodSchema>;
export type CodeVia = z.infer<typeof loginVerifySchema>['via'];
