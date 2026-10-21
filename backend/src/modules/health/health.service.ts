import { env } from '../../config/env.js';
import type { HealthResponse } from './health.schema.js';

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
