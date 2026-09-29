import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../features/activities/activities-api';
import type { Appointment } from '../features/appointments/appointments-api';
import type { PatientSummary } from '../features/therapist/therapist-api';
import { renderRoute } from '../test/render';
import { apiError, fakeActivity, fakeUser, server } from '../test/server';

// Terapeuta e paciente fictícios (regra 5). "Hoje" fixo: quinta, 24/09/2026.
const PATIENT_ID = '00000000-0000-4000-8000-00000000000a';
const BASE = `*/api/therapist/patients/${PATIENT_ID}`;
const TODAY = '2026-09-24';

function appointment(appointmentDate: string): Appointment {
  return {
    id: `00000000-0000-4000-8000-0000000${appointmentDate.replaceAll('-', '').slice(3)}`,
    appointmentDate,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
  };
}

function summary(overrides: Partial<PatientSummary> = {}): PatientSummary {
  return {
    patient: { id: PATIENT_ID, name: 'Paula Fictícia', email: 'paula@faisca.test', linkedAt: '2026-09-01T15:00:00.000Z' },
    today: TODAY,
    lastAppointment: appointment('2026-09-17'),
    nextAppointment: appointment('2026-09-28'),
    highlight: { from: '2026-09-21', to: '2026-09-27', reason: 'NEXT_APPOINTMENT' },
    ...overrides,
  };
}

// Responde o resumo, as atividades do período pedido e as consultas; guarda os períodos pedidos
// e qualquer escrita (que não deveria existir).
function patientApi({ data = summary(), activities = [] as Activity[] } = {}) {
  const calls: { from: string | null; to: string | null }[] = [];
  const writes: string[] = [];
  server.use(
    http.get(BASE, () => HttpResponse.json(data)),
    http.get(`${BASE}/activities`, ({ request }) => {
      const url = new URL(request.url);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      calls.push({ from, to });
      return HttpResponse.json({
        activities: activities.filter((a) => from && to && a.activityDate >= from && a.activityDate <= to),
      });
    }),
    http.get(`${BASE}/appointments`, () =>
      HttpResponse.json({
        appointments: [data.lastAppointment, data.nextAppointment].filter(Boolean),
        last: data.lastAppointment,
        next: data.nextAppointment,
      }),
    ),
    http.all('*/api/*', ({ request }) => {
      if (request.method !== 'GET') writes.push(`${request.method} ${new URL(request.url).pathname}`);
      return undefined;
    }),
  );
  return { calls, writes };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  server.use(
    http.get('*/api/auth/me', () =>
      HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } }),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

const path = `/pacientes/${PATIENT_ID}`;

