import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgendaResponse } from '../features/appointments/appointments-api';
import { renderRoute } from '../test/render';
import { apiError, fakeAgenda, fakeSession, fakeUser, loggedIn, outdatedPrivacy, server } from '../test/server';

// Agenda de consultas (DEC-045). "Hoje" fixo: quinta, 24/09/2026, 15h em São Paulo. Só o relógio é
// simulado. Dados fictícios (regra 5).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  server.use(loggedIn);
});

afterEach(() => {
  vi.useRealTimers();
});

// Agenda semanal às quintas, 14:00, com a sessão de hoje já passada.
const weekly = (overrides: Partial<AgendaResponse> = {}) =>
  fakeAgenda({
    status: 'ATIVA',
    schedule: { startDate: '2026-09-10', time: '14:00', frequency: 'SEMANAL' },
    sessions: ['2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01'].map((d) => fakeSession(d)),
    upcoming: ['2026-10-01', '2026-10-08'].map((d) => fakeSession(d)),
    last: fakeSession('2026-09-24'),
    next: fakeSession('2026-10-01'),
    ...overrides,
  });

function agendaHandler(agenda: AgendaResponse) {
  server.use(http.get('*/api/appointments', () => HttpResponse.json(agenda)));
}

// Guarda as gravações e responde com a agenda (ou com a resposta dada).
function recordWrites(response?: () => Response) {
  const writes: { method: string; path: string; body: unknown }[] = [];
  const handle =
    (method: string) =>
    async ({ request }: { request: Request }) => {
      const text = await request.text();
      writes.push({
        method,
        path: new URL(request.url).pathname.replace(/^\/api/, ''),
        body: text ? JSON.parse(text) : undefined,
      });
      if (response) return response();
      if (method === 'DELETE' && !request.url.includes('/sessions/')) return new HttpResponse(null, { status: 204 });
      return HttpResponse.json(fakeAgenda());
    };
  server.use(
    http.post('*/api/appointments*', handle('POST')),
    http.put('*/api/appointments*', handle('PUT')),
    http.patch('*/api/appointments*', handle('PATCH')),
    http.delete('*/api/appointments*', handle('DELETE')),
  );
  return writes;
}

