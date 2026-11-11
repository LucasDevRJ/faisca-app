import { z } from 'zod';
import { LIST_MAX_DAYS, THERAPIST_LIST_MAX_DAYS, listQuerySchema } from '../activities/activities.schema.js';

// Meus Planos (SPEC, "Meus Planos"; DEC-094). Os mesmos limites estão nos CHECKs do banco.
export const TITLE_MAX = 120;
export const QUESTIONS_MAX = 10;
export const QUESTION_MAX = 200;
// Como os textos da Tensão e da Ação (DEC-053).
export const ANSWER_MAX = 5000;
// Teto de planos por conta, ativos e encerrados: protege a API de abuso.
export const PLANS_MAX = 30;

const titleSchema = z
  .string()
  .trim()
  .min(1, { error: 'Dê um nome ao plano.' })
  .max(TITLE_MAX, { error: `O nome pode ter até ${TITLE_MAX} caracteres.` });

const questionSchema = z
  .string()
  .trim()
  .min(1, { error: 'Escreva a pergunta ou remova o espaço vazio.' })
  .max(QUESTION_MAX, { error: `Cada pergunta pode ter até ${QUESTION_MAX} caracteres.` });

const questionsSchema = z
  .array(questionSchema)
  .min(1, { error: 'O plano precisa de pelo menos uma pergunta.' })
  .max(QUESTIONS_MAX, { error: `O plano pode ter até ${QUESTIONS_MAX} perguntas.` });

// Objetos estritos: campo a mais (como userId) é 400.
export const createPlanSchema = z.strictObject({
  title: titleSchema,
  questions: questionsSchema,
});

// Na edição, manda só o que mudou. archived: true encerra; false reabre.
export const updatePlanSchema = z
  .strictObject({
    title: titleSchema.optional(),
    questions: questionsSchema.optional(),
    archived: z.boolean({ error: 'Informe se o plano está encerrado.' }).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Nada para alterar.',
  });

const dateSchema = z.iso.date({ error: 'Informe uma data válida (AAAA-MM-DD).' });

// Hora no relógio de São Paulo, sem segundos. null ou ausente = sem horário.
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Informe uma hora válida (HH:MM).' })
  .nullable();

// Uma resposta por pergunta, na ordem do plano. Vazia = não respondida; pelo menos uma tem texto.
// A quantidade certa é conferida no service, contra as perguntas do plano.
const answersSchema = z
  .array(
    z
      .string()
      .trim()
      .max(ANSWER_MAX, { error: `Cada resposta pode ter até ${ANSWER_MAX} caracteres.` }),
  )
  .min(1, { error: 'Responda pelo menos uma pergunta.' })
  .max(QUESTIONS_MAX, { error: 'Há mais respostas do que perguntas.' })
  .refine((answers) => answers.some((answer) => answer.length > 0), {
    error: 'Responda pelo menos uma pergunta.',
  });

export const createPlanEntrySchema = z.strictObject({
  entryDate: dateSchema,
  entryTime: timeSchema.optional(),
  answers: answersSchema,
});

// Na edição, as perguntas continuam as do registro (a cópia), e não as do plano de agora.
export const updatePlanEntrySchema = z
  .strictObject({
    entryDate: dateSchema.optional(),
    entryTime: timeSchema.optional(),
    answers: answersSchema.optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Nada para alterar.',
  });

// Mesmos tetos das outras áreas: 42 dias para o paciente, 92 para a terapeuta (DEC-033).
export const listPlanEntriesQuerySchema = listQuerySchema(LIST_MAX_DAYS);
export const therapistPlanEntriesQuerySchema = listQuerySchema(THERAPIST_LIST_MAX_DAYS);

export const planIdSchema = z.object({ id: z.uuid({ error: 'Plano inválido.' }) });
export const planEntryIdSchema = z.object({ id: z.uuid({ error: 'Registro inválido.' }) });

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type CreatePlanEntryInput = z.infer<typeof createPlanEntrySchema>;
export type UpdatePlanEntryInput = z.infer<typeof updatePlanEntrySchema>;
export type ListPlanEntriesQuery = z.infer<typeof listPlanEntriesQuerySchema>;
