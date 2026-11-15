import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

test('paciente cria e responde; só a profissional vinculada com área liberada lê e marca', async () => {
  const patient = await playwrightRequest.newContext({ baseURL: API_URL });
  const therapist = await playwrightRequest.newContext({ baseURL: API_URL });
  const anon = await playwrightRequest.newContext({ baseURL: API_URL });
  try {
    expect((await patient.post('/auth/login', { data: users.taskPatient })).status()).toBe(200);
    expect((await therapist.post('/auth/login', { data: users.taskTherapist })).status()).toBe(200);
    expect((await anon.get('/tasks')).status()).toBe(401);
    expect((await therapist.post('/tasks', { data: { description: 'Descrição fictícia' } })).status()).toBe(403);
    const created = await patient.post('/tasks', { data: { description: 'Reflexão fictícia da consulta.' } });
    expect(created.status()).toBe(201); const { task } = await created.json();
    const { code } = await (await patient.post('/link/code')).json();
    const redeemed = await therapist.post('/links/redeem-code', { data: { code } });
    expect(redeemed.status()).toBe(201); const patientId = (await redeemed.json()).patient.id;
    const path = `/therapist/patients/${patientId}/tasks`;
    expect((await therapist.get(path)).status()).toBe(403);
    const { links } = await (await patient.get('/link')).json(); const linkId = links[0].id;
    expect((await patient.put(`/link/${linkId}/areas`, { data: { areas: ['TASKS'] } })).status()).toBe(200);
    const response = await patient.put(`/tasks/${task.id}/response`, { data: { responseStatus: 'NAO_CONSEGUI' } });
    expect(response.status()).toBe(200);
    expect((await therapist.get(path)).status()).toBe(200);
    expect((await therapist.put(`${path}/${task.id}/response`, { data: { responseStatus: 'RESPONDIDA', responseText: 'Texto fictício' } })).status()).toBe(403);
    const unreadPath = `/therapist/patients/${patientId}/unread`;
    expect((await (await therapist.get(unreadPath)).json()).counts.tasks).toBe(1);
    expect((await therapist.put(`/therapist/read-marks/${patientId}`, { data: { items: [{ type: 'TASK', id: task.id }] } })).status()).toBe(200);
    expect((await (await therapist.get(unreadPath)).json()).counts.tasks).toBe(0);
    expect((await patient.post('/link/revoke', { data: { linkId } })).status()).toBe(204);
    expect((await therapist.get(path)).status()).toBe(403);
  } finally { await Promise.all([patient.dispose(), therapist.dispose(), anon.dispose()]); }
});
