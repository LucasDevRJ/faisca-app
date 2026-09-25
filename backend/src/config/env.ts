import { z } from 'zod';

// Só as variáveis usadas até agora. JWT, Resend e VAPID entram aqui na etapa
// em que forem usadas, para a API não exigir segredo que ainda não usa.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  FRONTEND_URL: z.url(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Lista só o nome das variáveis, nunca o valor (pode ser segredo).
    const invalid = Object.keys(z.flattenError(result.error).fieldErrors).join(', ');
    throw new Error(`Variáveis de ambiente ausentes ou inválidas: ${invalid}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
