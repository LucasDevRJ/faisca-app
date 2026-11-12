import { expect, type APIRequestContext } from '@playwright/test';

// As áreas que o paciente libera para cada profissional (DEC-097), as mesmas da API.
export const ALL_AREAS = [
  'ACTIVITIES',
  'THOUGHT_RECORDS',
  'TENSION_EPISODES',
  'ACTIONS',
  'ACTION_PHOTOS',
  'ABOUT_ME',
  'APPOINTMENTS',
  'PLANS',
];

// Vínculo novo começa sem área nenhuma (DEC-097). Os testes que leem os registros liberam tudo,
// como os vínculos de antes. `prefix`: '/api' quando o pedido passa pelo front (e2e).
export async function shareAllAreas(patient: APIRequestContext, prefix = '') {
  const { links } = (await (await patient.get(`${prefix}/link`)).json()) as { links: { id: string }[] };
  for (const link of links) {
    const res = await patient.put(`${prefix}/link/${link.id}/areas`, { data: { areas: ALL_AREAS } });
    expect(res.status()).toBe(200);
  }
}
