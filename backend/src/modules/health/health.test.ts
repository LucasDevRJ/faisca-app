import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { healthResponseSchema } from './health.schema.js';
import { shortVersion } from './health.service.js';

const app = createApp();

describe('GET /health', () => {
  it('responde 200 no formato do schema', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it('devolve o commit curto do ambiente, ou null fora do Railway (DEC-056)', async () => {
    const res = await request(app).get('/health');

    // Não depende de onde o teste roda: compara com o que o próprio ambiente define.
    expect(res.body.version).toBe(shortVersion(process.env.RAILWAY_GIT_COMMIT_SHA));
  });

  it('a versão é o commit curto; valor estranho vira null', () => {
    expect(shortVersion('A04CFED74BAC6D202599CDE134AED9145C6AEBA4')).toBe('a04cfed');
    expect(shortVersion(undefined)).toBeNull();
    expect(shortVersion('')).toBeNull();
    expect(shortVersion('main')).toBeNull();
  });

  it('libera CORS com credenciais só para o FRONTEND_URL', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('Cache-Control (DEC-073)', () => {
  it('toda resposta sai com no-store, inclusive erro', async () => {
    const ok = await request(app).get('/health');
    const missing = await request(app).get('/nao-existe');
    const denied = await request(app).get('/activities');

    for (const res of [ok, missing, denied]) expect(res.headers['cache-control']).toBe('no-store');
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
    // O no-store vem antes do express.json (DEC-073).
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
