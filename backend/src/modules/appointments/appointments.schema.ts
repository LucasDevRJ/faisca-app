import { z } from 'zod';
import { daysBetween } from '../../lib/dates.js';

const dateSchema = z.iso.date({ error: 'Informe uma data válida (AAAA-MM-DD).' });

// Hora no relógio de São Paulo, sem segundos, como nos episódios de tensão (DEC-042).
const timeSchema = z
  .string({ error: 'Informe a hora (HH:MM).' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Informe uma hora válida (HH:MM).' });

// Motivo de desmarcar ou remarcar (DEC-045): obrigatório, de 1 a 500 caracteres.
const reasonSchema = z
  .string({ error: 'Conte o motivo.' })
  .trim()
  .min(1, { error: 'Conte o motivo.' })
  .max(500, { error: 'O motivo pode ter até 500 caracteres.' });

// Objetos estritos, como nas atividades: campo a mais é erro, e não é ignorado em silêncio.

// Consulta avulsa: a hora passa a ser obrigatória (DEC-045).
export const appointmentInputSchema = z.strictObject({ appointmentDate: dateSchema, appointmentTime: timeSchema });

export const appointmentIdSchema = z.object({ id: z.uuid({ error: 'Consulta inválida.' }) });

// Período da lista. Sem from e to, vai de 91 dias atrás a 91 dias à frente.
export const LIST_MAX_DAYS = 400;

export const listAppointmentsQuerySchema = z
  .object({ from: dateSchema.optional(), to: dateSchema.optional() })
  .refine((q) => (q.from === undefined) === (q.to === undefined), {
    error: 'Informe o início e o fim do período, ou nenhum dos dois.',
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { error: 'A data final vem depois da inicial.', path: ['to'] })
  .refine((q) => !q.from || !q.to || daysBetween(q.from, q.to) < LIST_MAX_DAYS, {
    error: `O intervalo pode ter até ${LIST_MAX_DAYS} dias.`,
    path: ['to'],
  });

export const scheduleInputSchema = z.strictObject({
  startDate: dateSchema,
  time: timeSchema,
  frequency: z.enum(['SEMANAL', 'QUINZENAL'], { error: 'Escolha semanal ou quinzenal.' }),
});

export const pauseInputSchema = z.strictObject({
  startDate: dateSchema,
  returnDate: dateSchema.nullable().optional(),
});

// Ciclo que contém o dia (DEC-049); sem dia, o de hoje.
export const cycleQuerySchema = z.object({ date: dateSchema.optional() });

// A sessão da recorrência é identificada pelo dia em que cairia pela regra.
export const sessionParamsSchema = z.object({ date: dateSchema });

export const cancelSessionSchema = z.strictObject({ reason: reasonSchema });

export const rescheduleSessionSchema = z.strictObject({ date: dateSchema, time: timeSchema, reason: reasonSchema });

export type AppointmentInput = z.infer<typeof appointmentInputSchema>;
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;
export type CycleQuery = z.infer<typeof cycleQuerySchema>;
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
export type PauseInput = z.infer<typeof pauseInputSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSessionSchema>;
