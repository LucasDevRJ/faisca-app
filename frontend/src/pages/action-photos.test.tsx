import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action } from '../features/actions/actions-api';
import { api } from '../lib/api';
import { renderRoute } from '../test/render';
import { fakeUser, loggedIn, server } from '../test/server';

// Fotos da Ação (DEC-064, DEC-065), do lado do paciente. "Hoje" fixo: quinta, 24/09/2026, 15h em
// São Paulo. Dados fictícios (regra 5).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  server.use(loggedIn);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ACTION_ID = '00000000-0000-4000-a000-000000000001';
const photo = (n: number) => ({ id: `00000000-0000-4000-b000-${String(n).padStart(12, '0')}`, createdAt: '2026-09-23T21:00:00.000Z' });

function fakeAction(overrides: Partial<Action> = {}): Action {
  return {
    id: ACTION_ID,
    actionDate: '2026-09-23',
    name: 'Café com amiga',
    category: 'CONEXAO',
    status: 'AVALIADA',
    expectation: 2,
    pleasure: 8,
    achievement: 5,
    observation: null,
    createdAt: '2026-09-23T20:00:00.000Z',
    updatedAt: '2026-09-23T20:00:00.000Z',
    photos: [],
    photosDeadline: { date: '2026-09-28', time: '14:00' },
    photosOpen: true,
    ...overrides,
  };
}

const CYCLE = {
  from: '2026-09-22',
  to: '2026-09-28',
  session: { date: '2026-09-28', time: '14:00', kind: 'RECORRENTE' },
  truncated: false,
  previous: '2026-09-21',
  next: '2026-09-29',
};

