import { z } from 'zod';

export const TASKS_MAX = 500;
export const TASK_TITLE_MAX = 120;
export const TASK_DESCRIPTION_MAX = 5000;
export const TASK_RESPONSE_MAX = 10000;
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();
export const taskIdSchema = z.object({ id: z.uuid() });
export const createTaskSchema = z.strictObject({
  title: optionalText(TASK_TITLE_MAX),
  description: z.string().trim().min(1, 'Descreva o que ficou combinado.').max(TASK_DESCRIPTION_MAX),
  agreedLinkId: z.uuid().nullable().optional(),
});
export const updateTaskSchema = createTaskSchema.partial().refine((input) => Object.keys(input).length > 0, 'Informe o que quer alterar.');
export const taskResponseSchema = z.strictObject({
  responseStatus: z.enum(['RESPONDIDA', 'NAO_CONSEGUI', 'NAO_FAZ_SENTIDO']),
  responseText: optionalText(TASK_RESPONSE_MAX),
}).refine((input) => input.responseStatus !== 'RESPONDIDA' || Boolean(input.responseText), {
  path: ['responseText'], message: 'Escreva sua resposta.',
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskResponseInput = z.infer<typeof taskResponseSchema>;
