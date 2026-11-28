import { api } from '../../lib/api';

export const HELP_ASSISTANT_ENABLED = import.meta.env.VITE_HELP_ASSISTANT_ENABLED === 'true';
export const HELP_CONSENT_VERSION = 'help-2026-11-27';
export type HelpAnswer = {
  answer: string;
  sources: { title: string; href: string }[];
  guideVersion: string;
};

export async function askHelp(question: string): Promise<HelpAnswer> {
  const { data: token } = await api.get<{ csrfToken: string }>('/help/csrf');
  const { data } = await api.post<HelpAnswer>('/help/ask', {
    question, accepted: true, consentVersion: HELP_CONSENT_VERSION,
  }, { timeout: 25_000, headers: { 'X-CSRF-Token': token.csrfToken } });
  return data;
}
