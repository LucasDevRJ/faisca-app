import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHARED_AREAS, type SharedArea } from '../features/links/links-api';
import type { PatientSummary } from '../features/therapist/therapist-api';
import { renderRoute } from '../test/render';
import { fakeAgenda, fakeUser, server } from '../test/server';

// A página do paciente vista pela profissional (DEC-097, DEC-099): só as abas que o paciente liberou
// e, na psiquiatra, o período em meses. Dados fictícios (regra 5). "Hoje": quinta, 12/11/2026.
const PATIENT_ID = '00000000-0000-4000-8000-00000000000a';
const BASE = `*/api/therapist/patients/${PATIENT_ID}`;
const TODAY = '2026-11-12';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T18:00:00Z'));
  try {
    localStorage.clear();
  } catch {
    // Sem armazenamento, os testes seguem.
  }
});

afterEach(() => {
  vi.useRealTimers();
});

function summary(kind: 'PSICOLOGIA' | 'PSIQUIATRIA', sharedAreas: SharedArea[]): PatientSummary {
  return {
    patient: { id: PATIENT_ID, name: 'Paula Fictícia', email: 'paula@faisca.test', linkedAt: '2026-09-01T15:00:00.000Z', avatarVersion: null },
    today: TODAY,
    lastAppointment: null,
    nextAppointment: null,
    agendaStatus: sharedAreas.includes('APPOINTMENTS') ? 'SEM_AGENDA' : null,
    pause: null,
    highlight: { from: '2026-11-06', to: TODAY, reason: 'LAST_7_DAYS' },
    access: { kind, sharedAreas },
  };
}

// A API da profissional: o resumo e as listas, guardando os períodos pedidos.
function professionalApi(kind: 'PSICOLOGIA' | 'PSIQUIATRIA', sharedAreas: SharedArea[]) {
  const ranges: string[] = [];
  server.use(
    http.get('*/api/auth/me', () =>
      HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } }),
    ),
    http.get(BASE, () => HttpResponse.json(summary(kind, sharedAreas))),
    http.get(`${BASE}/cycle`, () => HttpResponse.json({ today: TODAY, cycle: null })),
    http.get(`${BASE}/appointments`, () => HttpResponse.json(fakeAgenda())),
    http.get(`${BASE}/activities`, ({ request }) => {
      const url = new URL(request.url);
      ranges.push(`${url.searchParams.get('from')}..${url.searchParams.get('to')}`);
      return HttpResponse.json({ activities: [] });
    }),
    http.get(`${BASE}/thought-records`, ({ request }) => {
      const url = new URL(request.url);
      ranges.push(`${url.searchParams.get('from')}..${url.searchParams.get('to')}`);
      return HttpResponse.json({ thoughtRecords: [] });
    }),
  );
  return ranges;
}

describe('página do paciente na visão da profissional', () => {
  it('só as abas liberadas; sem a agenda, sem o cartão de consultas', async () => {
    professionalApi('PSICOLOGIA', ['THOUGHT_RECORDS', 'TENSION_EPISODES']);
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const tabs = await screen.findByRole('group', { name: 'Tipo de registro' });
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual(['Pensamentos', 'Tensão']);
    // A aba aberta é a primeira liberada (Atividades está fechada).
    expect(within(tabs).getByRole('button', { name: 'Pensamentos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('heading', { name: 'Consultas' })).not.toBeInTheDocument();
  });

  it('sem nenhuma área liberada, explica e não mostra abas', async () => {
    professionalApi('PSIQUIATRIA', []);
    renderRoute(`/pacientes/${PATIENT_ID}`);

    expect(
      await screen.findByText('Paula ainda não liberou nenhuma área para você. Quando liberar, os registros aparecem aqui.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Tipo de registro' })).not.toBeInTheDocument();
  });

  it('a psiquiatra vê por meses: começa em 3, troca para 1 e volta no tempo', async () => {
    const ranges = professionalApi('PSIQUIATRIA', [...SHARED_AREAS]);
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const months = await screen.findByRole('group', { name: 'Quantos meses ver' });
    expect(within(months).getByRole('button', { name: '3 meses' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('heading', { name: '13/08 a 12/11' })).toBeInTheDocument();
    expect(screen.getByText('Últimos 3 meses')).toBeInTheDocument();
    expect(ranges).toContain('2026-08-13..2026-11-12');

    await user.click(within(months).getByRole('button', { name: '1 mês' }));
    expect(await screen.findByRole('heading', { name: '13/10 a 12/11' })).toBeInTheDocument();
    expect(screen.getByText('Último mês')).toBeInTheDocument();

    // No período atual, não há "Próximo".
    expect(screen.getByRole('button', { name: 'Próximo período' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Período anterior' }));
    expect(await screen.findByRole('heading', { name: '13/09 a 12/10' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próximo período' })).toBeEnabled();
  });

  it('uma aba fechada pedida na URL abre a primeira liberada; ?ate no futuro vira hoje', async () => {
    professionalApi('PSIQUIATRIA', ['THOUGHT_RECORDS']);
    renderRoute(`/pacientes/${PATIENT_ID}?aba=tensao&ate=2099-01-01`);

    const tabs = await screen.findByRole('group', { name: 'Tipo de registro' });
    expect(within(tabs).getByRole('button', { name: 'Pensamentos' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('heading', { name: '13/08 a 12/11' })).toBeInTheDocument();
  });
});

describe('Conta: meu perfil profissional', () => {
  function profileApi(professional: { kind: 'PSICOLOGIA' | 'PSIQUIATRIA'; councilNumber: string | null }, locked = false) {
    const sent: unknown[] = [];
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } }),
      ),
      http.get('*/api/profile', () =>
        HttpResponse.json({ profile: { fullName: null, palette: 'SALVIA', avatarVersion: null, professional } }),
      ),
      http.patch('*/api/profile', async ({ request }) => {
        const body = (await request.json()) as { professional: typeof professional };
        sent.push(body);
        if (locked) {
          return HttpResponse.json(
            { error: { code: 'PROFESSIONAL_KIND_LOCKED', message: 'Para trocar o tipo de profissional, os pacientes precisam desfazer o vínculo com você antes.' } },
            { status: 409 },
          );
        }
        return HttpResponse.json({
          profile: { fullName: null, palette: 'SALVIA', avatarVersion: null, professional: { ...professional, ...body.professional } },
        });
      }),
    );
    return sent;
  }

  it('mostra a profissão e salva o conselho', async () => {
    const sent = profileApi({ kind: 'PSIQUIATRIA', councilNumber: null });
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Meu perfil profissional' });
    expect(within(section).getByRole('radio', { name: 'Sou psiquiatra' })).toBeChecked();
    await user.type(within(section).getByLabelText(/Número do conselho/), 'CRM 00000');
    await user.click(within(section).getByRole('button', { name: 'Salvar' }));

    expect(await within(section).findByText('Salvo.')).toBeInTheDocument();
    expect(sent).toEqual([{ professional: { kind: 'PSIQUIATRIA', councilNumber: 'CRM 00000' } }]);
  });

  it('trocar a profissão com paciente vinculado: mostra o motivo', async () => {
    profileApi({ kind: 'PSICOLOGIA', councilNumber: null }, true);
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Meu perfil profissional' });
    await user.click(within(section).getByRole('radio', { name: 'Sou psiquiatra' }));
    await user.click(within(section).getByRole('button', { name: 'Salvar' }));

    expect(await within(section).findByRole('alert')).toHaveTextContent('precisam desfazer o vínculo com você antes');
  });
});
