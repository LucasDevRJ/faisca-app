import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render';
import { fakeUser, server } from '../test/server';

// Versão do aviso sem área nova (2026-10.7, DEC-078): o aceite fica numa faixa, sem bloquear nada.
// Dados fictícios (regra 5).
const outdatedVersion = { ...fakeUser, privacyUpToDate: false };

function sessionWithAccept() {
  let accepted = false;
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ user: accepted ? fakeUser : outdatedVersion })),
    http.post('*/api/auth/accept-privacy', () => {
      accepted = true;
      return HttpResponse.json({ user: fakeUser });
    }),
  );
  return { wasAccepted: () => accepted };
}

describe('faixa do aviso de privacidade versão 7', () => {
  it('aparece para o paciente, sem bloquear, e some depois do aceite', async () => {
    const { wasAccepted } = sessionWithAccept();
    const user = userEvent.setup();
    renderRoute('/registros');

    const banner = await screen.findByRole('region', { name: 'O aviso de privacidade mudou' });
    expect(banner).toHaveTextContent('cópia de segurança por dia');
    expect(within(banner).getByRole('link', { name: 'Ver o que mudou' })).toHaveAttribute('href', '/privacidade');
    // Nada bloqueado: a tela de registros continua lá.
    expect(screen.getByRole('link', { name: 'Pensamentos' })).toBeInTheDocument();

    // Sem marcar a caixa, não aceita.
    await user.click(within(banner).getByRole('button', { name: 'Aceitar' }));
    expect(within(banner).getByRole('alert')).toHaveTextContent('marque que você leu e concorda');
    expect(within(banner).getByRole('checkbox')).toHaveAccessibleDescription(/marque que você leu e concorda/);
    expect(wasAccepted()).toBe(false);

    await user.click(within(banner).getByRole('checkbox', { name: 'Li e concordo com o aviso de privacidade.' }));
    await user.click(within(banner).getByRole('button', { name: 'Aceitar' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'O aviso de privacidade mudou' })).toBeNull());
    expect(wasAccepted()).toBe(true);
  });

  it('aparece também para a terapeuta, em Meus pacientes', async () => {
    sessionWithAccept();
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...outdatedVersion, profiles: { patient: false, therapist: true } } }),
      ),
    );
    renderRoute('/pacientes');

    expect(await screen.findByRole('region', { name: 'O aviso de privacidade mudou' })).toBeInTheDocument();
  });

  it('com o aviso em dia, não aparece', async () => {
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: fakeUser })));
    renderRoute('/registros');

    expect(await screen.findByRole('link', { name: 'Pensamentos' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'O aviso de privacidade mudou' })).toBeNull();
  });
});
