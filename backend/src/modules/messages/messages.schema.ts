import { z } from 'zod';

export const messageSchema = z.strictObject({
  topic: z.enum(['LOGISTICA', 'DUVIDA']),
  body: z.string().trim().min(1).max(2000),
});

export const messagePageSchema = z.strictObject({ before: z.uuid().optional() });
export const messagePreferencesSchema = z.strictObject({ email: z.boolean(), push: z.boolean() });

export type MessageInput = z.infer<typeof messageSchema>;
export type MessagePreferences = z.infer<typeof messagePreferencesSchema>;
