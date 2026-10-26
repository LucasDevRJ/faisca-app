import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '../test/render';
import { fakeUser, loggedIn, server } from '../test/server';

// Foto de perfil (DEC-061, DEC-069). Dados fictícios (regra 5).
const VERSION = '2026-10-25T20:00:00.000Z';
const PATIENT_ID = '00000000-0000-4000-8000-00000000000a';

beforeEach(() => {
  server.use(loggedIn, http.get('*/api/link', () => HttpResponse.json({ link: null, invite: null, code: null })));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function profileApi(avatarVersion: string | null) {
  const calls: string[] = [];
  server.use(
    http.get('*/api/profile', () => HttpResponse.json({ profile: { fullName: null, palette: 'SALVIA', avatarVersion } })),
    http.delete('*/api/profile/avatar', () => {
      calls.push('DELETE');
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

describe('Seu perfil: foto', () => {
  it('sem foto: o círculo com as iniciais (só letras) e "Escolher foto"', async () => {
    profileApi(null);
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, name: 'Ana (fictícia)' } })));
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Seu perfil' });
    expect(await within(section).findByRole('button', { name: 'Escolher foto' })).toBeInTheDocument();
    expect(within(section).getByText('AF')).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Remover foto' })).not.toBeInTheDocument();
    expect(section.querySelector('input[type="file"]')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  });

  it('escolher uma foto abre o recorte, com zoom e "Usar esta foto"', async () => {
    profileApi(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:foto-ficticia');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Seu perfil' });
    await within(section).findByRole('button', { name: 'Escolher foto' });
    await user.upload(section.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'eu.jpg', { type: 'image/jpeg' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ajustar a foto' });
    expect(within(dialog).getByRole('slider', { name: 'Zoom' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Usar esta foto' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('com foto: mostra a imagem da conta; "Remover foto" pede confirmação e volta às iniciais', async () => {
    const calls = profileApi(VERSION);
    const user = userEvent.setup();
    const { container } = renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Seu perfil' });
    await within(section).findByRole('button', { name: 'Trocar foto' });
    expect(container.querySelector('img[src^="/api/profile/avatar"]')).toHaveAttribute(
      'src',
      `/api/profile/avatar?v=${encodeURIComponent(VERSION)}`,
    );

    await user.click(within(section).getByRole('button', { name: 'Remover foto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remover a foto?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remover foto' }));

    await waitFor(() => expect(calls).toEqual(['DELETE']));
    expect(await within(section).findByRole('button', { name: 'Escolher foto' })).toBeInTheDocument();
    expect(within(section).getAllByRole('status').map((s) => s.textContent)).toContain('Pronto, foto removida.');
  });
});

describe('fotos de quem tem vínculo', () => {
  it('a paciente vê a foto da terapeuta no cartão do vínculo', async () => {
    profileApi(null);
    server.use(
      http.get('*/api/link', () =>
        HttpResponse.json({
          link: {
            id: '00000000-0000-4000-8000-0000000000b1',
            method: 'CODE',
            createdAt: '2026-09-28T15:00:00.000Z',
            seen: true,
            therapist: { name: 'Tereza Fictícia', email: 'tereza@faisca.test', avatarVersion: VERSION },
          },
          invite: null,
          code: null,
        }),
      ),
    );
    const { container } = renderRoute('/conta');

    await screen.findByText('Tereza Fictícia');
    expect(container.querySelector('img[src^="/api/link/therapist/avatar"]')).toHaveAttribute(
      'src',
      `/api/link/therapist/avatar?v=${encodeURIComponent(VERSION)}`,
    );
  });

  it('a terapeuta vê a foto dos pacientes na lista, pelo endereço do vínculo; sem foto, as iniciais', async () => {
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } })),
      http.get('*/api/links/patients', () =>
        HttpResponse.json({
          patients: [
            { id: PATIENT_ID, name: 'Paula Fictícia', email: 'paula@faisca.test', linkedAt: '2026-09-01T15:00:00.000Z', avatarVersion: VERSION, unreadCount: 0 },
            { id: '00000000-0000-4000-8000-00000000000b', name: 'Bruno Fictício', email: 'bruno@faisca.test', linkedAt: '2026-09-02T15:00:00.000Z', avatarVersion: null, unreadCount: 0 },
          ],
        }),
      ),
    );
    const { container } = renderRoute('/pacientes');

    const items = await screen.findAllByRole('listitem');
    expect(container.querySelector('img[src*="/avatar"]')).toHaveAttribute(
      'src',
      `/api/therapist/patients/${PATIENT_ID}/avatar?v=${encodeURIComponent(VERSION)}`,
    );
    expect(within(items[1]!).getByText('BF')).toBeInTheDocument();
  });
});
