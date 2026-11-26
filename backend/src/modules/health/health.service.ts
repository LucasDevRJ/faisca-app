import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import type { HealthResponse, ReadinessResponse } from './health.schema.js';

// O commit curto, como o GitHub mostra (DEC-056). O repositório é público: o commit não é segredo.
export function shortVersion(sha: string | undefined): string | null {
  const short = sha?.trim().slice(0, 7).toLowerCase();
  return short && /^[0-9a-f]{7}$/.test(short) ? short : null;
}

// Liveness: responde se o processo está de pé. Não consulta o banco,
// para o healthcheck do deploy não derrubar a API por instabilidade do Postgres.
// A versão serve para conferir, depois de um merge, se a API nova já está no ar.
export function getHealth(): HealthResponse {
  return { status: 'ok', timestamp: new Date().toISOString(), version: shortVersion(env.RAILWAY_GIT_COMMIT_SHA) };
}

const READINESS_TIMEOUT_MS = 3000;

export type DatabasePing = () => Promise<unknown>;

const pingDatabase: DatabasePing = () => prisma.$queryRaw`SELECT 1`;

// Prontidão (DEC-141): para o monitor de queda (UptimeRobot), que precisa saber se o banco responde.
// Fica fora do healthcheck do deploy, que continua no /health acima.
export async function getReadiness(ping: DatabasePing = pingDatabase): Promise<ReadinessResponse> {
  const version = shortVersion(env.RAILWAY_GIT_COMMIT_SHA);
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      ping(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Banco sem resposta a tempo')), READINESS_TIMEOUT_MS);
      }),
    ]);
    return { status: 'ok', version };
  } catch (err) {
    logger.error({ err }, 'Prontidão: o banco não respondeu');
    return { status: 'unavailable', version };
  } finally {
    clearTimeout(timer);
  }
}
