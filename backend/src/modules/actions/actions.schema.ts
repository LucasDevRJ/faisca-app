import { z } from 'zod';
import { LIST_MAX_DAYS, THERAPIST_LIST_MAX_DAYS, listQuerySchema } from '../activities/activities.schema.js';

// Ação (SPEC, "Ação"; DEC-051). Os limites de texto são os das atividades, também no CHECK do banco.
export const NAME_MAX = 100;
export const OBSERVATION_MAX = 1000;

const dateSchema = z.iso.date({ error: 'Informe uma data válida (AAAA-MM-DD).' });

const nameSchema = z
  .string({ error: 'Conte qual é a ação.' })
  .trim()
  .min(1, { error: 'Conte qual é a ação.' })
  .max(NAME_MAX, { error: `O nome pode ter até ${NAME_MAX} caracteres.` });

const categorySchema = z.enum(['PRAZER', 'CONEXAO', 'REALIZACAO'], { error: 'Escolha o tipo da ação.' });

const scoreSchema = z
  .int({ error: 'A nota precisa ser um número inteiro.' })
  .min(0, { error: 'A nota vai de 0 a 10.' })
  .max(10, { error: 'A nota vai de 0 a 10.' });

// Vazia vira "sem observação".
const observationSchema = z
  .string()
  .trim()
  .max(OBSERVATION_MAX, { error: `A observação pode ter até ${OBSERVATION_MAX} caracteres.` })
  .transform((value) => (value === '' ? undefined : value))
  .optional();

const base = {
  actionDate: dateSchema,
  name: nameSchema,
  category: categorySchema,
  expectation: scoreSchema,
};

// Planejar (com a expectativa) ou registrar algo que já foi feito (já com a avaliação).
// Objetos estritos: campo a mais é 400.
export const createActionSchema = z.discriminatedUnion(
  'status',
  [
    z.strictObject({ status: z.literal('PLANEJADA'), ...base }),
    z.strictObject({
      status: z.literal('AVALIADA'),
      ...base,
      pleasure: scoreSchema,
      achievement: scoreSchema,
      observation: observationSchema,
    }),
  ],
  { error: 'Diga se a ação é planejada ou já foi feita.' },
);

// Na edição de uma planejada, manda só o que mudou.
export const updateActionSchema = z
  .strictObject({
    actionDate: base.actionDate.optional(),
    name: base.name.optional(),
    category: base.category.optional(),
    expectation: base.expectation.optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), { error: 'Nada para alterar.' });

export const evaluateActionSchema = z.strictObject({
  pleasure: scoreSchema,
  achievement: scoreSchema,
  observation: observationSchema,
});

export const notDoneActionSchema = z.strictObject({ observation: observationSchema });

export const actionIdSchema = z.object({ id: z.uuid({ error: 'Ação inválida.' }) });

// Mesmos tetos das outras listas: 42 dias para o paciente, 92 para a terapeuta (DEC-033).
export const listActionsQuerySchema = listQuerySchema(LIST_MAX_DAYS);
export const therapistActionsQuerySchema = listQuerySchema(THERAPIST_LIST_MAX_DAYS);

export type CreateActionInput = z.infer<typeof createActionSchema>;
export type UpdateActionInput = z.infer<typeof updateActionSchema>;
export type EvaluateActionInput = z.infer<typeof evaluateActionSchema>;
export type NotDoneActionInput = z.infer<typeof notDoneActionSchema>;
export type ListActionsQuery = z.infer<typeof listActionsQuerySchema>;
