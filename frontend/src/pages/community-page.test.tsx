import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render';
import { loggedIn, server } from '../test/server';

describe('/comunidade', () => {
  it('pede entrada após confirmar 18+, aceitar as regras e escolher apelido', async () => {
    const user = userEvent.setup();
    let submitted: unknown;
    server.use(
      loggedIn,
      http.get('*/api/community', () => HttpResponse.json({
        available: true,
        community: { id: '00000000-0000-4000-8000-000000000040' },
        membership: null,
        feed: null,
        myContent: [],
      })),
      http.post('*/api/community/join', async ({ request }) => {
        submitted = await request.json();
        return HttpResponse.json({ status: 'REQUESTED' }, { status: 201 });
      }),
    );
    renderRoute('/comunidade');

    expect(await screen.findByRole('button', { name: 'Enviar pedido' })).toBeDisabled();
    await user.type(await screen.findByLabelText('Apelido na comunidade'), 'Sol Fictícia');
    await user.click(screen.getByRole('checkbox', { name: 'Confirmo que tenho 18 anos ou mais.' }));
    await user.click(screen.getByRole('checkbox', { name: 'Li e aceito as regras da comunidade.' }));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    expect(await screen.findByText('Pedido enviado. A psicóloga precisa aprovar sua entrada.')).toBeInTheDocument();
    expect(submitted).toEqual({
      displayName: 'Sol Fictícia',
      adultConfirmed: true,
      rulesAccepted: true,
      announceOnJoin: false,
    });
  });
});
