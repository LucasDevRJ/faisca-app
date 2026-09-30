import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { LinkStatus } from '../features/links/links-api';
import { renderRoute } from '../test/render';
import { apiError, fakeUser, loggedIn, server } from '../test/server';

// Dados fictícios (regra 5).
const TOKEN = 'token-de-convite-ficticio';
const patient = {
  id: '00000000-0000-4000-8000-00000000000a',
  name: 'Paula Fictícia',
  email: 'paula@faisca.test',
  linkedAt: '2026-09-28T15:00:00.000Z',
};

describe('/convite', () => {
  it('sem token, avisa que o link está incompleto', async () => {
    renderRoute('/convite');

    expect(await screen.findByRole('heading', { name: 'Link incompleto' })).toBeInTheDocument();
  });

  it('tira o token da barra de endereço e o guarda no state', async () => {
    const { router } = renderRoute(`/convite?token=${TOKEN}`);

    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(router.state.location.state).toEqual({ inviteToken: TOKEN });
  });

  it('com sessão, aceita o convite com um toque', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    server.use(
      loggedIn,
      http.post('*/api/links/accept-invite', async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ patient }, { status: 201 });
      }),
    );
    renderRoute(`/convite?token=${TOKEN}`);

    expect(await screen.findByText(/Ao aceitar, o perfil de terapeuta é ativado/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aceitar convite' }));

    expect(sent).toEqual([{ token: TOKEN }]);
    expect(await screen.findByRole('heading', { name: 'Vínculo feito' })).toBeInTheDocument();
    expect(screen.getByText(/Agora você acompanha os registros de Paula Fictícia/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver meus pacientes' })).toHaveAttribute('href', '/pacientes');
  });

  it('convite já usado ou cancelado mostra a mensagem da API', async () => {
    const user = userEvent.setup();
    server.use(
      loggedIn,
      http.post('*/api/links/accept-invite', () =>
        apiError(400, 'INVALID_TOKEN', 'Este convite é inválido, já foi usado ou foi cancelado.'),
      ),
    );
    renderRoute(`/convite?token=${TOKEN}`);

    await user.click(await screen.findByRole('button', { name: 'Aceitar convite' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este convite é inválido');
  });

  it('sem sessão: entrar e voltar para o convite, com o token no state', async () => {
    const user = userEvent.setup();
    let logged = false;
    server.use(
      http.get('*/api/auth/me', () =>
        logged
          ? HttpResponse.json({ user: fakeUser })
          : apiError(401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.'),
      ),
      http.post('*/api/auth/login', () => {
        logged = true;
        return HttpResponse.json({ user: fakeUser });
      }),
    );
    const { router } = renderRoute(`/convite?token=${TOKEN}`);

    await user.click(await screen.findByRole('button', { name: 'Entrar' }));
    await screen.findByRole('heading', { name: 'Que bom te ver' });
    expect(router.state.location.search).toBe('?next=/convite');
    expect(JSON.stringify(router.state.location)).toContain(TOKEN);
    expect(router.state.location.search).not.toContain(TOKEN);

    await user.type(screen.getByLabelText('E-mail'), fakeUser.email);
    await user.type(screen.getByLabelText('Senha'), 'senha-ficticia-123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('button', { name: 'Aceitar convite' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/convite');
    expect(router.state.location.state).toEqual({ inviteToken: TOKEN });
  });

  it('sem sessão: criar conta já com "Acompanhar pacientes" marcado e o token no cadastro', async () => {
    const user = userEvent.setup();
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post('*/api/auth/signup', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ message: 'ok' }, { status: 202 });
      }),
    );
    renderRoute(`/convite?token=${TOKEN}`);

    await user.click(await screen.findByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText(/criando a conta pelo convite/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Acompanhar pacientes/ })).toBeChecked();

    await user.type(screen.getByLabelText('Como podemos te chamar?'), 'Nina Fictícia');
    await user.type(screen.getByLabelText('E-mail'), 'nina@faisca.test');
    await user.type(screen.getByLabelText('Senha'), 'senha-ficticia-123');
    await user.click(screen.getByRole('checkbox', { name: /aviso de privacidade/ }));
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    await screen.findByRole('heading', { name: 'Confira seu e-mail' });
    expect(bodies[0]).toMatchObject({ profiles: { patient: false, therapist: true }, inviteToken: TOKEN });
  });

  it('cadastro normal não manda inviteToken', async () => {
    const user = userEvent.setup();
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post('*/api/auth/signup', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ message: 'ok' }, { status: 202 });
      }),
    );
    renderRoute('/cadastro');

    await user.type(await screen.findByLabelText('Como podemos te chamar?'), 'Nina Fictícia');
    await user.type(screen.getByLabelText('E-mail'), 'nina@faisca.test');
    await user.type(screen.getByLabelText('Senha'), 'senha-ficticia-123');
    await user.click(screen.getByRole('checkbox', { name: /Registrar minhas atividades/ }));
    await user.click(screen.getByRole('checkbox', { name: /aviso de privacidade/ }));
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    await screen.findByRole('heading', { name: 'Confira seu e-mail' });
    expect(bodies[0]).not.toHaveProperty('inviteToken');
  });
});

describe('aviso de novo vínculo em /registros', () => {
  const linked: LinkStatus = {
    link: {
      id: 'l1',
      method: 'CODE',
      createdAt: '2026-09-28T15:00:00Z',
      seen: false,
      therapist: { name: 'Tereza Fictícia', email: 'tereza@faisca.test' },
    },
    invite: null,
    code: null,
  };

  it('mostra nome e e-mail até tocar em "Entendi"', async () => {
    const user = userEvent.setup();
    let seen = false;
    server.use(
      loggedIn,
      http.get('*/api/link', () => HttpResponse.json(seen ? { ...linked, link: { ...linked.link, seen: true } } : linked)),
      http.post('*/api/link/seen', () => {
        seen = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute('/registros');

    const notice = await screen.findByRole('region', { name: 'Novo vínculo' });
    expect(notice).toHaveTextContent('Tereza Fictícia');
    expect(notice).toHaveTextContent('tereza@faisca.test');

    await user.click(screen.getByRole('button', { name: 'Entendi' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Novo vínculo' })).not.toBeInTheDocument());
  });

  it('vínculo já visto não mostra aviso', async () => {
    server.use(loggedIn, http.get('*/api/link', () => HttpResponse.json({ ...linked, link: { ...linked.link, seen: true } })));
    renderRoute('/registros');

    await screen.findByRole('heading', { name: /Olá/ });
    expect(screen.queryByRole('region', { name: 'Novo vínculo' })).not.toBeInTheDocument();
  });
});