describe('card de consultas em "Meus registros"', () => {
  it('mostra a próxima e a última sessão, com hora e distância', async () => {
    agendaHandler(weekly());
    renderRoute('/registros');

    const card = await screen.findByRole('region', { name: 'Consultas' });
    expect(within(card).getByText('Próxima').nextElementSibling).toHaveTextContent(
      'quinta-feira, 01/10 às 14:00 · em 7 dias',
    );
    expect(within(card).getByText('Última').nextElementSibling).toHaveTextContent('quinta-feira, 24/09 às 14:00 · hoje');
    expect(within(card).getByRole('link', { name: 'Ver agenda' })).toHaveAttribute('href', '/consultas');
  });

  it('sem agenda, convida a configurar', async () => {
    renderRoute('/registros');

    const card = await screen.findByRole('region', { name: 'Consultas' });
    expect(within(card).getByText(/Configure sua agenda/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Configurar agenda' })).toBeInTheDocument();
  });

  it('em pausa, diz até quando', async () => {
    agendaHandler(weekly({ status: 'PAUSADA', pause: { startDate: '2026-09-20', returnDate: '2026-10-10' } }));
    renderRoute('/registros');

    const card = await screen.findByRole('region', { name: 'Consultas' });
    expect(within(card).getByText('Em pausa até 10/10.')).toBeInTheDocument();
  });

  it('o selo "consulta" marca os dias com sessão agendada, pedindo a semana aberta', async () => {
    const ranges: string[] = [];
    server.use(
      http.get('*/api/appointments', ({ request }) => {
        const url = new URL(request.url);
        ranges.push(`${url.searchParams.get('from')}..${url.searchParams.get('to')}`);
        return HttpResponse.json(
          fakeAgenda({
            sessions: [fakeSession('2026-09-24'), fakeSession('2026-09-22', { status: 'DESMARCADA' })],
          }),
        );
      }),
    );
    renderRoute('/registros');

    const today = await screen.findByRole('heading', { level: 3, name: /hoje/ });
    await waitFor(() => expect(within(today).getByText('consulta')).toBeInTheDocument());
    const tuesday = screen.getByRole('heading', { level: 3, name: /terça-feira/ });
    expect(within(tuesday).queryByText('consulta')).not.toBeInTheDocument();
    expect(ranges).toContain('2026-09-21..2026-09-27');
  });
});

describe('/consultas: configurar e mudar a agenda', () => {
  it('configura a agenda: primeira sessão, hora e frequência', async () => {
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/consultas');

    await user.click(await screen.findByRole('button', { name: 'Configurar agenda' }));
    const dialog = screen.getByRole('dialog', { name: 'Configurar agenda' });
    expect(within(dialog).getByLabelText('Dia da primeira sessão')).toHaveValue('2026-09-24');
    await user.type(within(dialog).getByLabelText('Hora'), '14:00');
    await user.click(within(dialog).getByLabelText('A cada duas semanas'));
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writes).toEqual([
      {
        method: 'PUT',
        path: '/appointments/schedule',
        body: { startDate: '2026-09-24', time: '14:00', frequency: 'QUINZENAL' },
      },
    ]);
  });

  it('sem hora, não envia', async () => {
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/consultas');

    await user.click(await screen.findByRole('button', { name: 'Configurar agenda' }));
    const dialog = screen.getByRole('dialog', { name: 'Configurar agenda' });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(within(dialog).getByText('Escolha a hora.')).toBeInTheDocument();
    expect(writes).toEqual([]);
  });

  it('mostra a regra, as próximas e as anteriores, e o arquivo para o calendário', async () => {
    agendaHandler(weekly());
    renderRoute('/consultas');

    const summary = await screen.findByRole('region', { name: 'Sua agenda' });
    expect(within(summary).getByText('Toda quinta-feira, às 14:00')).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: 'Adicionar à agenda do celular' })).toHaveAttribute(
      'href',
      '/api/appointments/calendar.ics',
    );
    const upcoming = screen.getByRole('region', { name: 'Próximas' });
    expect(within(upcoming).getAllByRole('listitem')).toHaveLength(2);
    const previous = screen.getByRole('region', { name: 'Anteriores' });
    // Da mais recente para a mais antiga, com a de hoje (14:00 já passou).
    expect(within(previous).getAllByRole('listitem')[0]).toHaveTextContent('quinta-feira, 24/09 às 14:00');
  });

  it('mudar a agenda já abre com a hora e a frequência atuais', async () => {
    agendaHandler(weekly());
    const user = userEvent.setup();
    renderRoute('/consultas');

    await user.click(await screen.findByRole('button', { name: 'Mudar' }));
    const dialog = screen.getByRole('dialog', { name: 'Mudar a agenda' });
    expect(within(dialog).getByLabelText('Hora')).toHaveValue('14:00');
    expect(within(dialog).getByLabelText('Toda semana')).toBeChecked();
  });

  it('encerrar pede confirmação', async () => {
    agendaHandler(weekly());
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/consultas');

    await user.click(await screen.findByRole('button', { name: 'Encerrar' }));
    const dialog = screen.getByRole('dialog', { name: 'Encerrar a terapia?' });
    await user.click(within(dialog).getByRole('button', { name: 'Encerrar' }));

    await waitFor(() => expect(writes).toEqual([{ method: 'POST', path: '/appointments/schedule/end', body: undefined }]));
  });
});

