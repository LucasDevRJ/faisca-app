import { z } from 'zod';

// Marcas de leitura da terapeuta (SPEC, "Visão da terapeuta"; DEC-057).

// As três áreas que a terapeuta marca como lidas. Atividades ficam de fora (DEC-057).
export const READ_TYPES = ['THOUGHT_RECORD', 'TENSION_EPISODE', 'ACTION'] as const;
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

export type ReadMarkItem = z.infer<typeof itemSchema>;
