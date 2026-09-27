import { z } from 'zod';

const dateSchema = z.iso.date({ error: 'Informe uma data válida (AAAA-MM-DD).' });

// Objetos estritos, como nas atividades: campo a mais é erro, e não é ignorado em silêncio.
export const appointmentInputSchema = z.strictObject({ appointmentDate: dateSchema });

export const appointmentIdSchema = z.object({ id: z.uuid({ error: 'Consulta inválida.' }) });

export type AppointmentInput = z.infer<typeof appointmentInputSchema>;
