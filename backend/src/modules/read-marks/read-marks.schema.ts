import { z } from 'zod';

// Marcas de leitura da terapeuta (SPEC, "Visão da terapeuta"; DEC-057).

// As áreas que a terapeuta marca como lidas. Atividades ficam de fora (DEC-057); o "Sobre mim"
// entrou depois (DEC-081), e os registros do Meus Planos depois dele (DEC-094).
export const READ_TYPES = ['THOUGHT_RECORD', 'TENSION_EPISODE', 'ACTION', 'ABOUT_ME', 'PLAN_ENTRY', 'TASK'] as const;
export type ReadType = (typeof READ_TYPES)[number];

// O "Marcar todos" manda a lista aberta de uma vez; o teto protege a API de um pedido enorme.
export const READ_MARKS_MAX = 500;

const itemSchema = z.strictObject({
  type: z.enum(READ_TYPES, { error: 'Tipo de registro inválido.' }),
  id: z.uuid({ error: 'Registro inválido.' }),
});

export const readMarksBodySchema = z.strictObject({
  items: z
    .array(itemSchema)
    .min(1, { error: 'Escolha pelo menos um registro.' })
    .max(READ_MARKS_MAX, { error: `Dá para marcar até ${READ_MARKS_MAX} registros de uma vez.` })
    .refine((items) => new Set(items.map((item) => `${item.type}:${item.id}`)).size === items.length, {
      error: 'Cada registro aparece uma vez só.',
    }),
});

// Página da visão "Para ler" (DEC-112): do mais antigo ao mais novo entre as áreas liberadas.
export const UNREAD_PAGE_SIZE = 50;

const cursorPayloadSchema = z.strictObject({
  date: z.iso.date(),
  sortAt: z.iso.datetime(),
  type: z.enum(READ_TYPES),
  id: z.uuid(),
});

export type UnreadCursor = z.infer<typeof cursorPayloadSchema>;

export function encodeUnreadCursor(cursor: UnreadCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeUnreadCursor(raw: string): UnreadCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const result = cursorPayloadSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export const unreadQuerySchema = z.strictObject({
  cursor: z
    .string()
    .trim()
    .min(1, { error: 'Cursor inválido.' })
    .max(500, { error: 'Cursor inválido.' })
    .transform((raw, ctx) => {
      const decoded = decodeUnreadCursor(raw);
      if (!decoded) {
        ctx.addIssue({ code: 'custom', message: 'Cursor inválido.' });
        return z.NEVER;
      }
      return decoded;
    })
    .optional(),
});

export type ReadMarkItem = z.infer<typeof itemSchema>;
export type UnreadQuery = z.infer<typeof unreadQuerySchema>;
