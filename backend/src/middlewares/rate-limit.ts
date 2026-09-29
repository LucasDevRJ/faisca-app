import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { logger } from '../lib/logger.js';

// Contagem em memória: basta enquanto a API roda em uma instância só no Railway.
// Cada createApp() cria limitadores novos, então os testes não interferem entre si.

type LimitOptions = {
  windowMinutes: number;
  limit: number;
  // 'user' só vale depois do requireAuth.
  key: 'ip' | 'email' | 'ip+email' | 'user';
  // Conta só as tentativas que falharam (usado no login).
  onlyFailures?: boolean;
};

function clientIp(req: Request): string {
  // ipKeyGenerator agrupa IPv6 por sub-rede, para não burlar o limite trocando de endereço.
  return ipKeyGenerator(req.ip ?? 'unknown');
}

function bodyEmail(req: Request): string {
  const email: unknown = req.body?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function createRateLimit({ windowMinutes, limit, key, onlyFailures = false }: LimitOptions) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: onlyFailures,
    // O e-mail entra na chave, mas a chave nunca é logada.
    keyGenerator: (req) => {
      if (key === 'ip') return clientIp(req);
      if (key === 'email') return `email:${bodyEmail(req)}`;
      if (key === 'user') return `user:${req.user?.id ?? clientIp(req)}`;
      return `${clientIp(req)}|${bodyEmail(req)}`;
    },
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Muitas tentativas seguidas. Respire um pouco e tente de novo daqui a alguns minutos.',
        },
      });
    },
    // Avisos de configuração (ex.: trust proxy errado) vão para o pino, não para o console.
    logger: {
      error: (err, message) => logger.error({ err }, message ?? 'Erro no rate limit'),
      warn: (err, message) => logger.warn({ err }, message ?? 'Aviso do rate limit'),
    },
  });
}
