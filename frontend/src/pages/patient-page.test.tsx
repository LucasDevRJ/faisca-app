import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../features/activities/activities-api';
import type { Cycle } from '../features/cycle/cycle-api';
import type { TensionEpisode } from '../features/tension-episodes/tension-episodes-api';
import type { PatientSummary, SessionWhen } from '../features/therapist/therapist-api';
import type { ThoughtRecord } from '../features/thought-records/thought-records-api';
import { renderRoute } from '../test/render';
import { apiError, fakeActivity, fakeAgenda, fakeSession, fakeTensionEpisode, fakeThoughtRecord, fakeUser, outdatedPrivacy, server } from '../test/server';

// Terapeuta e paciente fictícios (regra 5). "Hoje" fixo: quinta, 24/09/2026.
const PATIENT_ID = '00000000-0000-4000-8000-00000000000a';
const BASE = `*/api/therapist/patients/${PATIENT_ID}`;
const TODAY = '2026-09-24';

function appointment(date: string): SessionWhen {
  return { date, time: '14:00', kind: 'RECORRENTE' };
}

function summary(overrides: Partial<PatientSummary> = {}): PatientSummary {
  return {
    patient: { id: PATIENT_ID, name: 'Paula Fictícia', email: 'paula@faisca.test', linkedAt: '2026-09-01T15:00:00.000Z' },
    today: TODAY,
    lastAppointment: appointment('2026-09-17'),
    nextAppointment: appointment('2026-09-28'),
    agendaStatus: 'ATIVA',
    pause: null,
    highlight: { from: '2026-09-21', to: '2026-09-27', reason: 'NEXT_APPOINTMENT' },
    ...overrides,
  };
}

// Responde o resumo, as atividades do período pedido e as consultas; guarda os períodos pedidos
// e qualquer escrita (que não deveria existir).
function patientApi({ data = summary(), activities = [] as Activity[], cycle = null as Cycle | null } = {}) {
  const calls: { from: string | null; to: string | null }[] = [];
  const writes: string[] = [];
  const cycleDates: (string | null)[] = [];
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
      HttpResponse.json(
        fakeAgenda({
          status: data.agendaStatus,
          sessions: [data.lastAppointment, data.nextAppointment].flatMap((s) => (s ? [fakeSession(s.date)] : [])),
        }),
      ),
    ),
    // Ciclo da consulta (DEC-049): guarda o dia pedido de cada chamada.
    http.get(`${BASE}/cycle`, ({ request }) => {
      cycleDates.push(new URL(request.url).searchParams.get('date'));
      return HttpResponse.json({ today: TODAY, cycle });
    }),
    http.get(`${BASE}/thought-records`, () => HttpResponse.json({ thoughtRecords: [] })),
    http.get(`${BASE}/tension-episodes`, () => HttpResponse.json({ tensionEpisodes: [] })),
    http.all('*/api/*', ({ request }) => {
      if (request.method !== 'GET') writes.push(`${request.method} ${new URL(request.url).pathname}`);
      return undefined;
    }),
  );
  return { calls, writes, cycleDates };
}

