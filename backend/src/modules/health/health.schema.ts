import { z } from 'zod';

// Health não recebe entrada; o schema documenta o formato da resposta.
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.iso.datetime(),
  // Os 7 primeiros caracteres do commit no ar (DEC-056); null fora do Railway.
  version: z.string().regex(/^[0-9a-f]{7}$/).nullable(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
