import { z } from 'zod';

// Remédios e o que sinto (DEC-114, #171). Os números precisam ser iguais aos do CHECK da migration
// 20261119200000_medications e aos do front.
export const MEDICATION_NAME_MAX = 60;
export const MEDICATION_DOSE_MAX = 40;
export const MEDICATION_SCHEDULE_MAX = 40;
export const CHANGE_NOTE_MAX = 200;
export const SYMPTOM_DESCRIPTION_MAX = 80;
export const SYMPTOM_NOTE_MAX = 500;
// Datas a partir de 1950, como o CHECK: alguém pode tomar um remédio há muitos anos.
export const FIRST_DATE = '1950-01-01';

// Tetos por conta, para a lista caber numa resposta só (não há paginação).
export const MEDICATIONS_MAX = 50;
export const CHANGES_PER_MEDICATION_MAX = 100;
export const SYMPTOMS_MAX = 300;
export const CHECKS_PER_SYMPTOM_MAX = 400;

export const CHANGE_KINDS = ['COMECOU', 'MUDOU_DOSE', 'PAROU'] as const;

const dateSchema = z
  .iso.date({ error: 'Informe uma data válida (AAAA-MM-DD).' })
  .refine((value) => value >= FIRST_DATE, { error: 'Informe uma data a partir de 1950.' });

// Texto curto do paciente: sem caracteres de controle (o nulo virava erro 500 no Postgres, como na
// palavra do dia, DEC-107) nem de formatação invisível, como o espaço de largura zero e o que inverte a
// direção do texto (achado do revisor-seguranca).
function text(label: string, max: number) {
  return z
    .string({ error: `Informe ${label}.` })
    .trim()
    .min(1, { error: `Informe ${label}.` })
    .max(max, { error: `Use até ${max} caracteres em ${label}.` })
    .regex(/^[^\p{Cc}\p{Cf}]*$/u, { error: `Use só letras, números e pontuação em ${label}.` });
}

// Opcional: vazio vira null, para apagar o que tinha.
function optionalText(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `Use até ${max} caracteres em ${label}.` })
    .regex(/^[^\p{Cc}\p{Cf}]*$/u, { error: `Use só letras, números e pontuação em ${label}.` })
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
}

// A observação pode ter quebra de linha: só ela aceita \n, \r e \t.
function optionalLongText(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `Use até ${max} caracteres em ${label}.` })
    .regex(/^(?:[^\p{Cc}\p{Cf}]|[\n\r\t])*$/u, { error: `Use só letras, números e pontuação em ${label}.` })
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
}

const intensitySchema = z
  .number({ error: 'A intensidade vai de 0 a 10.' })
  .int({ error: 'A intensidade vai de 0 a 10.' })
  .min(0, { error: 'A intensidade vai de 0 a 10.' })
  .max(10, { error: 'A intensidade vai de 0 a 10.' });

export const idParamsSchema = z.object({ id: z.uuid({ error: 'Registro não encontrado.' }) });
export const changeParamsSchema = z.object({
  id: z.uuid({ error: 'Registro não encontrado.' }),
  changeId: z.uuid({ error: 'Registro não encontrado.' }),
});
export const checkParamsSchema = z.object({
  id: z.uuid({ error: 'Registro não encontrado.' }),
  date: dateSchema,
});

// Um remédio novo já nasce com o COMECOU, na data de início.
export const createMedicationSchema = z.strictObject({
  name: text('o nome do remédio', MEDICATION_NAME_MAX),
  dose: optionalText('a dose', MEDICATION_DOSE_MAX),
  schedule: optionalText('o horário', MEDICATION_SCHEDULE_MAX),
  startedOn: dateSchema,
});

// O nome e o horário mudam direto; a dose muda por uma mudança (MUDOU_DOSE), com data.
export const updateMedicationSchema = z
  .strictObject({
    name: text('o nome do remédio', MEDICATION_NAME_MAX).optional(),
    schedule: optionalText('o horário', MEDICATION_SCHEDULE_MAX),
  })
  .refine((input) => input.name !== undefined || input.schedule !== undefined, {
    error: 'Nada para mudar.',
  });

export const createChangeSchema = z
  .strictObject({
    kind: z.enum(CHANGE_KINDS, { error: 'Escolha o que mudou.' }),
    changeDate: dateSchema,
    dose: optionalText('a dose', MEDICATION_DOSE_MAX),
    note: optionalText('a nota', CHANGE_NOTE_MAX),
  })
  .refine((input) => input.kind !== 'MUDOU_DOSE' || Boolean(input.dose), {
    error: 'Informe a dose nova.',
    path: ['dose'],
  })
  .refine((input) => input.kind !== 'PAROU' || !input.dose, {
    error: 'Quem parou não tem dose.',
    path: ['dose'],
  });

// O tipo não muda: para trocar, apague e crie outra.
export const updateChangeSchema = z
  .strictObject({
    changeDate: dateSchema.optional(),
    dose: optionalText('a dose', MEDICATION_DOSE_MAX),
    note: optionalText('a nota', CHANGE_NOTE_MAX),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), { error: 'Nada para mudar.' });

export const createSymptomSchema = z.strictObject({
  description: text('o que tem sentido', SYMPTOM_DESCRIPTION_MAX),
  startedOn: dateSchema,
  // A intensidade de quando começou: vira o primeiro "como está agora".
  intensity: intensitySchema.nullable().optional(),
  medicationId: z.uuid({ error: 'Remédio não encontrado.' }).nullable().optional(),
  note: optionalLongText('a observação', SYMPTOM_NOTE_MAX),
});

export const updateSymptomSchema = z
  .strictObject({
    description: text('o que tem sentido', SYMPTOM_DESCRIPTION_MAX).optional(),
    startedOn: dateSchema.optional(),
    // "Já passou" com data; null volta a "continua".
    endedOn: dateSchema.nullable().optional(),
    medicationId: z.uuid({ error: 'Remédio não encontrado.' }).nullable().optional(),
    note: optionalLongText('a observação', SYMPTOM_NOTE_MAX),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), { error: 'Nada para mudar.' });

export const checkSchema = z.strictObject({ intensity: intensitySchema });

export const settingsSchema = z.strictObject({ listsMedications: z.boolean() });

export type CreateMedicationInput = z.infer<typeof createMedicationSchema>;
export type UpdateMedicationInput = z.infer<typeof updateMedicationSchema>;
export type CreateChangeInput = z.infer<typeof createChangeSchema>;
export type UpdateChangeInput = z.infer<typeof updateChangeSchema>;
export type CreateSymptomInput = z.infer<typeof createSymptomSchema>;
export type UpdateSymptomInput = z.infer<typeof updateSymptomSchema>;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
