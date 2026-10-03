import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Activity } from '../features/activities/activities-api';
import type { SessionUser } from '../features/auth/auth-api';
import type { TensionEpisode } from '../features/tension-episodes/tension-episodes-api';
import type { ThoughtRecord } from '../features/thought-records/thought-records-api';

// Pessoa fictícia usada nos testes (regra 5 do AGENTS.md).
export const fakeUser: SessionUser = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Ana Fictícia',
  email: 'ana@faisca.test',
  profiles: { patient: true, therapist: false },
  privacyUpToDate: true,
  privacyAreas: { thoughtRecords: true, tensionEpisodes: true },
};

// Conta que só aceitou o aviso de antes do RPD: nenhuma área nova liberada.
export const outdatedPrivacy = {
  privacyUpToDate: false,
  privacyAreas: { thoughtRecords: false, tensionEpisodes: false },
} satisfies Partial<SessionUser>;

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

// Registro de Pensamentos fictício, do dia de hoje dos testes e ainda editável.
let thoughtSeq = 0;
export function fakeThoughtRecord(overrides: Partial<ThoughtRecord> = {}): ThoughtRecord {
  thoughtSeq += 1;
  return {
    id: `00000000-0000-4000-9000-${String(thoughtSeq).padStart(12, '0')}`,
    situationDate: '2026-09-24',
    situation: 'Situação fictícia',
    automaticThought: 'Pensamento fictício',
    beliefLevel: 7,
    emotions: [{ emotion: 'ANSIEDADE', intensity: 8, otherLabel: null }],
    behavior: 'Comportamento fictício',
    consequence: 'Consequência fictícia',
    editable: true,
    createdAt: '2026-09-24T15:00:00.000Z',
    updatedAt: '2026-09-24T15:00:00.000Z',
    ...overrides,
  };
}

// Episódio de tensão fictício (DEC-042); cada teste troca só o que importa.
let tensionSeq = 0;
export function fakeTensionEpisode(overrides: Partial<TensionEpisode> = {}): TensionEpisode {
  tensionSeq += 1;
  return {
    id: `00000000-0000-4000-a000-${String(tensionSeq).padStart(12, '0')}`,
    episodeDate: '2026-09-24',
    episodeTime: '14:30',
    situation: 'Situação fictícia de tensão',
    tensionLevel: 8,
    vocalizeUrge: 6,
    behavior: 'Comportamento fictício',
    consequence: 'Consequência fictícia',
    editable: true,
    createdAt: '2026-09-24T18:00:00.000Z',
    updatedAt: '2026-09-24T18:00:00.000Z',
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
  // Semana vazia e nenhuma consulta, por padrão.
  http.get('*/api/activities', () => HttpResponse.json({ activities: [] })),
  http.get('*/api/thought-records', () => HttpResponse.json({ thoughtRecords: [] })),
  http.get('*/api/tension-episodes', () => HttpResponse.json({ tensionEpisodes: [] })),
  http.get('*/api/appointments', () => HttpResponse.json({ appointments: [], last: null, next: null })),
  // Sem vínculo e sem pacientes, por padrão.
  http.get('*/api/link', () => HttpResponse.json({ link: null, invite: null, code: null })),
  http.get('*/api/links/patients', () => HttpResponse.json({ patients: [] })),
];

export const server = setupServer(...handlers);
