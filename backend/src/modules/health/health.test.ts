import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { healthResponseSchema } from './health.schema.js';

const app = createApp();

describe('GET /health', () => {
  it('responde 200 no formato do schema', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it('libera CORS com credenciais só para o FRONTEND_URL', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('rota inexistente', () => {
  it('responde 404 em JSON', async () => {
    const res = await request(app).get('/nao-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
  });
});

describe('JSON malformado', () => {
  it('responde 400 sem ecoar o conteúdo enviado', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"senha": "segredo"');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(res.body)).not.toContain('segredo');
  });
});