const CYCLE: Cycle = {
  from: '2026-09-18',
  to: '2026-09-28',
  session: { date: '2026-09-28', time: '14:00', kind: 'RECORRENTE' },
  truncated: false,
  previous: '2026-09-17',
  next: '2026-09-29',
};

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
  it('sem agenda: mostra o paciente, as consultas e a semana atual, sem a alternância', async () => {
    const { calls } = patientApi();
    renderRoute(path);

    expect(await screen.findByRole('heading', { level: 1, name: 'Paula Fictícia' })).toBeInTheDocument();
    expect(screen.getByText('paula@faisca.test')).toBeInTheDocument();
    expect(screen.getByText('Vinculado desde 01/09/2026')).toBeInTheDocument();
    expect(screen.getByText('Próxima').nextSibling).toHaveTextContent('segunda-feira, 28/09');
    expect(screen.getByText('Última').nextSibling).toHaveTextContent('quinta-feira, 17/09');
    expect(await screen.findByRole('heading', { name: '21 a 27 de set.' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Período' })).not.toBeInTheDocument();
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

  it('marca hoje e o dia de consulta', async () => {
    patientApi();
    renderRoute(path);

    const days = await screen.findAllByRole('heading', { level: 3 });
    const text = (label: string) => days.find((d) => d.textContent?.startsWith(label))?.textContent;
    expect(text('quinta-feira, 24/09')).toContain('hoje');
    expect(text('quinta-feira, 24/09')).not.toContain('destaque');
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

  it('com agenda, abre no ciclo da próxima consulta (DEC-050): título, período, contagem e resumo', async () => {
    const { calls, cycleDates } = patientApi({
      cycle: CYCLE,
      activities: [fakeActivity({ name: 'Caminhada no ciclo', activityDate: '2026-09-20', status: 'CONCLUIDA' })],
    });
    renderRoute(path);

    expect(await screen.findByRole('heading', { name: 'Consulta de 28/09' })).toBeInTheDocument();
    expect(screen.getByText('18/09 a 28/09')).toBeInTheDocument();
    expect(screen.getByText('A consulta é daqui a 4 dias.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ciclo' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText(/^11 dias · 1 atividade feita/)).toBeInTheDocument();
    expect(await screen.findByRole('article', { name: 'Caminhada no ciclo' })).toBeInTheDocument();
    expect(calls).toContainEqual({ from: '2026-09-18', to: '2026-09-28' });
    expect(cycleDates[0]).toBeNull();
    // Sem destaque: o ciclo é o período.
    expect(screen.queryByText(/Em destaque/)).not.toBeInTheDocument();
  });

  it('setas do ciclo e a semana ficam na URL', async () => {
    const user = userEvent.setup();
    const { cycleDates } = patientApi({ cycle: CYCLE });
    const { router } = renderRoute(path);

    await user.click(await screen.findByRole('button', { name: 'Ciclo anterior' }));
    await waitFor(() => expect(router.state.location.search).toBe('?ciclo=2026-09-17'));
    await waitFor(() => expect(cycleDates.at(-1)).toBe('2026-09-17'));

    await user.click(screen.getByRole('button', { name: 'Semana' }));
    expect(await screen.findByRole('heading', { name: '21 a 27 de set.' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?semana=2026-09-21');
  });

  it('ciclo com mais de 42 dias: mostra os mais recentes e avisa', async () => {
    patientApi({ cycle: { ...CYCLE, from: '2026-08-18', truncated: true } });
    renderRoute(path);

    expect(await screen.findByText(/Este ciclo passou de 42 dias/)).toBeInTheDocument();
  });

  it('sem consultas, explica', async () => {
    patientApi({ data: summary({ lastAppointment: null, nextAppointment: null }) });
    renderRoute(path);

    expect(await screen.findByText('Paula ainda não cadastrou consultas.')).toBeInTheDocument();
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

describe('/pacientes/:id: aba Registro de Pensamentos (DEC-040)', () => {
  function thoughtsApi(records: ThoughtRecord[]) {
    const calls: { from: string | null; to: string | null }[] = [];
    server.use(
      http.get(`${BASE}/thought-records`, ({ request }) => {
        const url = new URL(request.url);
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        calls.push({ from, to });
        return HttpResponse.json({
          thoughtRecords: records.filter((r) => from && to && r.situationDate >= from && r.situationDate <= to),
        });
      }),
    );
    return calls;
  }

  it('mostra os registros só para leitura, com a hora do registro', async () => {
    const { writes } = patientApi();
    const calls = thoughtsApi([fakeThoughtRecord({ situation: 'Situação da paciente', situationDate: '2026-09-22' })]);
    renderRoute(`${path}?aba=pensamentos`);

    const card = await screen.findByRole('article', { name: 'Registro: Situação da paciente' });
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(within(card).getByText(/Registrado em/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pensamentos' })).toHaveAttribute('aria-pressed', 'true');
    expect(calls[0]).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(writes).toEqual([]);
  });

  it('trocar de aba e de período mantém os dois na URL', async () => {
    patientApi();
    const calls = thoughtsApi([]);
    const user = userEvent.setup();
    const { router } = renderRoute(path);

    await user.click(await screen.findByRole('button', { name: 'Pensamentos' }));
    expect(await screen.findByText('Nenhum registro de pensamentos nesta semana.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));

    await waitFor(() => expect(router.state.location.search).toBe('?aba=pensamentos&semana=2026-09-14'));
    await waitFor(() => expect(calls.at(-1)).toEqual({ from: '2026-09-14', to: '2026-09-20' }));
    await user.click(screen.getByRole('button', { name: 'Atividades' }));
    await waitFor(() => expect(router.state.location.search).toBe('?semana=2026-09-14'));
  });

  it('terapeuta sem o aceite da versão atual: pedido de aceite, sem buscar os registros', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true }, ...outdatedPrivacy } }),
      ),
    );
    patientApi();
    const calls = thoughtsApi([fakeThoughtRecord()]);
    renderRoute(`${path}?aba=pensamentos`);

    expect(await screen.findByRole('heading', { name: 'Antes de começar' })).toBeInTheDocument();
    // Texto de quem lê, e não o do paciente (DEC-041).
    expect(screen.getByRole('checkbox', { name: /acesso aos pensamentos e emoções dos meus pacientes/ })).not.toBeChecked();
    expect(screen.queryByText(/meus pensamentos e emoções/)).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('vínculo desfeito com a aba aberta (403): Registros indisponíveis', async () => {
    patientApi();
    server.use(
      http.get(`${BASE}/thought-records`, () =>
        apiError(403, 'FORBIDDEN', 'Você não tem acesso aos registros deste paciente.'),
      ),
    );
    renderRoute(`${path}?aba=pensamentos`);

    expect(await screen.findByRole('heading', { name: 'Registros indisponíveis' })).toBeInTheDocument();
  });
});

describe('/pacientes/:id: aba Tensão (DEC-043)', () => {
  function tensionApi(episodes: TensionEpisode[]) {
    const calls: { from: string | null; to: string | null }[] = [];
    server.use(
      http.get(`${BASE}/tension-episodes`, ({ request }) => {
        const url = new URL(request.url);
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        calls.push({ from, to });
        return HttpResponse.json({
          tensionEpisodes: episodes.filter((e) => from && to && e.episodeDate >= from && e.episodeDate <= to),
        });
      }),
    );
    return calls;
  }

  it('mostra os episódios só para leitura, com a hora e o gráfico com tabela', async () => {
    const { writes } = patientApi();
    const calls = tensionApi([
      fakeTensionEpisode({ situation: 'Fila do mercado', episodeDate: '2026-09-22', episodeTime: '19:20' }),
      fakeTensionEpisode({ situation: 'Reunião', episodeDate: '2026-09-23', episodeTime: null, tensionLevel: 3 }),
    ]);
    renderRoute(`${path}?aba=tensao`);

    const card = await screen.findByRole('article', { name: 'Episódio: Fila do mercado' });
    expect(within(card).getByText('às 19:20')).toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(within(card).getByText(/Registrado em/)).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Episódio: Reunião' })).getByText('sem horário')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tensão' })).toHaveAttribute('aria-pressed', 'true');

    // O gráfico tem a versão em tabela para leitor de tela, na ordem do tempo.
    const table = screen.getByRole('table', { name: 'Tensão e vontade de vocalizar dos episódios na semana' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))).toEqual([
      ['19:20', '8', '6'],
      ['sem horário', '3', '6'],
    ]);
    expect(calls[0]).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(writes).toEqual([]);
  });

  it('sem episódio no período: mensagem, sem gráfico', async () => {
    patientApi();
    tensionApi([]);
    renderRoute(`${path}?aba=tensao`);

    expect(await screen.findByText('Nenhum episódio de tensão nesta semana.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('trocar de aba e de período mantém os dois na URL', async () => {
    patientApi();
    const calls = tensionApi([]);
    const user = userEvent.setup();
    const { router } = renderRoute(path);

    await user.click(await screen.findByRole('button', { name: 'Tensão' }));
    expect(await screen.findByText('Nenhum episódio de tensão nesta semana.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));

    await waitFor(() => expect(router.state.location.search).toBe('?aba=tensao&semana=2026-09-14'));
    await waitFor(() => expect(calls.at(-1)).toEqual({ from: '2026-09-14', to: '2026-09-20' }));
  });

  it('terapeuta que só aceitou a versão do RPD: pedido de aceite com o texto dela, sem buscar', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: {
            ...fakeUser,
            profiles: { patient: false, therapist: true },
            privacyUpToDate: false,
            privacyAreas: { thoughtRecords: true, tensionEpisodes: false, appointmentSchedule: false, actions: false },
          },
        }),
      ),
    );
    patientApi();
    const calls = tensionApi([fakeTensionEpisode()]);
    renderRoute(`${path}?aba=tensao`);

    expect(await screen.findByRole('heading', { name: 'Antes de começar' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /acesso aos episódios de tensão dos meus pacientes/ })).not.toBeChecked();
    expect(calls).toEqual([]);
  });

  it('vínculo desfeito com a aba aberta (403): Registros indisponíveis', async () => {
    patientApi();
    server.use(
      http.get(`${BASE}/tension-episodes`, () =>
        apiError(403, 'FORBIDDEN', 'Você não tem acesso aos registros deste paciente.'),
      ),
    );
    renderRoute(`${path}?aba=tensao`);

    expect(await screen.findByRole('heading', { name: 'Registros indisponíveis' })).toBeInTheDocument();
  });
});

describe('/pacientes/:id: agenda (DEC-045)', () => {
  it('selo da pausa e a agenda com os motivos, só para ler', async () => {
    const { writes } = patientApi({
      data: summary({ agendaStatus: 'PAUSADA', pause: { startDate: '2026-09-20', returnDate: '2026-10-12' } }),
    });
    server.use(
      http.get(`${BASE}/appointments`, () =>
        HttpResponse.json(
          fakeAgenda({
            status: 'PAUSADA',
            schedule: { startDate: '2026-09-03', time: '14:00', frequency: 'SEMANAL' },
            pause: { startDate: '2026-09-20', returnDate: '2026-10-12' },
            sessions: [fakeSession('2026-09-17', { status: 'DESMARCADA', reason: 'Feriado fictício' })],
            upcoming: [fakeSession('2026-10-15')],
          }),
        ),
      ),
    );
    const user = userEvent.setup();
    renderRoute(path);

    const card = await screen.findByRole('region', { name: 'Consultas' });
    expect(within(card).getByText('Em pausa até 12/10')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Ver a agenda' }));

    expect(await within(card).findByText('Toda quinta-feira, às 14:00')).toBeInTheDocument();
    expect(within(card).getByText('Motivo: Feriado fictício')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Desmarcar|Remarcar|Pausar/ })).not.toBeInTheDocument();
    expect(writes).toEqual([]);
  });

  it('sem o aceite da agenda: pede o aceite no lugar da lista', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: {
            ...fakeUser,
            profiles: { patient: false, therapist: true },
            privacyUpToDate: false,
            privacyAreas: { thoughtRecords: true, tensionEpisodes: true, appointmentSchedule: false, actions: false },
          },
        }),
      ),
    );
    patientApi();
    const user = userEvent.setup();
    renderRoute(path);

    const card = await screen.findByRole('region', { name: 'Consultas' });
    await user.click(within(card).getByRole('button', { name: 'Ver a agenda' }));

    expect(within(card).getByText(/Para ver a agenda dos seus pacientes/)).toBeInTheDocument();
  });
});
