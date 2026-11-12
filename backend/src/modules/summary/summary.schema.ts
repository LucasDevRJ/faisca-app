import { z } from 'zod';
import { listQuerySchema, THERAPIST_LIST_MAX_DAYS } from '../activities/activities.schema.js';

// Resumo do período (DEC-100): o mesmo limite das listas da profissional (92 dias), que cobre os
// 3 meses da psiquiatra (DEC-099). Vale para o paciente e para a profissional.
export const periodSummaryQuerySchema = listQuerySchema(THERAPIST_LIST_MAX_DAYS);

export type PeriodSummaryQuery = z.infer<typeof periodSummaryQuerySchema>;
