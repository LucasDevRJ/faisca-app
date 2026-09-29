import { z } from 'zod';
import { daysBetween } from '../../lib/dates.js';

// Limites da DEC-028. Os mesmos valores estão nos CHECKs da migration.
export const NAME_MAX = 100;
export const OBSERVATION_MAX = 1000;
// Uma semana cabe folgada; um mês inteiro com as semanas das pontas também.
export const LIST_MAX_DAYS = 42;
// Terapeuta: o filtro "desde a última consulta" cobre até ~3 meses (DEC-033).
export const THERAPIST_LIST_MAX_DAYS = 92;

const nameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Dê um nome para a atividade.' })
  .max(NAME_MAX, { error: `O nome pode ter até ${NAME_MAX} caracteres.` });

const dateSchema = z.iso.date({ error: 'Informe uma data válida (AAAA-MM-DD).' });

const scoreSchema = z
  .int({ error: 'A nota precisa ser um número inteiro.' })
  .min(0, { error: 'A nota vai de 0 a 10.' })
  .max(10, { error: 'A nota vai de 0 a 10.' });

// Observação vazia ou só com espaços vira "sem observação" (null no banco).
const observationSchema = z
  .string()
  .trim()
  .max(OBSERVATION_MAX, { error: `A observação pode ter até ${OBSERVATION_MAX} caracteres.` })
  .transform((value) => (value === '' ? null : value))
  .optional();

// Objetos estritos: campo que não pertence ao estado (ex.: prazer numa PLANEJADA) é erro,
// em vez de ser ignorado em silêncio.
export const createActivitySchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('PLANEJADA'), name: nameSchema, activityDate: dateSchema }),
  z.strictObject({
    status: z.literal('PENDENTE'),
    name: nameSchema,
    activityDate: dateSchema,
    wantBefore: scoreSchema,
  }),
  z.strictObject({
    status: z.literal('CONCLUIDA'),
    name: nameSchema,
    activityDate: dateSchema,
    wantBefore: scoreSchema,
    pleasure: scoreSchema,
    achievement: scoreSchema,
    observation: observationSchema,
  }),
]);

export const updateActivitySchema = z
  .strictObject({
    name: nameSchema.optional(),
    activityDate: dateSchema.optional(),
    wantBefore: scoreSchema.optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Nada para alterar.',
  });

export const startActivitySchema = z.strictObject({ wantBefore: scoreSchema });

export const completeActivitySchema = z.strictObject({
  pleasure: scoreSchema,
  achievement: scoreSchema,
  observation: observationSchema,
});

export const notDoneActivitySchema = z.strictObject({ observation: observationSchema });

// Intervalo de dias (inclusivo) com um teto, para ninguém baixar o histórico inteiro de uma vez.
function listQuerySchema(maxDays: number) {
  return z
    .object({ from: dateSchema, to: dateSchema })
    .refine(({ from, to }) => from <= to, { error: 'A data final vem depois da inicial.', path: ['to'] })
    .refine(({ from, to }) => daysBetween(from, to) < maxDays, {
      error: `O intervalo pode ter até ${maxDays} dias.`,
      path: ['to'],
    });
}

export const listActivitiesQuerySchema = listQuerySchema(LIST_MAX_DAYS);
export const therapistActivitiesQuerySchema = listQuerySchema(THERAPIST_LIST_MAX_DAYS);

export const activityIdSchema = z.object({ id: z.uuid({ error: 'Atividade inválida.' }) });

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
export type StartActivityInput = z.infer<typeof startActivitySchema>;
export type CompleteActivityInput = z.infer<typeof completeActivitySchema>;
export type NotDoneActivityInput = z.infer<typeof notDoneActivitySchema>;
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;
