import { pino } from 'pino';
import { env } from '../config/env.js';

// Rede de segurança para a regra 7 do AGENTS.md: mesmo que um objeto com dado
// sensível chegue ao log, estes campos saem como [REDACTED].
// Não substitui o cuidado de não logar esses dados.
// Revisar a lista quando os models (atividade, vínculo) forem criados.
// Não use 'code' genérico: apagaria o err.code (ex.: P2002 do Prisma).
const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'token',
  'inviteToken',
  'linkCode',
  'name',
  'notes',
  'observation',
  'cookie',
  'authorization',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      ...SENSITIVE_KEYS,
      ...SENSITIVE_KEYS.map((key) => `*.${key}`),
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
});
