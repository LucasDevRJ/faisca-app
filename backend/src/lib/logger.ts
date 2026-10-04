import { pino } from 'pino';
import { env } from '../config/env.js';

// Rede de segurança para a regra 7 do AGENTS.md: mesmo que um objeto com dado
// sensível chegue ao log, estes campos saem como [REDACTED].
// Não substitui o cuidado de não logar esses dados.
// Revisar a lista quando novos models com dado sensível forem criados.
// Não use 'code' genérico: apagaria o err.code (ex.: P2002 do Prisma).
const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'email',
  'token',
  'tokenHash',
  'inviteToken',
  'linkCode',
  // Vínculo (DEC-031): hash do código e e-mail para onde o convite foi.
  'codeHash',
  'therapistEmail',
  'name',
  'notes',
  'observation',
  // Notas da atividade: vontade, prazer e realização (DEC-028).
  'wantBefore',
  'pleasure',
  'achievement',
  // Registro de Pensamentos (DEC-039): os textos, a crença, as emoções e as intensidades.
  'situation',
  'automaticThought',
  'beliefLevel',
  'behavior',
  'consequence',
  'emotions',
  'intensity',
  'otherLabel',
  // Episódios de tensão (DEC-042): as duas notas (situation, behavior e consequence já estão acima).
  'tensionLevel',
  'vocalizeUrge',
  // Agenda (DEC-045): motivo de desmarcar ou remarcar.
  'reason',
  // Ação (DEC-051): a expectativa (nome, prazer, realização e observação já estão acima).
  'expectation',
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