describe('/consultas: sessões', () => {
  it('desmarcar pede o motivo', async () => {
    agendaHandler(weekly());
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/consultas');

    await user.click(await screen.findByRole('button', { name: 'Desmarcar sessão de quinta-feira, 01/10 às 14:00' }));
    const dialog = screen.getByRole('dialog', { name: 'Desmarcar esta sessão?' });
    await user.click(within(dialog).getByRole('button', { name: 'Desmarcar' }));
    expect(within(dialog).getByText('Conte o motivo.')).toBeInTheDocument();
    expect(writes).toEqual([]);

    await user.type(within(dialog).getByLabelText('Motivo'), ' Feriado fictício ');
    await user.click(within(dialog).getByRole('button', { name: 'Desmarcar' }));

    await waitFor(() =>
      expect(writes).toEqual([
        { method: 'POST', path: '/appointments/sessions/2026-10-01/cancel', body: { reason: 'Feriado fictício' } },
      ]),
    );
  });

  it('remarcar envia o novo dia, a hora e o motivo; o 409 aparece no formulário', async () => {
    agendaHandler(weekly());
    const writes = recordWrites(() => apiError(409, 'APPOINTMENT_EXISTS', 'Você já tem uma consulta nesse dia.'));
    const user = userEvent.setup();
    renderRoute('/consultas');

    await user.click(await screen.findByRole('button', { name: 'Remarcar a sessão de quinta-feira, 01/10 às 14:00' }));
    const dialog = screen.getByRole('dialog', { name: 'Remarcar esta sessão' });
    const date = within(dialog).getByLabelText('Novo dia');
    await user.clear(date);
    await user.type(date, '2026-10-02');
    await user.type(within(dialog).getByLabelText('Motivo'), 'Viagem fictícia');
    await user.click(within(dialog).getByRole('button', { name: 'Remarcar' }));

    expect(await within(dialog).findByText('Você já tem uma consulta nesse dia.')).toBeInTheDocument();
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/appointments/sessions/2026-10-01/reschedule',
        body: { date: '2026-10-02', time: '14:00', reason: 'Viagem fictícia' },
      },
    ]);
  });

  it('desmarcada e remarcada mostram o motivo e podem ser desfeitas', async () => {
    agendaHandler(
      weekly({
        upcoming: [
          fakeSession('2026-10-01', { status: 'DESMARCADA', reason: 'Feriado fictício' }),
          fakeSession('2026-10-09', { originalDate: '2026-10-08', rescheduled: true, reason: 'Viagem fictícia' }),
        ],
      }),
    );
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/consultas');

    const upcoming = await screen.findByRole('region', { name: 'Próximas' });
    expect(within(upcoming).getByText('desmarcada')).toBeInTheDocument();
    expect(within(upcoming).getByText('Motivo: Feriado fictício')).toBeInTheDocument();
    expect(within(upcoming).getByText('remarcada de 08/10')).toBeInTheDocument();
    await user.click(within(upcoming).getByRole('button', { name: /Desfazer a remarcação/ }));

    await waitFor(() =>
      expect(writes).toEqual([{ method: 'DELETE', path: '/appointments/sessions/2026-10-08/change', body: undefined }]),
    );
  });

  it('sessão passada: dá para registrar a falta, mas não remarcar', async () => {
    agendaHandler(weekly());
    renderRoute('/consultas');

    const previous = await screen.findByRole('region', { name: 'Anteriores' });
    const item = within(previous).getAllByRole('listitem')[1]!;
    expect(within(item).getByRole('button', { name: /Registrar falta/ })).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: /Remarcar/ })).not.toBeInTheDocument();
  });

  it('consulta avulsa nova: dia e hora', async () => {
    agendaHandler(weekly());
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/consultas');

    await user.click(await screen.findByRole('button', { name: 'Nova consulta avulsa' }));
    const dialog = screen.getByRole('dialog', { name: 'Nova consulta avulsa' });
    await user.type(within(dialog).getByLabelText('Hora'), '18:30');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(writes).toEqual([
        { method: 'POST', path: '/appointments', body: { appointmentDate: '2026-09-24', appointmentTime: '18:30' } },
      ]),
    );
  });
});

describe('/consultas: pausa', () => {
  it('pausar sem data de volta', async () => {
    agendaHandler(weekly());
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/consultas');

    await user.click(await screen.findByRole('button', { name: 'Pausar' }));
    const dialog = screen.getByRole('dialog', { name: 'Pausar a terapia' });
    await user.click(within(dialog).getByRole('button', { name: 'Pausar' }));

    await waitFor(() =>
      expect(writes).toEqual([
        { method: 'POST', path: '/appointments/pause', body: { startDate: '2026-09-24', returnDate: null } },
      ]),
    );
  });

  it('em pausa: mostra até quando e "Retomar agora"', async () => {
    agendaHandler(weekly({ status: 'PAUSADA', pause: { startDate: '2026-09-20', returnDate: null } }));
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/consultas');

    const summary = await screen.findByRole('region', { name: 'Sua agenda' });
    expect(within(summary).getByText('Em pausa.')).toBeInTheDocument();
    expect(within(summary).queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument();
    await user.click(within(summary).getByRole('button', { name: 'Retomar agora' }));

    await waitFor(() => expect(writes).toEqual([{ method: 'POST', path: '/appointments/pause/resume', body: undefined }]));
  });
});

describe('/consultas: aceite do aviso (DEC-045)', () => {
  it('sem o aceite da agenda: pede o aceite, mostra a lista e esconde as ações', async () => {
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, ...outdatedPrivacy } })));
    agendaHandler(weekly());
    renderRoute('/consultas');

    expect(await screen.findByRole('heading', { name: 'Antes de começar' })).toBeInTheDocument();
    expect(screen.getByText(/incluir a agenda de consultas/)).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Próximas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mudar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desmarcar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova consulta avulsa' })).not.toBeInTheDocument();
  });
});
