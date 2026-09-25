import type { HealthResponse } from './health.schema.js';

// Liveness: responde se o processo está de pé. Não consulta o banco,
// para o healthcheck do deploy não derrubar a API por instabilidade do Postgres.
export function getHealth(): HealthResponse {
  return { status: 'ok', timestamp: new Date().toISOString() };
}
