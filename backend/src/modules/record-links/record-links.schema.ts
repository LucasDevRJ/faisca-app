import { z } from 'zod';

export const linkedRecordTypeSchema = z.enum([
  'ACTIVITY', 'THOUGHT_RECORD', 'TENSION_EPISODE', 'ACTION', 'PLAN', 'PLAN_ENTRY', 'TASK', 'SLEEP_MOOD', 'MEDICATION',
]);
export const listLinksSchema = z.object({
  recordType: linkedRecordTypeSchema,
  recordId: z.string().uuid(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
// Candidatos (DEC-126): com o registro de origem, como nas ligações; sem ele (escolher um registro
// para uma mensagem, DEC-128), o período é obrigatório.
export const candidatesSchema = z.object({
  recordType: linkedRecordTypeSchema.optional(),
  recordId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
}).refine((value) => (value.recordType === undefined) === (value.recordId === undefined), {
  message: 'Informe o tipo e o id do registro juntos.', path: ['recordId'],
}).refine((value) => value.recordId !== undefined || (value.from !== undefined && value.to !== undefined), {
  message: 'Informe o período.', path: ['from'],
});
export type CandidatesQuery = z.infer<typeof candidatesSchema>;
export const createLinkSchema = z.object({
  sourceType: linkedRecordTypeSchema,
  sourceId: z.string().uuid(),
  targetType: linkedRecordTypeSchema,
  targetId: z.string().uuid(),
  kind: z.enum(['RELATED', 'REPETITION']).default('RELATED'),
}).refine((value) => value.sourceType !== value.targetType || value.sourceId !== value.targetId, {
  message: 'Um registro não pode ser ligado a ele mesmo.',
});
export const recordLinkIdSchema = z.object({ id: z.string().uuid() });
export type LinkedRecordType = z.infer<typeof linkedRecordTypeSchema>;
export type ListLinksQuery = z.infer<typeof listLinksSchema>;
export type CreateLinkInput = z.infer<typeof createLinkSchema>;
