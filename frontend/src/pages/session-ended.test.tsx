import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '../test/render';
import { apiError, fakeUser, server } from '../test/server';

// A sessão termina em outro aparelho (DEC-088): o primeiro 401 tira da conta, e voltar para o
// app confere a sessão. Dados fictícios (regra 5).
const ENDED = 'Sua sessão terminou. Entre de novo para continuar.';

let sessionValid = true;

beforeEach(() => {
  sessionValid = true;
  server.use(
    http.get('*/api/auth/me', () =>
      sessionValid ? HttpResponse.json({ user: fakeUser }) : apiError(401, 'UNAUTHENTICATED', 'Entre para continuar.'),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sessão terminada em outro aparelho', () => {
  it('o primeiro 401 leva para entrar com o aviso, volta para a mesma tela depois e apaga os dados', async () => {
    server.use(
      http.get('*/api/activities', () =>
        sessionValid
          ? HttpResponse.json({ activities: [] })
          : apiError(401, 'UNAUTHENTICATED', 'Entre para continuar.'),
      ),
    );
    sessionValid = false;
    // A sessão já tinha sido lida como válida (a tela abriu), e só a lista de atividades descobre.
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: fakeUser }), { once: true }));
    const { router, queryClient } = renderRoute('/registros');

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(ENDED);
    // A pessoa não pediu para sair: o foco vai para o aviso.
    await waitFor(() => expect(notice.parentElement).toHaveFocus());
    expect(router.state.location.pathname).toBe('/entrar');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/registros')}`);
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey[0]);
    expect(keys.filter((key) => key !== 'session')).toEqual([]);
    expect(queryClient.getQueryData(['session'])).toBeNull();
    // A marca é apagada ao mostrar o aviso: não volta numa saída pedida depois.
    await waitFor(() => expect(queryClient.getQueryData(['session', 'ended'])).toBeUndefined());
  });

  // Ex.: uma consulta que saiu com o cookie de antes de trocar a senha neste aparelho.
  it('um 401 com a sessão ainda valendo não tira da conta', async () => {
    server.use(http.get('*/api/activities', () => apiError(401, 'UNAUTHENTICATED', 'Entre para continuar.')));
    const { router, queryClient } = renderRoute('/registros');

    await waitFor(() =>
      expect(queryClient.getQueryCache().find({ queryKey: ['activities'], exact: false })?.state.status).toBe('error'),
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(router.state.location.pathname).toBe('/registros');
    expect(queryClient.getQueryData(['session'])).toEqual(fakeUser);
  });

  it('ao voltar para o app, confere a sessão e, se acabou, leva para entrar com o aviso', async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    const { router } = renderRoute('/conta');
    expect(await screen.findByRole('heading', { level: 1, name: 'Conta' })).toBeInTheDocument();

    sessionValid = false;
    vi.setSystemTime(Date.now() + 20_000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(await screen.findByText(ENDED)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('ao trocar de tela com os dados na memória, confere a sessão e leva para entrar', async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    const user = userEvent.setup();
    const { router } = renderRoute('/conta');
    expect(await screen.findByRole('heading', { level: 1, name: 'Conta' })).toBeInTheDocument();

    sessionValid = false;
    vi.setSystemTime(Date.now() + 20_000);
    await user.click(screen.getByRole('link', { name: 'Ver o que há de novo' }));

    expect(await screen.findByText(ENDED)).toBeInTheDocument();
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/novidades')}`);
  });

  it('com a sessão valendo, voltar para o app não muda nada', async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    const { router } = renderRoute('/conta');
    expect(await screen.findByRole('heading', { level: 1, name: 'Conta' })).toBeInTheDocument();

    vi.setSystemTime(Date.now() + 20_000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(router.state.location.pathname).toBe('/conta');
    expect(screen.queryByText(ENDED)).not.toBeInTheDocument();
  });

  it('senha errada no login não é "sessão terminada"', async () => {
    const user = userEvent.setup();
    sessionValid = false;
    server.use(
      http.post('*/api/auth/login', () => apiError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha não conferem.')),
    );
    renderRoute('/entrar');

    await user.type(await screen.findByLabelText('E-mail'), 'ana@faisca.test');
    await user.type(screen.getByLabelText('Senha'), 'senha-errada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('E-mail ou senha não conferem.')).toBeInTheDocument();
    expect(screen.queryByText(ENDED)).not.toBeInTheDocument();
  });

  it('o aviso só aparece vindo de uma sessão terminada', async () => {
    sessionValid = false;
    renderRoute('/entrar');

    expect(await screen.findByRole('heading', { name: 'Que bom te ver' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(ENDED)).not.toBeInTheDocument());
  });
});
