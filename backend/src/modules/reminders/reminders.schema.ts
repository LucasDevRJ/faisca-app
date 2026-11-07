import { z } from 'zod';

// Horários sempre em intervalos de 15 minutos no fuso America/Sao_Paulo (SPEC, "Lembretes"; DEC-006).
export const quarterHourTimeSchema = z
  .string()
  .regex(
    /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/,
    'Escolha um horário em intervalos de 15 minutos (ex.: 08:00, 08:15, 08:30, 08:45).',
  );

export const updateRemindersSchema = z
  .strictObject({
    channel: z.enum(['EMAIL', 'PUSH']),
    morningEnabled: z.boolean(),
    morningTime: quarterHourTimeSchema,
    eveningEnabled: z.boolean(),
    eveningTime: quarterHourTimeSchema,
    quietHoursEnabled: z.boolean(),
    quietStart: quarterHourTimeSchema,
    quietEnd: quarterHourTimeSchema,
  })
  .refine((data) => data.quietStart !== data.quietEnd, {
    path: ['quietEnd'],
    message: 'O início e o fim do horário de silêncio precisam ser diferentes.',
  });

export const pauseRemindersSchema = z.strictObject({
  until: z.iso.date('Informe uma data válida no formato AAAA-MM-DD.'),
});

export const pushSubscriptionSchema = z.strictObject({
  endpoint: z.string().trim().min(12).max(2048),
  keys: z.strictObject({
    p256dh: z.string().trim().min(80).max(120),
    auth: z.string().trim().min(16).max(64),
  }),
});

export const deletePushSubscriptionSchema = z.strictObject({
  endpoint: z.string().trim().min(12).max(2048),
});

export type UpdateRemindersInput = z.infer<typeof updateRemindersSchema>;
export type PauseRemindersInput = z.infer<typeof pauseRemindersSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
export type DeletePushSubscriptionInput = z.infer<typeof deletePushSubscriptionSchema>;
