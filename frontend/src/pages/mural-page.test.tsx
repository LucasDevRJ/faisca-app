import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Notice } from '../features/notices/notices-api';
import { renderRoute } from '../test/render';
import { apiError, fakeUser, server } from '../test/server';

// Mural de avisos da terapeuta (DEC-079, DEC-080). Dados fictícios (regra 5).
const therapist = { ...fakeUser, name: 'Tereza Fictícia', profiles: { patient: false, therapist: true } };

beforeEach(() => {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: therapist })));
});

function fakeNotice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: '00000000-0000-4000-d000-000000000001',
    body: 'Estarei de férias de 10 a 20 de dezembro.',
    createdAt: '2026-10-20T15:00:00.000Z',
    updatedAt: '2026-10-20T15:00:00.000Z',
    ...overrides,
  };
}

// Mural em memória: o que a página publica, edita e apaga muda o que a lista devolve.
function muralApi(initial: Notice[] = []) {
  let notices = [...initial];
  const sent: unknown[] = [];
  server.use(
    http.get('*/api/therapist/notices', () => HttpResponse.json({ notices })),
    http.post('*/api/therapist/notices', async ({ request }) => {
      const body = (await request.json()) as { body: string };
      sent.push(body);
      const notice = fakeNotice({ id: `00000000-0000-4000-d000-00000000010${notices.length}`, body: body.body });
      notices = [notice, ...notices];
      return HttpResponse.json({ notice }, { status: 201 });
    }),
    http.patch('*/api/therapist/notices/:id', async ({ request, params }) => {
      const { body } = (await request.json()) as { body: string };
      notices = notices.map((n) => (n.id === params.id ? { ...n, body, updatedAt: '2026-10-22T15:00:00.000Z' } : n));
      return HttpResponse.json({ notice: notices.find((n) => n.id === params.id) });
    }),
    http.delete('*/api/therapist/notices/:id', ({ params }) => {
      notices = notices.filter((n) => n.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return sent;
}

describe('/mural (terapeuta)', () => {
  it('Meus pacientes leva ao mural', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/pacientes');

    await user.click(await screen.findByRole('link', { name: 'Abrir o mural' }));
    expect(router.state.location.pathname).toBe('/mural');
    expect(await screen.findByRole('heading', { level: 1, name: 'Mural de avisos' })).toBeInTheDocument();
    expect(screen.getByText(/você não vê quem leu/)).toBeInTheDocument();
  });

  it('publica um aviso: manda o texto sem espaços nas pontas e ele aparece na lista', async () => {
    const sent = muralApi();
    const user = userEvent.setup();
    renderRoute('/mural');

    expect(await screen.findByText('Nenhum aviso publicado ainda.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Aviso'), '  Feriado na segunda: sem sessões.  ');
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Aviso publicado.');
    expect(sent).toEqual([{ body: 'Feriado na segunda: sem sessões.' }]);
    expect(await screen.findByText('Feriado na segunda: sem sessões.')).toBeInTheDocument();
    expect(screen.getByLabelText('Aviso')).toHaveValue('');
  });

  it('sem texto, avisa no campo e não chama a API', async () => {
    const sent = muralApi();
    const user = userEvent.setup();
    renderRoute('/mural');

    await user.click(await screen.findByRole('button', { name: 'Publicar' }));

    expect(screen.getByLabelText('Aviso')).toHaveAccessibleDescription(/Escreva o aviso\./);
    expect(sent).toEqual([]);
  });

  it('limite por hora: mensagem acolhedora', async () => {
    server.use(
      http.post('*/api/therapist/notices', () =>
        apiError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas seguidas.'),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/mural');

    await user.type(await screen.findByLabelText('Aviso'), 'Mais um aviso');
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(await screen.findByText('Você publicou vários avisos seguidos. Tente de novo daqui a pouco.')).toBeInTheDocument();
  });

  it('edita pela janela e mostra "editado em"', async () => {
    muralApi([fakeNotice()]);
    const user = userEvent.setup();
    renderRoute('/mural');

    const card = await screen.findByRole('article', { name: 'Aviso de 20/10/2026' });
    expect(card).not.toHaveTextContent('editado');
    await user.click(within(card).getByRole('button', { name: 'Editar o aviso de 20/10/2026' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar aviso' });
    const field = within(dialog).getByLabelText('Aviso');
    await user.clear(field);
    await user.type(field, 'Férias de 11 a 20 de dezembro.');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Aviso atualizado.');
    expect(screen.getByRole('heading', { name: 'Publicados' })).toHaveFocus();
    const edited = await screen.findByRole('article', { name: 'Aviso de 20/10/2026' });
    await waitFor(() => expect(edited).toHaveTextContent('Férias de 11 a 20 de dezembro.'));
    expect(edited).toHaveTextContent('editado em 22/10/2026');
  });

  it('apaga com confirmação, e "Cancelar" não apaga', async () => {
    muralApi([fakeNotice()]);
    const user = userEvent.setup();
    renderRoute('/mural');

    const card = await screen.findByRole('article', { name: 'Aviso de 20/10/2026' });
    await user.click(within(card).getByRole('button', { name: 'Apagar o aviso de 20/10/2026' }));
    let dialog = screen.getByRole('dialog', { name: 'Apagar este aviso?' });
    expect(dialog).toHaveTextContent('Ele some para todos os seus pacientes.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('article', { name: 'Aviso de 20/10/2026' })).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Apagar o aviso de 20/10/2026' }));
    dialog = screen.getByRole('dialog', { name: 'Apagar este aviso?' });
    await user.click(within(dialog).getByRole('button', { name: 'Apagar aviso' }));

    expect(await screen.findByText('Nenhum aviso publicado ainda.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Aviso apagado.');
    expect(screen.getByRole('heading', { name: 'Publicados' })).toHaveFocus();
  });

  it('abrir outra janela limpa o status, para a mesma mensagem ser anunciada de novo', async () => {
    muralApi([fakeNotice()]);
    const user = userEvent.setup();
    renderRoute('/mural');

    const card = await screen.findByRole('article', { name: 'Aviso de 20/10/2026' });
    await user.click(within(card).getByRole('button', { name: 'Editar o aviso de 20/10/2026' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Aviso atualizado.'));

    await user.click(within(card).getByRole('button', { name: 'Editar o aviso de 20/10/2026' }));
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('quem é só paciente não abre o mural', async () => {
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: fakeUser })));
    const { router } = renderRoute('/mural');

    await waitFor(() => expect(router.state.location.pathname).not.toBe('/mural'));
  });
});
