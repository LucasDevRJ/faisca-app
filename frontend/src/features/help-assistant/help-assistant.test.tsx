import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoute } from '../../test/render';
import { fakeUser, loggedIn, server } from '../../test/server';
import { SESSION_QUERY_KEY } from '../auth/use-session';

vi.mock('./help-assistant-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('./help-assistant-api')>(), HELP_ASSISTANT_ENABLED: true,
}));

beforeEach(() => server.use(loggedIn, http.get('*/api/help/csrf', () => HttpResponse.json({ csrfToken: 'token-ficticio' }))));

describe('ajuda sobre o aplicativo', () => {
  it('pede confirmação por envio e mostra as fontes com links internos', async () => {
    const user = userEvent.setup();
    let received: unknown;
    server.use(http.post('*/api/help/ask', async ({ request }) => {
      received = await request.json();
      return HttpResponse.json({ answer: 'Use Ligar a outro registro.', sources: [{ title: 'Buscar e ligar registros', href: '/como-funciona#buscar-ligar' }], guideVersion: 'ficticia' });
    }));
    renderRoute('/como-funciona');
    const send = await screen.findByRole('button', { name: 'Enviar pergunta' });
    await user.type(screen.getByRole('textbox', { name: 'Sua dúvida sobre o aplicativo' }), 'Como ligar registros?');
    expect(send).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /autorizo enviar esta pergunta/ }));
    await user.type(screen.getByRole('textbox'), ' hoje');
    expect(send).toBeDisabled();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    await user.click(screen.getByRole('checkbox'));
    await user.click(send);
    expect(await screen.findByText('Use Ligar a outro registro.')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Fontes da resposta' })).toHaveTextContent('Buscar e ligar registros');
    expect(received).toEqual({ question: 'Como ligar registros? hoje', accepted: true, consentVersion: 'help-2026-11-27' });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Limpar pergunta e resposta' }));
    expect(screen.queryByText('Use Ligar a outro registro.')).not.toBeInTheDocument();
  });
  it('explica o erro de limite e preserva acesso ao guia', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/help/ask', () => HttpResponse.json({ error: { code: 'HELP_DAILY_LIMIT', message: 'O guia continua disponível.' } }, { status: 429 })));
    renderRoute('/como-funciona');
    await screen.findByRole('button', { name: 'Enviar pergunta' });
    await user.type(screen.getByRole('textbox', { name: 'Sua dúvida sobre o aplicativo' }), 'Como usar?');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Enviar pergunta' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('O guia continua disponível.'));
    expect(screen.getByRole('heading', { name: 'Vínculo e privacidade' })).toBeInTheDocument();
  });
  it('esconde o envio para visitantes', async () => {
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: null })));
    renderRoute('/como-funciona');
    await screen.findByRole('heading', { name: 'Como funciona o Faísca' });
    expect(screen.queryByRole('button', { name: 'Enviar pergunta' })).not.toBeInTheDocument();
  });
  it('descarta a pergunta ao trocar de conta mantendo o guia aberto', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderRoute('/como-funciona');
    const input = await screen.findByRole('textbox');
    await user.type(input, 'Pergunta fictícia da primeira conta');
    await act(async () => { queryClient.setQueryData(SESSION_QUERY_KEY, { ...fakeUser, id: '00000000-0000-4000-8000-000000000002' }); });
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
