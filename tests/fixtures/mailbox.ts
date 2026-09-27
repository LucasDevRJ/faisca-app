import type { APIRequestContext } from '@playwright/test';
import { API_URL } from './urls.js';

// Lê o último e-mail "enviado" pela API de testes (mailer em memória, backend/scripts/e2e-server.ts)
// e devolve o primeiro link dele.
export async function latestEmailLink(request: APIRequestContext, to: string): Promise<string> {
  const res = await request.get(`${API_URL}/__test__/emails/latest`, { params: { to } });
  if (!res.ok()) throw new Error(`Nenhum e-mail para ${to} (status ${res.status()}).`);
  const { text } = (await res.json()) as { text: string };
  const link = /https?:\/\/\S+/.exec(text)?.[0];
  if (!link) throw new Error('O e-mail não tem link.');
  return link;
}
