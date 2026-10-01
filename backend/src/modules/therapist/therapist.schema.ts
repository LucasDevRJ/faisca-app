import { z } from 'zod';

export { therapistActivitiesQuerySchema } from '../activities/activities.schema.js';
export { therapistThoughtRecordsQuerySchema } from '../thought-records/thought-records.schema.js';

// Já validado pelo requireActiveLink; aqui só dá o tipo certo para o controller.
export const patientParamsSchema = z.object({ patientId: z.uuid() });
