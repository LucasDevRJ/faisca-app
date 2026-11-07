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
  // Chave do HMAC dos códigos de vínculo (DEC-031). Separada do JWT_SECRET: trocar uma não
  // invalida a outra. Mesmas regras: 32 caracteres ou mais e nada de placeholder.
  LINK_CODE_SECRET: z
    .string()
    .min(32)
    .refine((value) => !value.startsWith('CHANGE_ME')),
  RESEND_API_KEY: z.string().min(1),
  // O domínio de exemplo nunca é aceito pelo Resend: melhor falhar ao subir do que no primeiro cadastro.
  EMAIL_FROM: z
    .string()
    .min(1)
    .refine((value) => !value.includes('seu-dominio.com')),
  // Commit em produção, preenchido sozinho pelo Railway em cada deploy. O /health o devolve para
  // conferir qual versão da API está no ar (DEC-056). Fora do Railway, fica vazio.
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
  // Web Push (DEC-089): opcionais quando nenhuma das três foi configurada (ou ainda estão com o
  // placeholder do .env.example); quando configuradas, as três precisam vir juntas e válidas.
  VAPID_PUBLIC_KEY: z.string().min(60).optional(),
  VAPID_PRIVATE_KEY: z.string().min(32).optional(),
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:.+@.+\..+|https:\/\/.+)$/)
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

function isVapidPlaceholder(key: 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT', value: string | undefined) {
  if (!value) return true;
  if (value.startsWith('CHANGE_ME')) return true;
  if (key === 'VAPID_SUBJECT' && value.includes('seu-dominio.com')) return true;
  return false;
}

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const pubPlaceholder = isVapidPlaceholder('VAPID_PUBLIC_KEY', source.VAPID_PUBLIC_KEY);
  const privPlaceholder = isVapidPlaceholder('VAPID_PRIVATE_KEY', source.VAPID_PRIVATE_KEY);
  const subPlaceholder = isVapidPlaceholder('VAPID_SUBJECT', source.VAPID_SUBJECT);
  // Se todas ainda estão vazias ou com o placeholder do .env.example, o Web Push fica desligado.
  // Se só parte foi preenchida, valida todas como obrigatórias para apontar a que faltou.
  const allPlaceholders = pubPlaceholder && privPlaceholder && subPlaceholder;
  const normalized: NodeJS.ProcessEnv = allPlaceholders
    ? {
        ...source,
        VAPID_PUBLIC_KEY: undefined,
        VAPID_PRIVATE_KEY: undefined,
        VAPID_SUBJECT: undefined,
      }
    : {
        ...source,
        VAPID_PUBLIC_KEY: pubPlaceholder ? '' : source.VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY: privPlaceholder ? '' : source.VAPID_PRIVATE_KEY,
        VAPID_SUBJECT: subPlaceholder ? '' : source.VAPID_SUBJECT,
      };

  const result = envSchema.safeParse(normalized);
  if (!result.success) {
    // Lista só o nome das variáveis, nunca o valor (pode ser segredo).
    const invalid = Object.keys(z.flattenError(result.error).fieldErrors).join(', ');
    throw new Error(`Variáveis de ambiente ausentes ou inválidas: ${invalid}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
