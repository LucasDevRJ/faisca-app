import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Appointment, AppointmentsResponse } from '../features/appointments/appointments-api';
import { renderRoute } from '../test/render';
import { apiError, fakeActivity, loggedIn, server } from '../test/server';

// "Hoje" fixo: quinta, 24/09/2026, 15h em São Paulo. Só o relógio é simulado.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  server.use(loggedIn);
});

afterEach(() => {
  vi.useRealTimers();
});

let seq = 0;
function fakeAppointment(appointmentDate: string): Appointment {
  seq += 1;
  return {
    id: `00000000-0000-4000-9000-${String(seq).padStart(12, '0')}`,
    appointmentDate,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
  };
}

// Responde como a API: da mais recente para a mais antiga, com última e próxima.
function appointmentsHandler(dates: string[]) {
  const appointments = dates.sort().reverse().map(fakeAppointment);
  const today = '2026-09-24';
  const body: AppointmentsResponse = {
    appointments,
    last: appointments.find((a) => a.appointmentDate <= today) ?? null,
    next: [...appointments].reverse().find((a) => a.appointmentDate > today) ?? null,
  };
  server.use(http.get('*/api/appointments', () => HttpResponse.json(body)));
  return appointments;
}

function recordWrites(status = 201, response?: () => Response) {
  const writes: { method: string; path: string; body: unknown }[] = [];
  const handle =
    (method: string) =>
    async ({ request }: { request: Request }) => {
      const text = await request.text();
      const body = text ? JSON.parse(text) : undefined;
      writes.push({ method, path: new URL(request.url).pathname.replace(/^\/api/, ''), body });
      if (response) return response();
      if (method === 'DELETE') return new HttpResponse(null, { status: 204 });
      return HttpResponse.json({ appointment: fakeAppointment((body as Appointment).appointmentDate) }, { status });
    };
  server.use(
    http.post('*/api/appointments', handle('POST')),
    http.patch('*/api/appointments/:id', handle('PATCH')),
    http.delete('*/api/appointments/:id', handle('DELETE')),
  );
  return writes;
}

describe('card de consultas em "Meus registros"', () => {
  it('mostra a próxima e a última consulta, com a distância em dias', async () => {
    appointmentsHandler(['2026-09-10', '2026-09-17', '2026-10-01', '2026-10-15']);
    renderRoute('/registros');

    const card = await screen.findByRole('region', { name: 'Consultas' });
    expect(within(card).getByText('Próxima').nextElementSibling).toHaveTextContent('quinta-feira, 01/10 · em 7 dias');
    expect(within(card).getByText('Última').nextElementSibling).toHaveTextContent('quinta-feira, 17/09 · há 7 dias');
    expect(within(card).getByRole('link', { name: 'Ver consultas' })).toHaveAttribute('href', '/consultas');
  });

  it('sem consultas, convida a cadastrar', async () => {
    renderRoute('/registros');

    const card = await screen.findByRole('region', { name: 'Consultas' });
    expect(within(card).getByText(/Cadastre suas consultas/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Cadastrar' })).toBeInTheDocument();
  });

  it('o dia com consulta ganha o selo "consulta" na semana', async () => {
    appointmentsHandler(['2026-09-22']);
    server.use(http.get('*/api/activities', () => HttpResponse.json({ activities: [fakeActivity()] })));
    renderRoute('/registros');

    const tuesday = (await screen.findByRole('heading', { name: /terça-feira, 22\/09/ })).closest('h3')!;
    await waitFor(() => expect(within(tuesday).getByText('consulta')).toBeInTheDocument());
    const wednesday = screen.getByRole('heading', { name: /quarta-feira, 23\/09/ });
    expect(within(wednesday).queryByText('consulta')).not.toBeInTheDocument();
  });

  it('se as consultas não carregarem, a semana aparece mesmo assim', async () => {
    server.use(http.get('*/api/appointments', () => new HttpResponse(null, { status: 500 })));
    renderRoute('/registros');

    expect(await screen.findByRole('heading', { name: '21 a 27 de set.' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Consultas' })).not.toBeInTheDocument();
  });
});

describe('AppointmentsPage', () => {
  it('separa próximas (da mais perto para a mais longe) e anteriores (da mais recente)', async () => {
    appointmentsHandler(['2026-09-10', '2026-09-24', '2026-10-15', '2026-10-01']);
    renderRoute('/consultas');

    const upcoming = await screen.findByRole('region', { name: 'Próximas' });
    expect(within(upcoming).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('01/10'),
      expect.stringContaining('15/10'),
    ]);
    // A de hoje é a última, então fica nas anteriores (SPEC).
    const previous = screen.getByRole('region', { name: 'Anteriores' });
    expect(within(previous).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('24/09 · hoje'),
      expect.stringContaining('10/09'),
    ]);
  });

  it('sem consultas, mostra a mensagem de lista vazia', async () => {
    renderRoute('/consultas');

    expect(await screen.findByText('Nenhuma consulta cadastrada ainda.')).toBeInTheDocument();
  });

  it('cadastra uma consulta', async () => {
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/consultas');

    await user.click(await screen.findByRole('button', { name: 'Nova consulta' }));
    const dialog = screen.getByRole('dialog', { name: 'Nova consulta' });
    fireEvent.change(within(dialog).getByLabelText('Dia da consulta'), { target: { value: '2026-10-01' } });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(writes).toEqual([{ method: 'POST', path: '/appointments', body: { appointmentDate: '2026-10-01' } }]),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('mostra o 409 quando já existe consulta no dia', async () => {
    recordWrites(201, () => apiError(409, 'APPOINTMENT_EXISTS', 'Você já tem uma consulta nesse dia.'));
    const user = userEvent.setup();
    renderRoute('/consultas');

    await user.click(await screen.findByRole('button', { name: 'Nova consulta' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Você já tem uma consulta nesse dia.');
  });

  it('muda a data de uma consulta', async () => {
    const [appointment] = appointmentsHandler(['2026-10-01']);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/consultas');

    await user.click(await screen.findByRole('button', { name: /Mudar data da consulta de quinta-feira, 01\/10/ }));
    const dialog = screen.getByRole('dialog', { name: 'Mudar a data da consulta' });
    fireEvent.change(within(dialog).getByLabelText('Dia da consulta'), { target: { value: '2026-10-02' } });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(writes).toEqual([
        { method: 'PATCH', path: `/appointments/${appointment!.id}`, body: { appointmentDate: '2026-10-02' } },
      ]),
    );
  });

  it('excluir pede confirmação', async () => {
    const [appointment] = appointmentsHandler(['2026-09-10']);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/consultas');

    await user.click(await screen.findByRole('button', { name: /Excluir a consulta de quinta-feira, 10\/09/ }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir esta consulta?' });
    expect(writes).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    await waitFor(() =>
      expect(writes).toEqual([{ method: 'DELETE', path: `/appointments/${appointment!.id}`, body: undefined }]),
    );
  });

  it('só terapeuta não abre a página de consultas', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: { id: 'x', name: 'Tina Fictícia', email: 't@faisca.test', profiles: { patient: false, therapist: true } },
        }),
      ),
    );
    const { router } = renderRoute('/consultas');

    await waitFor(() => expect(router.state.location.pathname).toBe('/pacientes'));
  });
});
