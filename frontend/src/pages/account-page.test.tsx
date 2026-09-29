import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkStatus } from '../features/links/links-api';
import { renderRoute } from '../test/render';
import { apiError, fakeUser, loggedIn, server } from '../test/server';

// Terapeuta fictícia (regra 5).
const therapist = { name: 'Tereza Fictícia', email: 'tereza@faisca.test' };
const noLink: LinkStatus = { link: null, invite: null, code: null };

function linkStatus(status: LinkStatus) {
  server.use(http.get('*/api/link', () => HttpResponse.json(status)));
}

beforeEach(() => {
  server.use(loggedIn);
});

describe('/conta: minha terapeuta', () => {
  it('o link "Conta" no topo leva para a tela', async () => {
    const user = userEvent.setup();
    renderRoute('/registros');

    await user.click(await screen.findByRole('link', { name: 'Conta' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Conta' })).toBeInTheDocument();
  });

  it('sem vínculo, oferece gerar código e convidar por e-mail', async () => {
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Minha terapeuta' });
    expect(await within(section).findByRole('button', { name: 'Gerar código' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Convidar por e-mail' })).toBeInTheDocument();
  });

  it('gera o código e mostra com a validade, uma vez só', async () => {
    const user = userEvent.setup();
    let generated = false;
    server.use(
      http.post('*/api/link/code', () => {
        generated = true;
        return HttpResponse.json({ code: 'K7M4-P9QX', expiresAt: '2026-09-30T01:15:00.000Z' }, { status: 201 });
      }),
      http.get('*/api/link', () =>
        HttpResponse.json(generated ? { ...noLink, code: { expiresAt: '2026-09-30T01:15:00.000Z' } } : noLink),
      ),
    );
    renderRoute('/conta');

    await user.click(await screen.findByRole('button', { name: 'Gerar código' }));

    expect(await screen.findByText('K7M4-P9QX')).toBeInTheDocument();
    expect(screen.getByText(/Vale até 29\/09, 22:15 e uma vez só/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Gerar outro código' })).toBeInTheDocument();
  });

  it('copia o código', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    server.use(
      http.post('*/api/link/code', () =>
        HttpResponse.json({ code: 'K7M4-P9QX', expiresAt: '2026-09-30T01:15:00.000Z' }, { status: 201 }),
      ),
    );
    renderRoute('/conta');
    await user.click(await screen.findByRole('button', { name: 'Gerar código' }));

    await user.click(await screen.findByRole('button', { name: 'Copiar' }));

    expect(writeText).toHaveBeenCalledWith('K7M4-P9QX');
    expect(await screen.findByRole('button', { name: 'Copiado!' })).toBeInTheDocument();
  });

  it('código gerado antes (fora desta tela) não aparece: avisa e oferece gerar outro', async () => {
    linkStatus({ ...noLink, code: { expiresAt: '2026-09-30T01:15:00.000Z' } });
    renderRoute('/conta');

    expect(await screen.findByText(/ele só aparece na hora em que é criado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar outro código' })).toBeInTheDocument();
    expect(screen.queryByText('K7M4-P9QX')).not.toBeInTheDocument();
  });

  it('envia o convite pelo painel e mostra o convite pendente', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    server.use(
      http.post('*/api/link/invite', async ({ request }) => {
        sent.push(await request.json());
        linkStatus({ ...noLink, invite: { id: 'i1', therapistEmail: therapist.email, createdAt: '2026-09-28T12:00:00Z' } });
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderRoute('/conta');

    await user.click(await screen.findByRole('button', { name: 'Convidar por e-mail' }));
    const dialog = await screen.findByRole('dialog', { name: 'Convidar por e-mail' });
    await user.type(within(dialog).getByLabelText('E-mail de quem acompanha sua terapia'), therapist.email);
    await user.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));

    expect(sent).toEqual([{ email: therapist.email }]);
    expect(await screen.findByText(therapist.email)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar convite' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('erro da API no convite aparece no painel', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/link/invite', () => apiError(400, 'SELF_LINK', 'Não dá para se vincular à própria conta.')),
    );
    renderRoute('/conta');

    await user.click(await screen.findByRole('button', { name: 'Convidar por e-mail' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/E-mail/), fakeUser.email);
    await user.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));

    expect(await within(dialog).findByText('Não dá para se vincular à própria conta.')).toBeInTheDocument();
  });

  it('cancela o convite pendente', async () => {
    const user = userEvent.setup();
    linkStatus({ ...noLink, invite: { id: 'i1', therapistEmail: therapist.email, createdAt: '2026-09-28T12:00:00Z' } });
    const cancel = vi.fn();
    server.use(
      http.delete('*/api/link/invite', () => {
        cancel();
        linkStatus(noLink);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute('/conta');

    await user.click(await screen.findByRole('button', { name: 'Cancelar convite' }));

    expect(cancel).toHaveBeenCalledOnce();
    expect(await screen.findByRole('button', { name: 'Gerar código' })).toBeInTheDocument();
  });

  it('com vínculo, mostra nome, e-mail e desde quando, e desfaz com confirmação', async () => {
    const user = userEvent.setup();
    linkStatus({
      ...noLink,
      link: { id: 'l1', method: 'CODE', createdAt: '2026-09-28T15:00:00Z', seen: true, therapist },
    });
    const revoke = vi.fn();
    server.use(
      http.post('*/api/link/revoke', () => {
        revoke();
        linkStatus(noLink);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute('/conta');

    expect(await screen.findByText(therapist.name)).toBeInTheDocument();
    expect(screen.getByText(therapist.email)).toBeInTheDocument();
    expect(screen.getByText(/desde 28\/09\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerar código' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Desfazer vínculo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desfazer o vínculo?' });
    expect(revoke).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Desfazer' }));

    await waitFor(() => expect(revoke).toHaveBeenCalledOnce());
    expect(await screen.findByRole('button', { name: 'Gerar código' })).toBeInTheDocument();
  });

  it('quem é só terapeuta não vê "Minha terapeuta" nem chama a API de vínculo do paciente', async () => {
    const getLink = vi.fn();
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } }),
      ),
      http.get('*/api/link', () => {
        getLink();
        return HttpResponse.json(noLink);
      }),
    );
    renderRoute('/conta');

    expect(await screen.findByRole('region', { name: 'Perfis' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Minha terapeuta' })).not.toBeInTheDocument();
    expect(getLink).not.toHaveBeenCalled();
  });
});

describe('/conta: perfis', () => {
  it('ativa o perfil que falta e a alternância aparece no topo', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    server.use(
      http.post('*/api/auth/profiles', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ user: { ...fakeUser, profiles: { patient: true, therapist: true } } });
      }),
    );
    renderRoute('/conta');

    await user.click(await screen.findByRole('button', { name: 'Também quero acompanhar pacientes' }));

    expect(bodies).toEqual([{ profile: 'therapist' }]);
    expect(await screen.findByRole('link', { name: 'Meus pacientes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Também quero acompanhar pacientes' })).not.toBeInTheDocument();
  });
});

describe('/conta: caminho de volta', () => {
  it('paciente volta para "Meus registros" pelo link da tela', async () => {
    const user = userEvent.setup();
    renderRoute('/conta');

    await user.click(await screen.findByRole('link', { name: '‹ Meus registros' }));

    expect(await screen.findByRole('heading', { name: /Olá/ })).toBeInTheDocument();
  });

  it('a marca no topo leva ao início', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/conta');

    await user.click(await screen.findByRole('link', { name: 'Faísca, ir para o início' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/registros'));
  });

  it('quem é só terapeuta volta para "Meus pacientes"', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } }),
      ),
    );
    renderRoute('/conta');

    expect(await screen.findByRole('link', { name: '‹ Meus pacientes' })).toHaveAttribute('href', '/pacientes');
  });
});
