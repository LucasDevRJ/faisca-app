import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LinkedPatient } from '../features/links/links-api';
import { renderRoute } from '../test/render';
import { apiError, fakeUser, server } from '../test/server';

// Terapeuta e paciente fictícios (regra 5).
const patient: LinkedPatient = {
  id: '00000000-0000-4000-8000-00000000000a',
  name: 'Paula Fictícia',
  email: 'paula@faisca.test',
  linkedAt: '2026-09-28T15:00:00.000Z',
};

beforeEach(() => {
  server.use(
    http.get('*/api/auth/me', () =>
      HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } }),
    ),
  );
});

describe('/pacientes', () => {
  it('sem pacientes, explica como eles chegam', async () => {
    renderRoute('/pacientes');

    expect(await screen.findByText(/Ninguém por aqui ainda/)).toBeInTheDocument();
  });

  it('lista os pacientes vinculados com nome, e-mail e desde quando, com link para os registros', async () => {
    server.use(http.get('*/api/links/patients', () => HttpResponse.json({ patients: [patient] })));
    renderRoute('/pacientes');

    const item = await screen.findByRole('listitem');
    expect(within(item).getByText('Paula Fictícia')).toBeInTheDocument();
    expect(within(item).getByText('paula@faisca.test')).toBeInTheDocument();
    expect(within(item).getByText('Vinculado desde 28/09/2026')).toBeInTheDocument();
    expect(within(item).getByRole('link')).toHaveAttribute('href', `/pacientes/${patient.id}`);
  });

  it('digita o código, vincula e o paciente entra na lista', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    let linked = false;
    server.use(
      http.post('*/api/links/redeem-code', async ({ request }) => {
        sent.push(await request.json());
        linked = true;
        return HttpResponse.json({ patient }, { status: 201 });
      }),
      http.get('*/api/links/patients', () => HttpResponse.json({ patients: linked ? [patient] : [] })),
    );
    renderRoute('/pacientes');

    const field = await screen.findByLabelText('Código do paciente');
    await user.type(field, 'k7m4-p9qx');
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    expect(sent).toEqual([{ code: 'k7m4-p9qx' }]);
    expect(await screen.findByText(/Agora você acompanha os registros de/)).toHaveTextContent('Paula Fictícia');
    expect(await screen.findByRole('listitem')).toHaveTextContent('Paula Fictícia');
    expect(field).toHaveValue('');
  });

  it('formato impossível é avisado antes de enviar', async () => {
    const user = userEvent.setup();
    renderRoute('/pacientes');

    await user.type(await screen.findByLabelText('Código do paciente'), 'O0I1');
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    expect(await screen.findByText('O código tem 8 letras e números, como K7M4-P9QX.')).toBeInTheDocument();
  });

  it('código inválido e bloqueio mostram a mensagem da API', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/links/redeem-code', () =>
        apiError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas seguidas. Respire um pouco e tente de novo daqui a alguns minutos.'),
      ),
    );
    renderRoute('/pacientes');

    await user.type(await screen.findByLabelText('Código do paciente'), 'AAAA-AAAA');
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas seguidas');
  });
});
