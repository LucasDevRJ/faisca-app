import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Respostas padrão da API simulada. Cada teste pode sobrescrever com server.use(...).
export const handlers = [
  http.get('*/api/health', () =>
    HttpResponse.json({ status: 'ok', timestamp: '2026-01-01T12:00:00.000Z' }),
  ),
];

export const server = setupServer(...handlers);
