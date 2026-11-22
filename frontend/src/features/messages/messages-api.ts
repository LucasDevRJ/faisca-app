import { api } from '../../lib/api';

export const MESSAGE_LIMIT = 2000;
export const messageTopics = { LOGISTICA: 'Logística da consulta', DUVIDA: 'Dúvida breve' } as const;
export type MessageTopic = keyof typeof messageTopics;
export type Conversation = {
  id: string;
  name: string;
  counterpart: 'PATIENT' | 'PSICOLOGIA' | 'PSIQUIATRIA';
  available: boolean;
};
export type Message = { id: string; mine: boolean; topic: MessageTopic; body: string; createdAt: string };
type MessagePage = { messages: Message[]; next: string | null };
export type MessageChoices = { email: boolean; push: boolean };
export type MessagePreferences = MessageChoices & { pushPublicKey: string | null };

export async function fetchConversations(signal?: AbortSignal) {
  const { data } = await api.get<Conversation[]>('/messages', { signal });
  return data;
}

export async function fetchMessages(id: string, before?: string, signal?: AbortSignal) {
  const { data } = await api.get<MessagePage>(`/messages/${encodeURIComponent(id)}`, { params: { before }, signal });
  return data;
}

export async function sendMessage(id: string, input: { body: string; topic: MessageTopic }) {
  await api.post(`/messages/${encodeURIComponent(id)}`, input);
}

export async function fetchMessagePreferences(signal?: AbortSignal) {
  const { data } = await api.get<MessagePreferences>('/messages/preferences', { signal });
  return data;
}

export async function updateMessagePreferences(choices: MessageChoices) {
  await api.put('/messages/preferences', choices);
}
