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
// O resultado vale por 10 s, e chamadas ao mesmo tempo esperam a mesma consulta: a rota é pública,
// e assim um robô não ocupa as conexões do banco (achado do revisor-seguranca).
const READINESS_CACHE_MS = 10_000;

export type DatabasePing = () => Promise<unknown>;

const pingDatabase: DatabasePing = () => prisma.$queryRaw`SELECT 1`;

async function checkDatabase(ping: DatabasePing): Promise<ReadinessResponse['status']> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      ping(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), READINESS_TIMEOUT_MS);
      }),
    ]);
    return 'ok';
  } catch (err) {
    // Só o código do erro: a mensagem do Prisma pode trazer o endereço do banco.
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : 'sem-codigo';
    logger.error({ dbErrorCode: code }, 'Prontidão: o banco não respondeu');
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}

// Prontidão (DEC-141): para o monitor de queda (UptimeRobot), que precisa saber se o banco responde.
// Fica fora do healthcheck do deploy, que continua no /health acima.
export function createReadiness(ping: DatabasePing = pingDatabase, now: () => number = Date.now) {
  let cached: { at: number; result: Promise<ReadinessResponse['status']> } | undefined;
  return async function getReadiness(): Promise<ReadinessResponse> {
    const current = now();
    if (!cached || current - cached.at >= READINESS_CACHE_MS) cached = { at: current, result: checkDatabase(ping) };
    return { status: await cached.result, version: shortVersion(env.RAILWAY_GIT_COMMIT_SHA) };
  };
}

export const getReadiness = createReadiness();
