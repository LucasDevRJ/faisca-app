import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

// Sono, humor e remédio (DEC-107). Só os últimos 7 dias aceitam registro, então a data é a de hoje
// em São Paulo (a única exceção à regra das datas fixas do tests/CLAUDE.md).
function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

test('paciente registra o dia; a profissional só lê, e só as caixas liberadas', async () => {
  const patient = await playwrightRequest.newContext({ baseURL: API_URL });
  const therapist = await playwrightRequest.newContext({ baseURL: API_URL });
  const anon = await playwrightRequest.newContext({ baseURL: API_URL });
  const today = todayInSaoPaulo();
  const params = { from: today, to: today };
  try {
    expect((await patient.post('/auth/login', { data: users.sleepPatient })).status()).toBe(200);
    expect((await therapist.post('/auth/login', { data: users.sleepTherapist })).status()).toBe(200);

    // Sem sessão e sem perfil de paciente, nada.
    expect((await anon.get('/daily-check-ins', { params })).status()).toBe(401);
    expect((await therapist.put(`/daily-check-ins/${today}`, { data: { mood: 5 } })).status()).toBe(403);

    const saved = await patient.put(`/daily-check-ins/${today}`, {
      data: { bedTime: '23:30', wakeTime: '07:00', sleepQuality: 6, mood: 7, moodWord: 'fictícia', medication: 'TOMOU' },
    });
    expect(saved.status()).toBe(200);
    expect((await saved.json()).checkIn.sleepMinutes).toBe(450);

    // Vínculo novo começa sem nenhuma caixa: 403.
    const { code } = await (await patient.post('/link/code')).json();
    const redeemed = await therapist.post('/links/redeem-code', { data: { code } });
    expect(redeemed.status()).toBe(201);
    const patientId = (await redeemed.json()).patient.id;
    const path = `/therapist/patients/${patientId}/daily-check-ins`;
    expect((await therapist.get(path, { params })).status()).toBe(403);

    // Só o Remédio liberado: vê o remédio, sem sono, humor nem a palavra do dia.
    const { links } = await (await patient.get('/link')).json();
    const linkId = links[0].id;
    expect((await patient.put(`/link/${linkId}/areas`, { data: { areas: ['MEDICATION'] } })).status()).toBe(200);
    const onlyMedication = await therapist.get(path, { params });
    expect(onlyMedication.status()).toBe(200);
    expect((await onlyMedication.json()).checkIns).toEqual([
      expect.objectContaining({ medication: 'TOMOU', mood: null, moodWord: null, sleepMinutes: null }),
    ]);

    // Escrita da profissional: sempre 403.
    expect((await therapist.put(`${path}/${today}`, { data: { mood: 1 } })).status()).toBe(403);
    expect((await therapist.delete(`${path}/${today}`)).status()).toBe(403);

    // Vínculo desfeito: o acesso cai.
    expect((await patient.post('/link/revoke', { data: { linkId } })).status()).toBe(204);
    expect((await therapist.get(path, { params })).status()).toBe(403);
  } finally {
    await Promise.all([patient.dispose(), therapist.dispose(), anon.dispose()]);
  }
});
