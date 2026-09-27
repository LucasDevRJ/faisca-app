import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Activity } from '../features/activities/activities-api';
import type { SessionUser } from '../features/auth/auth-api';

// Pessoa fictícia usada nos testes (regra 5 do AGENTS.md).
export const fakeUser: SessionUser = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Ana Fictícia',
  email: 'ana@faisca.test',
  profiles: { patient: true, therapist: false },
};

// Atividade fictícia com valores padrão; cada teste troca só o que importa.
let activitySeq = 0;
export function fakeActivity(overrides: Partial<Activity> = {}): Activity {
  activitySeq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(activitySeq).padStart(12, '0')}`,
    name: 'Caminhada fictícia',
    activityDate: '2026-09-24',
    status: 'PLANEJADA',
    wantBefore: null,
    pleasure: null,
    achievement: null,
    observation: null,
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
    ...overrides,
  };
}

export function apiError(status: number, code: string, message: string) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

// Sessão logada: sobrescreve o padrão (sem sessão) no teste que precisar.
export const loggedIn = http.get('*/api/auth/me', () => HttpResponse.json({ user: fakeUser }));

// Respostas padrão da API simulada. Cada teste pode sobrescrever com server.use(...).
export const handlers = [
  http.get('*/api/health', () =>
    HttpResponse.json({ status: 'ok', timestamp: '2026-01-01T12:00:00.000Z' }),
  ),
  http.get('*/api/auth/me', () => apiError(401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.')),
  // Semana vazia por padrão.
  http.get('*/api/activities', () => HttpResponse.json({ activities: [] })),
];

export const server = setupServer(...handlers);