describe('/pacientes/:id', () => {
  it('mostra o paciente, as consultas, o destaque e a semana atual', async () => {
    const { calls } = patientApi();
    renderRoute(path);

    expect(await screen.findByRole('heading', { level: 1, name: 'Paula Fictícia' })).toBeInTheDocument();
    expect(screen.getByText('paula@faisca.test')).toBeInTheDocument();
    expect(screen.getByText('Vinculado desde 01/09/2026')).toBeInTheDocument();
    expect(screen.getByText('Próxima').nextSibling).toHaveTextContent('segunda-feira, 28/09');
    expect(screen.getByText('Última').nextSibling).toHaveTextContent('quinta-feira, 17/09');
    expect(screen.getByText(/Em destaque:/).parentElement).toHaveTextContent(
      'Em destaque: 21/09 a 27/09, a semana antes da próxima consulta.',
    );
    expect(await screen.findByRole('heading', { name: '21 a 27 de set.' })).toBeInTheDocument();
    expect(calls[0]).toEqual({ from: '2026-09-21', to: '2026-09-27' });
  });

  it('cards só de leitura: notas, observação e hora do registro, sem nenhum botão de ação', async () => {
    const { writes } = patientApi({
      activities: [
        fakeActivity({
          name: 'Caminhada no parque',
          activityDate: '2026-09-22',
          status: 'CONCLUIDA',
          wantBefore: 3,
          pleasure: 7,
          achievement: 8,
          observation: 'Observação fictícia',
          createdAt: '2026-09-22T21:30:00.000Z',
        }),
        fakeActivity({ name: 'Ler um capítulo', activityDate: '2026-09-24', status: 'PLANEJADA' }),
      ],
    });
    renderRoute(path);

    const done = await screen.findByRole('article', { name: 'Caminhada no parque' });
    expect(done).toHaveTextContent('Prazer7');
    expect(done).toHaveTextContent('Observação fictícia');
    expect(done).toHaveTextContent('Registrado em 22/09, 18:30');
    const planned = screen.getByRole('article', { name: 'Ler um capítulo' });
    expect(within(planned).queryByRole('button')).not.toBeInTheDocument();
    for (const name of ['Conta como foi?', 'Registrar vontade', 'Não aconteceu', 'Editar', 'Excluir', 'Nova atividade']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('figure')).toBeInTheDocument();
    expect(writes).toEqual([]);
  });

  it('marca os dias do destaque e o dia de consulta', async () => {
    patientApi({ data: summary({ highlight: { from: '2026-09-18', to: '2026-09-24', reason: 'LAST_7_DAYS' } }) });
    renderRoute(path);

    const days = await screen.findAllByRole('heading', { level: 3 });
    const text = (label: string) => days.find((d) => d.textContent?.startsWith(label))?.textContent;
    expect(text('segunda-feira, 21/09')).toContain('destaque');
    expect(text('quinta-feira, 24/09')).toContain('hoje');
    expect(text('quinta-feira, 24/09')).toContain('destaque');
    expect(text('sexta-feira, 25/09')).not.toContain('destaque');
    expect(screen.getByText(/Em destaque:/).parentElement).toHaveTextContent(
      'os últimos 7 dias, porque não há próxima consulta cadastrada',
    );
  });

  it('navega entre semanas pela URL', async () => {
    const user = userEvent.setup();
    const { calls } = patientApi();
    const { router } = renderRoute(path);

    await user.click(await screen.findByRole('button', { name: 'Semana anterior' }));

    expect(await screen.findByRole('heading', { name: '14 a 20 de set.' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?semana=2026-09-14');
    expect(calls.at(-1)).toEqual({ from: '2026-09-14', to: '2026-09-20' });
  });

  it('"desde a última consulta" pede da consulta até hoje e mostra só os dias com registro', async () => {
    const user = userEvent.setup();
    const { calls } = patientApi({
      activities: [
        fakeActivity({ name: 'Antes da consulta', activityDate: '2026-09-16' }),
        fakeActivity({ name: 'Depois da consulta', activityDate: '2026-09-19' }),
      ],
    });
    const { router } = renderRoute(path);

    await user.click(await screen.findByRole('button', { name: 'Desde a última consulta' }));

    expect(await screen.findByRole('heading', { name: 'Desde 17/09' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?periodo=desde-a-ultima-consulta');
    expect(calls.at(-1)).toEqual({ from: '2026-09-17', to: '2026-09-24' });
    expect(await screen.findByRole('article', { name: 'Depois da consulta' })).toBeInTheDocument();
    // Só o dia com registro: o 16/09 é de antes da consulta e os dias vazios não aparecem.
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      expect.stringMatching(/^sábado, 19\/09/),
    ]);
    expect(screen.getByRole('button', { name: 'Desde a última consulta' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('com a última consulta há mais de 92 dias, mostra os 92 mais recentes e avisa', async () => {
    const { calls } = patientApi({ data: summary({ lastAppointment: appointment('2026-05-01') }) });
    renderRoute(`${path}?periodo=desde-a-ultima-consulta`);

    expect(await screen.findByText(/Mostramos os 92 dias mais recentes/)).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({ from: '2026-06-25', to: '2026-09-24' });
  });

  it('sem consulta passada, o filtro fica desabilitado e explica por quê', async () => {
    patientApi({ data: summary({ lastAppointment: null, nextAppointment: null }) });
    renderRoute(path);

    const filter = await screen.findByRole('button', { name: 'Desde a última consulta' });
    expect(filter).toBeDisabled();
    expect(filter).toHaveAccessibleDescription('Este filtro aparece quando houver uma consulta passada cadastrada.');
    expect(screen.getByText('Paula ainda não cadastrou consultas.')).toBeInTheDocument();
  });

  it('sem vínculo (403 no resumo): mensagem acolhedora e caminho de volta', async () => {
    server.use(
      http.get(BASE, () => apiError(403, 'FORBIDDEN', 'Você não tem acesso aos registros deste paciente.')),
    );
    renderRoute(path);

    expect(await screen.findByRole('heading', { name: 'Registros indisponíveis' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para Meus pacientes' })).toHaveAttribute('href', '/pacientes');
  });

  it('vínculo desfeito com a tela aberta (403 nas atividades): mesma mensagem', async () => {
    patientApi();
    server.use(
      http.get(`${BASE}/activities`, () =>
        apiError(403, 'FORBIDDEN', 'Você não tem acesso aos registros deste paciente.'),
      ),
    );
    renderRoute(path);

    expect(await screen.findByRole('heading', { name: 'Registros indisponíveis' })).toBeInTheDocument();
  });
});
