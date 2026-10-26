import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render';
import { fakeUser, loggedIn, server } from '../test/server';

// "Seu perfil" em Conta (DEC-061, DEC-063, DEC-068). Dados fictícios (regra 5).
beforeEach(() => {
  server.use(
    loggedIn,
    http.get('*/api/link', () => HttpResponse.json({ link: null, invite: null, code: null })),
  );
});

afterEach(() => {
  delete document.documentElement.dataset.palette;
  localStorage.clear();
});

function profileApi(profile = { fullName: 'Ana Fictícia da Silva', palette: 'SALVIA', avatarVersion: null }) {
  const patches: unknown[] = [];
  server.use(
    http.get('*/api/profile', () => HttpResponse.json({ profile })),
    http.patch('*/api/profile', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      patches.push(body);
      return HttpResponse.json({ profile: { ...profile, ...body } });
    }),
  );
  return patches;
}

describe('/conta: Seu perfil', () => {
  it('mostra o nome completo salvo e as cinco paletas, com a da conta marcada', async () => {
    profileApi();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Seu perfil' });
    expect(await within(section).findByRole('textbox', { name: 'Nome completo (opcional)' })).toHaveValue(
      'Ana Fictícia da Silva',
    );
    const palettes = within(section).getByRole('group', { name: 'Paleta de cores' });
    expect(within(palettes).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual([
      'SALVIA',
      'LAVANDA',
      'OCEANO',
      'AREIA',
      'ALTO_CONTRASTE',
    ]);
    expect(within(palettes).getByRole('radio', { name: /Sálvia/ })).toBeChecked();
    // A explicação de que a paleta vale para a conta é lida junto com o grupo.
    expect(palettes).toHaveAccessibleDescription(/Muda as cores do app/);
  });

  it('a paleta muda na hora como prévia e só fica no aparelho ao salvar', async () => {
    const patches = profileApi();
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Seu perfil' });
    await user.click(await within(section).findByRole('radio', { name: /Lavanda/ }));
    expect(document.documentElement.dataset.palette).toBe('lavanda');
    expect(localStorage.getItem('faisca:palette')).toBeNull();

    await user.click(within(section).getByRole('button', { name: 'Salvar perfil' }));
    await waitFor(() => expect(patches).toEqual([{ fullName: 'Ana Fictícia da Silva', palette: 'LAVANDA' }]));
    await waitFor(() =>
      expect(within(section).getAllByRole('status').map((status) => status.textContent)).toContain('Pronto, perfil salvo.'),
    );
    expect(document.documentElement.dataset.palette).toBe('lavanda');
    expect(localStorage.getItem('faisca:palette')).toBe('lavanda');
  });

  it('sair de Conta sem salvar volta para a paleta da conta', async () => {
    profileApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Seu perfil' });
    await user.click(await within(section).findByRole('radio', { name: /Alto contraste/ }));
    expect(document.documentElement.dataset.palette).toBe('alto-contraste');

    await router.navigate('/novidades');
    await waitFor(() => expect(document.documentElement.dataset.palette).toBeUndefined());
  });

  it('a paleta da conta é aplicada ao abrir o app, em qualquer tela', async () => {
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, palette: 'OCEANO' } })));
    renderRoute('/novidades');

    await waitFor(() => expect(document.documentElement.dataset.palette).toBe('oceano'));
    expect(localStorage.getItem('faisca:palette')).toBe('oceano');
  });

  it('nome completo vazio vai como null; erro do campo aparece nele', async () => {
    const patches = profileApi();
    server.use(
      http.patch('*/api/profile', async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Confira os campos.',
              issues: [{ path: 'fullName', message: 'O nome completo pode ter até 120 caracteres.' }],
            },
          },
          { status: 400 },
        );
      }),
    );
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Seu perfil' });
    const field = await within(section).findByRole('textbox', { name: 'Nome completo (opcional)' });
    await user.clear(field);
    await user.type(field, '   ');
    await user.click(within(section).getByRole('button', { name: 'Salvar perfil' }));

    await waitFor(() => expect(patches).toEqual([{ fullName: null, palette: 'SALVIA' }]));
    expect(await within(section).findByText('O nome completo pode ter até 120 caracteres.')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });
});
