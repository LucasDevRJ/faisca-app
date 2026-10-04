import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../features/activities/activities-api';
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
      HttpResponse.json(
        fakeAgenda({
          status: data.agendaStatus,
          sessions: [data.lastAppointment, data.nextAppointment].flatMap((s) => (s ? [fakeSession(s.date)] : [])),
        }),
      ),
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

  it('mostra os registros só para leitura, com a hora do registro e o destaque', async () => {
    const { writes } = patientApi();
    const calls = thoughtsApi([fakeThoughtRecord({ situation: 'Situação da paciente', situationDate: '2026-09-22' })]);
    renderRoute(`${path}?aba=pensamentos`);

    const card = await screen.findByRole('article', { name: 'Registro: Situação da paciente' });
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(within(card).getByText(/Registrado em/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pensamentos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('destaque')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Desde a última consulta' }));

    await waitFor(() => expect(router.state.location.search).toBe('?periodo=desde-a-ultima-consulta&aba=pensamentos'));
    await waitFor(() => expect(calls.at(-1)).toEqual({ from: '2026-09-17', to: TODAY }));
    await user.click(screen.getByRole('button', { name: 'Atividades' }));
    await waitFor(() => expect(router.state.location.search).toBe('?periodo=desde-a-ultima-consulta'));
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

  it('mostra os episódios só para leitura, com a hora, o destaque e o gráfico com tabela', async () => {
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
    expect(screen.getAllByText('destaque').length).toBeGreaterThan(0);

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
    await user.click(screen.getByRole('button', { name: 'Desde a última consulta' }));

    await waitFor(() => expect(router.state.location.search).toBe('?periodo=desde-a-ultima-consulta&aba=tensao'));
    await waitFor(() => expect(calls.at(-1)).toEqual({ from: '2026-09-17', to: TODAY }));
  });

  it('terapeuta que só aceitou a versão do RPD: pedido de aceite com o texto dela, sem buscar', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: {
            ...fakeUser,
            profiles: { patient: false, therapist: true },
            privacyUpToDate: false,
            privacyAreas: { thoughtRecords: true, tensionEpisodes: false, appointmentSchedule: false },
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
            privacyAreas: { thoughtRecords: true, tensionEpisodes: true, appointmentSchedule: false },
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
