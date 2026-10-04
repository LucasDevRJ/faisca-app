import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TensionEpisode } from '../features/tension-episodes/tension-episodes-api';
import { toChartPoints } from '../features/tension-episodes/tension-chart-points';
import { renderRoute } from '../test/render';
import { apiError, fakeTensionEpisode, fakeUser, loggedIn, outdatedPrivacy, server } from '../test/server';

// Episódios de tensão do paciente (DEC-042, DEC-043). Dados fictícios (regra 5).
// "Hoje" fixo: quinta, 24/09/2026, 15h em São Paulo.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  server.use(loggedIn);
});

afterEach(() => {
  vi.useRealTimers();
});

// Aceitou a versão do aviso do RPD, mas não a que cita os episódios.
const rpdOnlyUser = http.get('*/api/auth/me', () =>
  HttpResponse.json({
    user: { ...fakeUser, privacyUpToDate: false, privacyAreas: { thoughtRecords: true, tensionEpisodes: false, appointmentSchedule: false, actions: false } },
  }),
);

// Responde a semana pedida e guarda os períodos de cada chamada.
function weekHandler(episodes: TensionEpisode[]) {
  const calls: { from: string | null; to: string | null }[] = [];
  server.use(
    http.get('*/api/tension-episodes', ({ request }) => {
      const url = new URL(request.url);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      calls.push({ from, to });
      return HttpResponse.json({
        tensionEpisodes: episodes.filter((e) => from && to && e.episodeDate >= from && e.episodeDate <= to),
      });
    }),
  );
  return calls;
}

// Guarda as escritas (método, caminho e corpo).
function recordWrites(responses: Partial<Record<string, (body: unknown) => Response>> = {}) {
  const writes: { method: string; path: string; body: unknown }[] = [];
  const handle =
    (method: string) =>
    async ({ request }: { request: Request }) => {
      const path = new URL(request.url).pathname.replace(/^\/api/, '');
      const text = await request.text();
      const body = text ? JSON.parse(text) : undefined;
      writes.push({ method, path, body });
      const custom = responses[`${method} ${path.replace(/[0-9a-f-]{36}/, ':id')}`];
      if (custom) return custom(body);
      if (method === 'DELETE') return new HttpResponse(null, { status: 204 });
      return HttpResponse.json(
        { tensionEpisode: fakeTensionEpisode(body as Partial<TensionEpisode>) },
        { status: method === 'POST' ? 201 : 200 },
      );
    };
  server.use(
    http.post('*/api/tension-episodes', handle('POST')),
    http.patch('*/api/tension-episodes/:id', handle('PATCH')),
    http.delete('*/api/tension-episodes/:id', handle('DELETE')),
    http.post('*/api/auth/accept-privacy', handle('POST')),
  );
  return writes;
}

