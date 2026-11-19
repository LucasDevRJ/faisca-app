import { z } from 'zod';
import { listQuerySchema, THERAPIST_LIST_MAX_DAYS } from '../activities/activities.schema.js';

// Sono, humor e remédio (DEC-107). Os números do CHECK da migration e do front precisam ser iguais.
export const MOOD_WORD_MAX = 40;
// O paciente registra e edita os últimos 7 dias (hoje e os 6 anteriores).
export const CHECK_IN_WINDOW_DAYS = 7;
// Lista do paciente: até 92 dias, para o gráfico do período (os 3 meses da psiquiatra, DEC-099).
export const CHECK_INS_MAX_DAYS = THERAPIST_LIST_MAX_DAYS;

export const MEDICATION_ANSWERS = ['TOMOU', 'ESQUECEU_ALGUM', 'NAO_TOMOU'] as const;

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Informe a hora no formato HH:MM.' });
const scoreSchema = z
  .number({ error: 'A nota vai de 0 a 10.' })
  .int({ error: 'A nota vai de 0 a 10.' })
  .min(0, { error: 'A nota vai de 0 a 10.' })
  .max(10, { error: 'A nota vai de 0 a 10.' });

export const checkInDateSchema = z.object({ date: z.iso.date({ error: 'Informe uma data válida (AAAA-MM-DD).' }) });

// PUT do dia inteiro: o que não vier fica vazio. Tudo é opcional, mas o registro precisa de ao
// menos uma resposta, e os dois horários vêm juntos.
export const checkInSchema = z
  .strictObject({
    bedTime: timeSchema.nullable().optional(),
    wakeTime: timeSchema.nullable().optional(),
    sleepQuality: scoreSchema.nullable().optional(),
    mood: scoreSchema.nullable().optional(),
    moodWord: z
      .string()
      .trim()
      .max(MOOD_WORD_MAX, { error: `A palavra do dia pode ter até ${MOOD_WORD_MAX} caracteres.` })
      // Sem caracteres de controle: o nulo (\u0000) virava erro 500 no Postgres (revisor-seguranca).
      .regex(/^[^\p{Cc}]*$/u, { error: 'Use só letras, números e pontuação na palavra do dia.' })
      .transform((value) => (value === '' ? null : value))
      .nullable()
      .optional(),
    medication: z.enum(MEDICATION_ANSWERS, { error: 'Escolha uma das respostas.' }).nullable().optional(),
  })
  .refine((input) => Boolean(input.bedTime) === Boolean(input.wakeTime), {
    error: 'Informe a hora em que deitou e a hora em que acordou.',
    path: ['wakeTime'],
  })
  .refine((input) => !input.bedTime || input.bedTime !== input.wakeTime, {
    error: 'A hora de deitar e a de acordar são iguais.',
    path: ['wakeTime'],
  })
  .refine(
    (input) =>
      [input.bedTime, input.sleepQuality, input.mood, input.moodWord, input.medication].some(
        (value) => value !== null && value !== undefined,
      ),
    { error: 'Preencha ao menos uma resposta.' },
  );

export const checkInSettingsSchema = z.strictObject({ tracksMedication: z.boolean() });

export const checkInsQuerySchema = listQuerySchema(CHECK_INS_MAX_DAYS);

export type CheckInInput = z.infer<typeof checkInSchema>;
