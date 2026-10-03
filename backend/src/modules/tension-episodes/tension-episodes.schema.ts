import { z } from 'zod';
import { LIST_MAX_DAYS, THERAPIST_LIST_MAX_DAYS, listQuerySchema } from '../activities/activities.schema.js';

// Limite da DEC-042. O mesmo valor está no CHECK da migration.
export const TEXT_MAX = 1000;

function textSchema(emptyMessage: string) {
  return z
    .string()
    .trim()
    .min(1, { error: emptyMessage })
    .max(TEXT_MAX, { error: `Este campo pode ter até ${TEXT_MAX} caracteres.` });
}

const dateSchema = z.iso.date({ error: 'Informe uma data válida (AAAA-MM-DD).' });

// Hora no relógio de São Paulo, sem segundos. null ou ausente = sem horário.
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Informe uma hora válida (HH:MM).' })
  .nullable();

const scoreSchema = z
  .int({ error: 'A nota precisa ser um número inteiro.' })
  .min(0, { error: 'A nota vai de 0 a 10.' })
  .max(10, { error: 'A nota vai de 0 a 10.' });

const fields = {
  episodeDate: dateSchema,
  episodeTime: timeSchema,
  situation: textSchema('Conte o que estava acontecendo.'),
  tensionLevel: scoreSchema,
  vocalizeUrge: scoreSchema,
  behavior: textSchema('Conte o que você fez.'),
  consequence: textSchema('Conte o que aconteceu depois.'),
};

// Tudo obrigatório, menos a hora (SPEC). Objetos estritos: campo a mais é 400.
export const createTensionEpisodeSchema = z.strictObject({
  ...fields,
  episodeTime: fields.episodeTime.optional(),
});

// Na edição, manda só o que mudou. episodeTime: null apaga a hora.
export const updateTensionEpisodeSchema = z
  .strictObject({
    episodeDate: fields.episodeDate.optional(),
    episodeTime: fields.episodeTime.optional(),
    situation: fields.situation.optional(),
    tensionLevel: fields.tensionLevel.optional(),
    vocalizeUrge: fields.vocalizeUrge.optional(),
    behavior: fields.behavior.optional(),
    consequence: fields.consequence.optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Nada para alterar.',
  });

// Mesmos tetos das atividades e do RPD: 42 dias para o paciente, 92 para a terapeuta (DEC-033).
export const listTensionEpisodesQuerySchema = listQuerySchema(LIST_MAX_DAYS);
export const therapistTensionEpisodesQuerySchema = listQuerySchema(THERAPIST_LIST_MAX_DAYS);

export const tensionEpisodeIdSchema = z.object({ id: z.uuid({ error: 'Registro inválido.' }) });

export type CreateTensionEpisodeInput = z.infer<typeof createTensionEpisodeSchema>;
export type UpdateTensionEpisodeInput = z.infer<typeof updateTensionEpisodeSchema>;
export type ListTensionEpisodesQuery = z.infer<typeof listTensionEpisodesQuerySchema>;
