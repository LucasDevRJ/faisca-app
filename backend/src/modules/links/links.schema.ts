import { z } from 'zod';
import { normalizeLinkCode } from '../../lib/link-code.js';

// Mesma normalização do cadastro: o convite vai para o e-mail em minúsculas e sem espaços.
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Informe um e-mail válido.' }).max(254));

export const createInviteSchema = z.strictObject({ email: emailSchema });

export const acceptInviteSchema = z.strictObject({ token: z.string().min(1).max(200) });

// O formato é público: código mal digitado dá 400 aqui e não conta como tentativa errada.
export const redeemCodeSchema = z.strictObject({
  code: z
    .string()
    .max(20)
    .transform((value, ctx) => {
      const code = normalizeLinkCode(value);
      if (!code) {
        ctx.addIssue({ code: 'custom', message: 'O código tem 8 letras e números, como K7M4-P9QX.' });
        return z.NEVER;
      }
      return code;
    }),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
