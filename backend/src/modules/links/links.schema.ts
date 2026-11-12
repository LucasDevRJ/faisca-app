import { z } from 'zod';
import { normalizeLinkCode } from '../../lib/link-code.js';
import { SHARED_AREAS } from '../../lib/shared-areas.js';

// Mesma normalização do cadastro: o convite vai para o e-mail em minúsculas e sem espaços.
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Informe um e-mail válido.' }).max(254));

export const createInviteSchema = z.strictObject({ email: emailSchema });

export const PROFESSIONAL_KINDS = ['PSICOLOGIA', 'PSIQUIATRIA'] as const;
export const professionalKindSchema = z.enum(PROFESSIONAL_KINDS, { error: 'Escolha psicóloga ou psiquiatra.' });

// professionalKind: o tipo de quem ainda não é profissional e vira ao aceitar (DEC-097). Quem já é
// fica com o tipo que tem.
export const acceptInviteSchema = z.strictObject({
  token: z.string().min(1).max(200),
  professionalKind: professionalKindSchema.optional(),
});

// Qual vínculo desfazer (DEC-097). Opcional: as telas de antes mandam o corpo vazio.
export const revokeSchema = z.strictObject({ linkId: z.uuid({ error: 'Vínculo inválido.' }).optional() });

export const linkIdSchema = z.object({ linkId: z.uuid({ error: 'Vínculo inválido.' }) });

// O que o paciente libera para uma profissional (DEC-097). Lista vazia = nada; sem repetir.
export const sharedAreasSchema = z.strictObject({
  areas: z
    .array(z.enum(SHARED_AREAS, { error: 'Área inválida.' }))
    .max(SHARED_AREAS.length)
    .refine((areas) => new Set(areas).size === areas.length, { error: 'Cada área aparece uma vez só.' }),
});

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
