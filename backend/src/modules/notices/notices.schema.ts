import { z } from 'zod';

// Mural de avisos da terapeuta (SPEC, "Mural de avisos"; DEC-079).

// O mesmo limite do CHECK da migration 20261031173825_therapist_notices.
export const NOTICE_MAX_LENGTH = 2000;

// O "já vi" vai em lote, quando o paciente abre a página; o teto protege a API de um pedido enorme.
export const NOTICES_SEEN_MAX = 100;

export const noticeBodySchema = z.strictObject({
  body: z
    .string({ error: 'Escreva o aviso.' })
    .trim()
    .min(1, { error: 'Escreva o aviso.' })
    .max(NOTICE_MAX_LENGTH, { error: `O aviso pode ter até ${NOTICE_MAX_LENGTH} caracteres.` }),
});

export const noticeIdSchema = z.object({ id: z.uuid({ error: 'Aviso inválido.' }) });

export const noticesSeenSchema = z.strictObject({
  ids: z
    .array(z.uuid({ error: 'Aviso inválido.' }))
    .min(1, { error: 'Escolha pelo menos um aviso.' })
    .max(NOTICES_SEEN_MAX, { error: `Dá para marcar até ${NOTICES_SEEN_MAX} avisos de uma vez.` })
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Cada aviso aparece uma vez só.' }),
});

export type NoticeBody = z.infer<typeof noticeBodySchema>;
