import { z } from 'zod';
import { Emotion } from '../../generated/prisma/enums.js';
import { LIST_MAX_DAYS, THERAPIST_LIST_MAX_DAYS, listQuerySchema } from '../activities/activities.schema.js';

// Limites da DEC-039, com o texto em 5000 pela DEC-053. Os mesmos valores estão nos CHECKs do banco.
export const TEXT_MAX = 5000;
export const OTHER_LABEL_MAX = 50;

// Ordem em que as emoções aparecem (a da lista na SPEC).
export const EMOTIONS = Object.values(Emotion);

function textSchema(emptyMessage: string) {
  return z
    .string()
    .trim()
    .min(1, { error: emptyMessage })
    .max(TEXT_MAX, { error: `Este campo pode ter até ${TEXT_MAX} caracteres.` });
}

const dateSchema = z.iso.date({ error: 'Informe uma data válida (AAAA-MM-DD).' });

const scoreSchema = z
  .int({ error: 'A nota precisa ser um número inteiro.' })
  .min(0, { error: 'A nota vai de 0 a 10.' })
  .max(10, { error: 'A nota vai de 0 a 10.' });

const emotionSchema = z
  .strictObject({
    emotion: z.enum(Emotion, { error: 'Escolha uma emoção da lista.' }),
    intensity: scoreSchema,
    // "Como me sinto agora" (DEC-054): só com a explicação alternativa.
    intensityAfter: scoreSchema.optional(),
    otherLabel: z
      .string()
      .trim()
      .min(1, { error: 'Escreva o nome da emoção.' })
      .max(OTHER_LABEL_MAX, { error: `O nome da emoção pode ter até ${OTHER_LABEL_MAX} caracteres.` })
      .optional(),
  })
  // O nome livre é só da OUTRA, e nela é obrigatório.
  .refine((value) => (value.emotion === 'OUTRA') === (value.otherLabel !== undefined), {
    error: 'O nome da emoção vai só em "outra", e nela é obrigatório.',
    path: ['otherLabel'],
  });

const emotionsSchema = z
  .array(emotionSchema)
  .min(1, { error: 'Escolha pelo menos uma emoção.' })
  .max(EMOTIONS.length)
  .refine((items) => new Set(items.map((item) => item.emotion)).size === items.length, {
    error: 'Cada emoção aparece uma vez só.',
  })
  // Reavalia todas as emoções de uma vez, ou nenhuma (DEC-054).
  .refine((items) => allOrNone(items.map((item) => item.intensityAfter)), {
    error: 'Reavalie todas as emoções, ou nenhuma.',
  });

function allOrNone(values: unknown[]): boolean {
  const filled = values.filter((value) => value !== undefined).length;
  return filled === 0 || filled === values.length;
}

const ALTERNATIVE_EMPTY = 'Escreva a explicação alternativa.';

const fields = {
  situationDate: dateSchema,
  situation: textSchema('Conte qual foi a situação.'),
  automaticThought: textSchema('Conte qual pensamento veio.'),
  beliefLevel: scoreSchema,
  emotions: emotionsSchema,
  behavior: textSchema('Conte o que você fez.'),
  consequence: textSchema('Conte qual foi a consequência.'),
  alternativeExplanation: textSchema(ALTERNATIVE_EMPTY),
};

const NEEDS_ALTERNATIVE = {
  error: 'Para dizer como se sente agora, escreva a explicação alternativa.',
  path: ['emotions'],
};

// Todos os campos são obrigatórios (SPEC), menos a explicação alternativa (DEC-054). Objetos
// estritos: campo a mais é 400.
export const createThoughtRecordSchema = z
  .strictObject({ ...fields, alternativeExplanation: fields.alternativeExplanation.optional() })
  .refine(
    (data) => data.alternativeExplanation !== undefined || data.emotions.every((e) => e.intensityAfter === undefined),
    NEEDS_ALTERNATIVE,
  );

// Na edição, manda só o que mudou. As emoções, se vierem, substituem a lista inteira. A
// alternativa em null apaga a alternativa e a reavaliação. Se a reavaliação vem sem a alternativa,
// o service confere a que já está gravada.
export const updateThoughtRecordSchema = z
  .strictObject({
    situationDate: fields.situationDate.optional(),
    situation: fields.situation.optional(),
    automaticThought: fields.automaticThought.optional(),
    beliefLevel: fields.beliefLevel.optional(),
    emotions: fields.emotions.optional(),
    behavior: fields.behavior.optional(),
    consequence: fields.consequence.optional(),
    alternativeExplanation: fields.alternativeExplanation.nullable().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Nada para alterar.',
  })
  .refine(
    (data) => data.alternativeExplanation !== null || !data.emotions?.some((e) => e.intensityAfter !== undefined),
    NEEDS_ALTERNATIVE,
  );

// Adicionar a alternativa depois do dia do registro (DEC-054): uma vez só, até a hora da próxima
// consulta. A reavaliação é opcional e, se vier, cobre todas as emoções do registro.
export const addAlternativeSchema = z.strictObject({
  alternativeExplanation: fields.alternativeExplanation,
  emotionsAfter: z
    .array(
      z.strictObject({
        emotion: z.enum(Emotion, { error: 'Escolha uma emoção da lista.' }),
        intensityAfter: scoreSchema,
      }),
    )
    .min(1)
    .max(EMOTIONS.length)
    .refine((items) => new Set(items.map((item) => item.emotion)).size === items.length, {
      error: 'Cada emoção aparece uma vez só.',
    })
    .optional(),
});

// Mesmos tetos das atividades: 42 dias para o paciente, 92 para a terapeuta (DEC-033).
export const listThoughtRecordsQuerySchema = listQuerySchema(LIST_MAX_DAYS);
export const therapistThoughtRecordsQuerySchema = listQuerySchema(THERAPIST_LIST_MAX_DAYS);

export const thoughtRecordIdSchema = z.object({ id: z.uuid({ error: 'Registro inválido.' }) });

export type EmotionInput = z.infer<typeof emotionSchema>;
export type CreateThoughtRecordInput = z.infer<typeof createThoughtRecordSchema>;
export type UpdateThoughtRecordInput = z.infer<typeof updateThoughtRecordSchema>;
export type ListThoughtRecordsQuery = z.infer<typeof listThoughtRecordsQuerySchema>;
export type AddAlternativeInput = z.infer<typeof addAlternativeSchema>;
