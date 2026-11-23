import { z } from 'zod';
import { linkedRecordTypeSchema } from '../record-links/record-links.schema.js';

// "Sobre um registro" (DEC-128) sempre traz a referência; os outros assuntos nunca trazem.
export const messageSchema = z.strictObject({
  topic: z.enum(['LOGISTICA', 'DUVIDA', 'REGISTRO']),
  body: z.string().trim().min(1).max(2000),
  record: z.strictObject({ type: linkedRecordTypeSchema, id: z.uuid() }).optional(),
}).refine((value) => (value.topic === 'REGISTRO') === (value.record !== undefined), {
  message: 'Escolha o registro só no assunto "Sobre um registro".', path: ['record'],
});

export const messagePageSchema = z.strictObject({ before: z.uuid().optional() });
export const messageSeenSchema = z.strictObject({ lastMessageId: z.uuid() });
// recordTopics só vale para a profissional (DEC-128): receber mensagens "Sobre um registro".
export const messagePreferencesSchema = z.strictObject({ email: z.boolean(), push: z.boolean(), recordTopics: z.boolean().optional() });

export type MessageInput = z.infer<typeof messageSchema>;
export type MessagePreferences = z.infer<typeof messagePreferencesSchema>;
