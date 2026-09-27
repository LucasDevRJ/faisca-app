import { z } from 'zod';

// Só as variáveis usadas até agora. VAPID entra aqui na etapa dos lembretes,
// para a API não exigir segredo que ainda não usa.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  FRONTEND_URL: z.url(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Quantos proxies ficam na frente da API. Em produção: Vercel + borda do Railway (DEC-023).
  // O rate limit depende disso para enxergar o IP real de quem fez a requisição.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  // HS256 exige pelo menos 256 bits; 32 caracteres é o mínimo aceito.
  // O placeholder do .env.example é recusado, para ninguém subir a API com um segredo público.
  JWT_SECRET: z
    .string()
    .min(32)
    .refine((value) => !value.startsWith('CHANGE_ME')),
  RESEND_API_KEY: z.string().min(1),
  // O domínio de exemplo nunca é aceito pelo Resend: melhor falhar ao subir do que no primeiro cadastro.
  EMAIL_FROM: z
    .string()
    .min(1)
    .refine((value) => !value.includes('seu-dominio.com')),
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