// Responde o ciclo e a ação; guarda as fotos enviadas (com o tipo) e as removidas. O envio é
// conferido na chamada ao Axios: o File do jsdom não passa pelo Request do Node que o MSW usa.
function photosApi(
  action: Action | (() => Action),
  {
    failUpload = false,
    failRemove = false,
    limit = null as { room: number; code: string; message: string } | null,
  } = {},
) {
  const uploads: { path: string; name: string; type: unknown }[] = [];
  const removed: string[] = [];
  vi.spyOn(api, 'post').mockImplementation(async (path, body, config) => {
    const file = body as File;
    uploads.push({ path, name: file.name, type: config?.headers?.['Content-Type'] });
    if (failUpload) {
      throw Object.assign(new AxiosError('falha'), {
        response: { status: 400, data: { error: { code: 'INVALID_IMAGE', message: 'Não foi possível ler esta imagem.' } } },
      });
    }
    if (limit && uploads.length > limit.room) {
      throw Object.assign(new AxiosError('falha'), {
        response: { status: 409, data: { error: { code: limit.code, message: limit.message } } },
      });
    }
    return { data: { photo: photo(99) }, status: 201 };
  });
  server.use(
    http.get('*/api/appointments/cycle', () => HttpResponse.json({ today: '2026-09-24', cycle: CYCLE })),
    http.get('*/api/actions', () => HttpResponse.json({ actions: [typeof action === 'function' ? action() : action] })),
    http.delete(`*/api/actions/${ACTION_ID}/photos/:photoId`, ({ params }) => {
      if (failRemove) {
        return HttpResponse.json(
          { error: { code: 'PHOTOS_CLOSED', message: 'O prazo para mudar as fotos desta ação acabou.' } },
          { status: 409 },
        );
      }
      removed.push(params.photoId as string);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { uploads, removed };
}

function fileInput(card: HTMLElement): HTMLInputElement {
  return card.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('/acao: fotos da ação avaliada', () => {
  it('miniaturas, a foto grande com anterior e próxima e o prazo da próxima consulta', async () => {
    photosApi(fakeAction({ photos: [photo(1), photo(2)] }));
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Café com amiga' });
    const list = within(card).getByRole('list', { name: 'Fotos de Café com amiga' });
    const thumbs = within(list).getAllByRole('button');
    expect(thumbs.map((t) => t.getAttribute('aria-label'))).toEqual(['Abrir a foto 1 de 2', 'Abrir a foto 2 de 2']);
    expect(within(thumbs[0]!).getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      `/api/actions/${ACTION_ID}/photos/${photo(1).id}?size=thumb`,
    );
    expect(card).toHaveTextContent('Dá para adicionar ou remover até seg, 28/09, às 14:00. 2 fotos (cabem até 10).');
    expect(card).toHaveTextContent('As fotos aparecem para a sua psicóloga.');

    await user.click(thumbs[0]!);
    const viewer = await screen.findByRole('dialog', { name: 'Foto 1 de 2' });
    expect(within(viewer).getByRole('img', { name: 'Foto 1 de 2 de Café com amiga' })).toHaveAttribute(
      'src',
      `/api/actions/${ACTION_ID}/photos/${photo(1).id}?size=full`,
    );
    const full = within(viewer).getByRole('link', { name: /^Abrir em tamanho real.*abre em outra aba/ });
    expect(full).toHaveAttribute('href', `/api/actions/${ACTION_ID}/photos/${photo(1).id}?size=full`);
    expect(full).toHaveAttribute('target', '_blank');
    // As setas funcionam com o foco no primeiro elemento da janela (onde o navegador o põe ao abrir).
    full.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('dialog', { name: 'Foto 2 de 2' })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Próxima/ }));
    expect(screen.getByRole('dialog', { name: 'Foto 2 de 2' })).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('dialog', { name: 'Foto 1 de 2' })).toBeInTheDocument();
  });

  it('"Remover foto" pede confirmação, remove só a foto aberta e mostra a que ficou', async () => {
    let photos = [photo(1), photo(2)];
    const { removed } = photosApi(() => fakeAction({ photos }));
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Café com amiga' });
    await user.click(within(card).getByRole('button', { name: 'Abrir a foto 2 de 2' }));
    const viewer = await screen.findByRole('dialog', { name: 'Foto 2 de 2' });

    await user.click(within(viewer).getByRole('button', { name: 'Remover foto' }));
    expect(viewer).toHaveTextContent('Remover esta foto? Não dá para desfazer.');
    await user.click(within(viewer).getByRole('button', { name: 'Cancelar' }));
    expect(removed).toEqual([]);

    photos = [photo(1)];
    await user.click(within(viewer).getByRole('button', { name: 'Remover foto' }));
    await user.click(within(viewer).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(removed).toEqual([photo(2).id]));
    // A janela continua aberta, agora na foto que sobrou.
    expect(await screen.findByRole('dialog', { name: 'Foto 1 de 1' })).toBeInTheDocument();
  });

  it('remover a única foto fecha a janela; um erro da API aparece nela', async () => {
    photosApi(fakeAction({ photos: [photo(1)] }), { failRemove: true });
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Café com amiga' });
    await user.click(within(card).getByRole('button', { name: 'Abrir a foto 1 de 1' }));
    const viewer = await screen.findByRole('dialog', { name: 'Foto 1 de 1' });
    await user.click(within(viewer).getByRole('button', { name: 'Remover foto' }));
    await user.click(within(viewer).getByRole('button', { name: 'Remover' }));
    expect(await within(viewer).findByRole('alert')).toHaveTextContent('O prazo para mudar as fotos desta ação acabou.');
  });

  it('uma foto que a API recusa aparece no aviso, com o nome do arquivo', async () => {
    photosApi(fakeAction(), { failUpload: true });
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Café com amiga' });
    await user.upload(fileInput(card), new File(['x'], 'quebrada.jpg', { type: 'image/jpeg' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('"quebrada.jpg": Não foi possível ler esta imagem.');
  });

  // PHOTO_LIMIT: a ação ganhou fotos noutro aparelho e o espaço que a tela calculou ficou velho.
  it.each([
    {
      code: 'ACCOUNT_PHOTO_LIMIT',
      message: 'Sua conta chegou ao limite de 300 fotos. Para adicionar outra, remova uma foto de alguma ação que ainda esteja no prazo.',
    },
    { code: 'PHOTO_LIMIT', message: 'Cada ação tem espaço para até 10 fotos.' },
  ])('limite cheio ($code): avisa uma vez só e não manda as que faltam (DEC-074)', async ({ code, message }) => {
    const { uploads } = photosApi(fakeAction(), { limit: { room: 1, code, message } });
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Café com amiga' });
    await user.upload(
      fileInput(card),
      ['a', 'b', 'c', 'd'].map((n) => new File([n], `${n}.jpg`, { type: 'image/jpeg' })),
    );

    const alert = await within(card).findByRole('alert');
    expect(within(alert).getAllByRole('listitem')).toHaveLength(1);
    expect(alert).toHaveTextContent(`${message} As outras não foram enviadas.`);
    expect(alert).not.toHaveTextContent('b.jpg');
    // A primeira coube; a segunda bateu no limite; a terceira e a quarta nem foram enviadas.
    expect(uploads.map((u) => u.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(within(card).getByRole('status')).toHaveTextContent('Pronto, a foto foi adicionada.');
  });

  it.each([
    { names: ['a', 'b', 'c'], expected: 'Cada ação tem espaço para até 10 fotos. A outra não foi enviada.' },
    { names: ['a', 'b'], expected: 'Cada ação tem espaço para até 10 fotos.' },
  ])('limite cheio com $names.length fotos: diz só o que de fato ficou sem enviar', async ({ names, expected }) => {
    const message = 'Cada ação tem espaço para até 10 fotos.';
    photosApi(fakeAction(), { limit: { room: 1, code: 'PHOTO_LIMIT', message } });
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Café com amiga' });
    await user.upload(
      fileInput(card),
      names.map((n) => new File([n], `${n}.jpg`, { type: 'image/jpeg' })),
    );

    expect((await within(card).findByRole('alert')).textContent).toBe(expected);
  });

  it('"Adicionar fotos" manda uma por vez, com o tipo da foto, e avisa a que passa de 20 MB', async () => {
    const { uploads } = photosApi(fakeAction());
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Café com amiga' });
    expect(within(card).queryByRole('list', { name: /Fotos de/ })).not.toBeInTheDocument();
    expect(card).toHaveTextContent('Até 10 fotos.');

    const big = new File(['x'], 'grande.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });
    await user.upload(fileInput(card), [
      new File(['png'], 'praia.png', { type: 'image/png' }),
      big,
      new File(['jpeg'], 'cafe.jpg', { type: 'image/jpeg' }),
    ]);

    const path = `/actions/${ACTION_ID}/photos`;
    await waitFor(() =>
      expect(uploads).toEqual([
        { path, name: 'praia.png', type: 'image/png' },
        { path, name: 'cafe.jpg', type: 'image/jpeg' },
      ]),
    );
    expect(within(card).getByRole('alert')).toHaveTextContent('"grande.jpg" passa de 20 MB.');
  });

  it('com 9 fotos, só cabe mais uma: as outras ficam de fora, com aviso', async () => {
    const { uploads } = photosApi(fakeAction({ photos: Array.from({ length: 9 }, (_, i) => photo(i + 1)) }));
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Café com amiga' });
    await user.upload(fileInput(card), [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    ]);

    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(within(card).getByRole('alert')).toHaveTextContent('Só cabia mais 1 foto; as outras ficaram de fora.');
  });

  it('com 10 fotos, não tem mais "Adicionar fotos"', async () => {
    photosApi(fakeAction({ photos: Array.from({ length: 10 }, (_, i) => photo(i + 1)) }));
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Café com amiga' });
    expect(card).toHaveTextContent('10 fotos, o máximo.');
    expect(within(card).queryByRole('button', { name: 'Adicionar fotos' })).not.toBeInTheDocument();
  });

  it('prazo encerrado: as fotos continuam à vista, sem adicionar nem remover', async () => {
    photosApi(fakeAction({ photos: [photo(1)], photosOpen: false }));
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Café com amiga' });
    expect(within(card).queryByRole('button', { name: 'Adicionar fotos' })).not.toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Abrir a foto 1 de 1' }));
    const viewer = await screen.findByRole('dialog', { name: 'Foto 1 de 1' });
    expect(within(viewer).queryByRole('button', { name: 'Remover foto' })).not.toBeInTheDocument();
    expect(within(viewer).queryByRole('button', { name: /Próxima/ })).not.toBeInTheDocument();
  });

  it('prazo encerrado e sem fotos, ou ação ainda planejada: nada de fotos no cartão', async () => {
    server.use(
      http.get('*/api/appointments/cycle', () => HttpResponse.json({ today: '2026-09-24', cycle: CYCLE })),
      http.get('*/api/actions', () =>
        HttpResponse.json({
          actions: [
            fakeAction({ photosOpen: false }),
            fakeAction({
              id: '00000000-0000-4000-a000-000000000002',
              name: 'Caminhar',
              status: 'PLANEJADA',
              pleasure: null,
              achievement: null,
              actionDate: '2026-09-25',
              photosDeadline: null,
              photosOpen: false,
            }),
          ],
        }),
      ),
    );
    renderRoute('/acao');

    for (const name of ['Café com amiga', 'Caminhar']) {
      const card = await screen.findByRole('article', { name });
      expect(card).not.toHaveTextContent(/foto/i);
    }
  });

  it('sem o aceite das fotos: a Ação funciona e "Adicionar fotos" pede o aceite antes', async () => {
    const { uploads } = photosApi(fakeAction());
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: { ...fakeUser, privacyUpToDate: false, privacyAreas: { ...fakeUser.privacyAreas, actionPhotos: false } },
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Café com amiga' });
    expect(fileInput(card)).toBeNull();
    await user.click(within(card).getByRole('button', { name: 'Adicionar fotos' }));

    const dialog = await screen.findByRole('dialog', { name: 'Fotos da Ação' });
    expect(dialog).toHaveTextContent('Atualizamos o aviso de privacidade para incluir as fotos da Ação.');
    expect(dialog).toHaveTextContent('Para adicionar fotos às suas ações, leia o que mudou e confirme.');

    // "Agora não" fecha sem aceitar; dá para voltar quando quiser.
    await user.click(within(dialog).getByRole('button', { name: 'Agora não' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Adicionar fotos' })).toBeInTheDocument();
    expect(uploads).toEqual([]);
  });

  it('aceitando pela janela, ela fecha e o "Adicionar fotos" fica liberado', async () => {
    let accepted = false;
    photosApi(fakeAction());
    vi.mocked(api.post).mockImplementation(async (path) => {
      if (path !== '/auth/accept-privacy') throw new Error(`chamada inesperada: ${path}`);
      accepted = true;
      return { data: { user: fakeUser }, status: 200 };
    });
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: accepted
            ? fakeUser
            : { ...fakeUser, privacyUpToDate: false, privacyAreas: { ...fakeUser.privacyAreas, actionPhotos: false } },
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Café com amiga' });
    await user.click(within(card).getByRole('button', { name: 'Adicionar fotos' }));
    const dialog = await screen.findByRole('dialog', { name: 'Fotos da Ação' });
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Aceitar e continuar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(accepted).toBe(true);
    expect(fileInput(card)).not.toBeNull();
    expect(within(card).getByText('Pronto, agora dá para adicionar fotos.')).toBeInTheDocument();
  });
});