describe('/tensao', () => {
  it('quatro abas; a semana mostra só os dias com episódio', async () => {
    const calls = weekHandler([
      fakeTensionEpisode({ situation: 'Fila do mercado', episodeDate: '2026-09-22' }),
      fakeTensionEpisode({ situation: 'Reunião', episodeDate: '2026-09-24' }),
      fakeTensionEpisode({ situation: 'Outra semana', episodeDate: '2026-09-28' }),
    ]);
    renderRoute('/tensao');

    const tabs = await screen.findByRole('navigation', { name: 'Registros' });
    expect(within(tabs).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Atividades',
      'Pensamentos',
      'Tensão',
      'Ação',
    ]);
    expect(within(tabs).getByRole('link', { name: 'Tensão' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('article', { name: 'Episódio: Fila do mercado' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Episódio: Reunião' })).toBeInTheDocument();
    expect(screen.queryByText('Outra semana')).not.toBeInTheDocument();
    expect(calls[0]).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'terça-feira, 22/09',
      'quinta-feira, 24/09hoje',
      'Tensão e vontade de vocalizar',
    ]);
  });

  it('o cartão mostra a hora (ou "sem horário"), as duas notas e os textos', async () => {
    weekHandler([
      fakeTensionEpisode({ situation: 'Com hora', episodeTime: '07:05' }),
      fakeTensionEpisode({ situation: 'Sem hora', episodeTime: null }),
    ]);
    renderRoute('/tensao');

    const card = await screen.findByRole('article', { name: 'Episódio: Com hora' });
    expect(within(card).getByText('às 07:05')).toBeInTheDocument();
    for (const text of ['Comportamento fictício', 'Consequência fictícia']) {
      expect(within(card).getByText(text)).toBeInTheDocument();
    }
    expect(within(card).getByText('Tensão').nextElementSibling).toHaveTextContent('8 de 10');
    expect(within(card).getByText('Vontade de vocalizar').nextElementSibling).toHaveTextContent('6 de 10');
    expect(within(screen.getByRole('article', { name: 'Episódio: Sem hora' })).getByText('sem horário')).toBeInTheDocument();
  });

  it('o gráfico também aparece para o paciente, com a tabela para leitor de tela', async () => {
    weekHandler([
      fakeTensionEpisode({ episodeDate: '2026-09-23', episodeTime: null, tensionLevel: 4, vocalizeUrge: 2 }),
      fakeTensionEpisode({ episodeDate: '2026-09-23', episodeTime: '09:00', tensionLevel: 9, vocalizeUrge: 7 }),
    ]);
    renderRoute('/tensao');

    const table = await screen.findByRole('table', { name: 'Tensão e vontade de vocalizar dos episódios na semana' });
    const rows = within(table).getAllByRole('row').slice(1);
    // Na ordem do tempo: às 9h vem antes do episódio sem hora, que fica no meio do dia.
    expect(rows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))).toEqual([
      ['09:00', '9', '7'],
      ['sem horário', '4', '2'],
    ]);
  });

  it('semana sem episódio: mensagem acolhedora, sem gráfico', async () => {
    weekHandler([]);
    renderRoute('/tensao');

    expect(await screen.findByText(/Nenhum episódio nesta semana/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('editar e excluir só no dia do registro', async () => {
    weekHandler([
      fakeTensionEpisode({ situation: 'De hoje' }),
      fakeTensionEpisode({ situation: 'De ontem', editable: false, createdAt: '2026-09-23T15:00:00.000Z' }),
    ]);
    renderRoute('/tensao');

    const today = await screen.findByRole('article', { name: 'Episódio: De hoje' });
    expect(within(today).getByRole('link', { name: 'Editar' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/tensao\/.+\/editar$/),
    );
    expect(within(today).getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
    const locked = screen.getByRole('article', { name: 'Episódio: De ontem' });
    expect(within(locked).queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument();
    expect(within(locked).getByText(/Registrado em/)).toBeInTheDocument();
  });

  it('excluir pede confirmação e avisa', async () => {
    weekHandler([fakeTensionEpisode({ situation: 'Para excluir' })]);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/tensao');

    const card = await screen.findByRole('article', { name: 'Episódio: Para excluir' });
    await user.click(within(card).getByRole('button', { name: 'Excluir' }));
    const dialog = await screen.findByRole('dialog', { name: 'Excluir este episódio?' });
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText('Episódio excluído.')).toBeInTheDocument();
    expect(writes).toEqual([{ method: 'DELETE', path: expect.stringMatching(/^\/tension-episodes\//), body: undefined }]);
  });
});

describe('aviso de privacidade por área (DEC-042)', () => {
  it('quem só aceitou a versão do RPD vê o pedido em /tensao, sem buscar nada e sem a faixa repetida', async () => {
    server.use(rpdOnlyUser);
    const calls = weekHandler([fakeTensionEpisode()]);
    renderRoute('/tensao');

    expect(await screen.findByRole('heading', { name: 'Antes de começar' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /uso dos meus episódios de tensão/ })).not.toBeChecked();
    expect(screen.queryByText(/Ver o que mudou/)).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('e a faixa em Pensamentos cita só o que falta liberar', async () => {
    server.use(rpdOnlyUser);
    renderRoute('/pensamentos');

    const banner = await screen.findByText(/Atualizamos o aviso de privacidade/);
    expect(banner).toHaveTextContent(
      'para incluir os Episódios de tensão, a agenda de consultas e a Ação. Você só precisa aceitar a nova versão para usar essas partes.',
    );
  });

  it('sem nenhum dos aceites, a faixa em Atividades cita todas as áreas', async () => {
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, ...outdatedPrivacy } })));
    renderRoute('/registros');

    const banner = await screen.findByText(/Atualizamos o aviso de privacidade/);
    expect(banner).toHaveTextContent('o Registro de Pensamentos, os Episódios de tensão, a agenda de consultas e a Ação');
    expect(banner).toHaveTextContent('essas partes');
  });

  it('marcando a caixa, aceita e libera a lista', async () => {
    let accepted = false;
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: accepted
            ? fakeUser
            : { ...fakeUser, privacyUpToDate: false, privacyAreas: { thoughtRecords: true, tensionEpisodes: false, appointmentSchedule: false, actions: false } },
        }),
      ),
    );
    weekHandler([fakeTensionEpisode({ situation: 'Depois do aceite' })]);
    const writes = recordWrites({
      'POST /auth/accept-privacy': () => {
        accepted = true;
        return HttpResponse.json({ user: fakeUser });
      },
    });
    const user = userEvent.setup();
    renderRoute('/tensao');

    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Aceitar e continuar' }));

    expect(await screen.findByRole('article', { name: 'Episódio: Depois do aceite' })).toBeInTheDocument();
    expect(writes).toEqual([{ method: 'POST', path: '/auth/accept-privacy', body: { acceptPrivacy: true } }]);
  });
});

describe('/tensao/novo', () => {
  async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText('O que estava acontecendo?'), 'Fila do mercado');
    fireEvent.change(screen.getByLabelText('Tensão'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Vontade de vocalizar'), { target: { value: '6' } });
    await user.type(screen.getByLabelText('O que você fez?'), 'Respirei fundo');
    await user.type(screen.getByLabelText('O que aconteceu depois?'), 'Passou aos poucos');
  }

  it('tudo é obrigatório, menos a hora: sem preencher, nada é enviado', async () => {
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/tensao/novo');

    await user.click(await screen.findByRole('button', { name: 'Salvar episódio' }));

    expect(await screen.findByText('Conte o que estava acontecendo.')).toBeInTheDocument();
    expect(screen.getAllByText('Escolha um número de 0 a 10.')).toHaveLength(2);
    expect(screen.getByText('Conte o que você fez.')).toBeInTheDocument();
    expect(screen.getByText('Conte o que aconteceu depois.')).toBeInTheDocument();
    expect(screen.queryByText(/hora válida|Essa hora/)).not.toBeInTheDocument();
    expect(writes).toEqual([]);
  });

  it('a vontade de vocalizar explica o que cobre', async () => {
    recordWrites();
    renderRoute('/tensao/novo');

    expect(await screen.findByLabelText('Vontade de vocalizar')).toHaveAccessibleDescription(
      expect.stringContaining('Falar, gritar, se movimentar…'),
    );
    expect(screen.getByLabelText('Hora (opcional)')).toHaveAccessibleDescription('Pode deixar em branco se não lembrar.');
  });

  it('salva sem hora (null) e volta para a semana com o aviso', async () => {
    const writes = recordWrites();
    const user = userEvent.setup();
    const { router } = renderRoute('/tensao/novo?dia=2026-09-23');

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Salvar episódio' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: 'POST',
      path: '/tension-episodes',
      body: {
        episodeDate: '2026-09-23',
        episodeTime: null,
        situation: 'Fila do mercado',
        tensionLevel: 8,
        vocalizeUrge: 6,
        behavior: 'Respirei fundo',
        consequence: 'Passou aos poucos',
      },
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/tensao'));
    expect(await screen.findByText('Registro salvo.')).toBeInTheDocument();
  });

  it('com hora, manda HH:MM', async () => {
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/tensao/novo?dia=2026-09-23');

    await fillRequired(user);
    fireEvent.change(screen.getByLabelText('Hora (opcional)'), { target: { value: '19:20' } });
    await user.click(screen.getByRole('button', { name: 'Salvar episódio' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body).toMatchObject({ episodeTime: '19:20' });
  });

  it('hoje, com uma hora que ainda não chegou: avisa e não envia', async () => {
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/tensao/novo');

    await fillRequired(user);
    // Agora são 15h em São Paulo.
    fireEvent.change(screen.getByLabelText('Hora (opcional)'), { target: { value: '16:00' } });
    await user.click(screen.getByRole('button', { name: 'Salvar episódio' }));

    expect(await screen.findByText(/Essa hora ainda não chegou/)).toBeInTheDocument();
    expect(writes).toEqual([]);
  });

  it('erro da API aparece no formulário, sem perder o que foi escrito', async () => {
    recordWrites({
      'POST /tension-episodes': () =>
        apiError(400, 'TIME_IN_FUTURE', 'O episódio de hoje precisa ter uma hora que já passou.'),
    });
    const user = userEvent.setup();
    renderRoute('/tensao/novo');

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Salvar episódio' }));

    expect(await screen.findByText('O episódio de hoje precisa ter uma hora que já passou.')).toBeInTheDocument();
    expect(screen.getByLabelText('O que estava acontecendo?')).toHaveValue('Fila do mercado');
  });
});

describe('/tensao/:id/editar', () => {
  it('carrega o episódio, apaga a hora e salva', async () => {
    const episode = fakeTensionEpisode({ episodeDate: '2026-09-23', episodeTime: '10:00' });
    server.use(http.get('*/api/tension-episodes/:id', () => HttpResponse.json({ tensionEpisode: episode })));
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute(`/tensao/${episode.id}/editar`);

    const time = await screen.findByLabelText('Hora (opcional)');
    expect(time).toHaveValue('10:00');
    fireEvent.change(time, { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ method: 'PATCH', body: { episodeTime: null, tensionLevel: 8 } });
    expect(await screen.findByText('Alterações salvas.')).toBeInTheDocument();
  });

  it('fora do prazo: explica e não mostra o formulário', async () => {
    const episode = fakeTensionEpisode({ editable: false });
    server.use(http.get('*/api/tension-episodes/:id', () => HttpResponse.json({ tensionEpisode: episode })));
    renderRoute(`/tensao/${episode.id}/editar`);

    expect(await screen.findByText(/só podia ser alterado no dia em que foi registrado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument();
  });
});

describe('pontos do gráfico', () => {
  it('posição pela hora; sem hora, no meio do dia; em ordem de tempo', () => {
    const points = toChartPoints(
      [
        fakeTensionEpisode({ id: 'b', episodeDate: '2026-09-22', episodeTime: null }),
        fakeTensionEpisode({ id: 'a', episodeDate: '2026-09-22', episodeTime: '06:00' }),
        fakeTensionEpisode({ id: 'c', episodeDate: '2026-09-21', episodeTime: '18:00' }),
      ],
      '2026-09-21',
    );

    expect(points.map((p) => [p.id, p.x])).toEqual([
      ['c', 0.75],
      ['a', 1.25],
      ['b', 1.5],
    ]);
  });
});
