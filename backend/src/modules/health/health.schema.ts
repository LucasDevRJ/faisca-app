import { z } from 'zod';

// Health não recebe entrada; o schema documenta o formato da resposta.
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
