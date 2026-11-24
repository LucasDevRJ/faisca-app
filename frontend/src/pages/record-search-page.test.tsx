import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render';
import { fakeUser, loggedIn, server } from '../test/server';

const therapist = { ...fakeUser, profiles: { patient: false, therapist: true } };
const searchResult = {
  id: '00000000-0000-4000-9000-000000000001', type: 'THOUGHT_RECORD', date: '2026-11-18', title: 'Pensamento',
  titleMatch: null, excerpt: 'Fiquei ansioso antes da conversa.', excerptField: 'situation', matchStart: 7, matchLength: 7,
  content: { situation: 'Fiquei ansioso antes da conversa.', automaticThought: 'Não vou conseguir conversar.', beliefLevel: 7,
    emotions: [{ emotion: 'ANSIEDADE', label: null, intensity: 8, intensityAfter: null }, { emotion: 'OUTRA', label: 'Saudade', intensity: 4, intensityAfter: 2 }], behavior: 'Fiquei em silêncio.', consequence: 'A conversa foi adiada.', alternativeExplanation: null },
};

beforeEach(() => server.use(loggedIn));

describe('buscar nos registros', () => {
  it('envia o termo no corpo, mostra trecho realçado e abre o registro completo na tela', async () => {
    const bodies: unknown[] = [];
    server.use(http.post('*/api/records/search', async ({ request }) => {
      bodies.push({ url: request.url, body: await request.json() });
      return HttpResponse.json({ results: [searchResult], page: 1, pageSize: 20, total: 1, hasMore: false });
    }));
    const user = userEvent.setup();
    renderRoute('/buscar');

    await user.type(await screen.findByRole('textbox', { name: 'O que você quer encontrar?' }), 'ansiosa');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByRole('heading', { name: 'Resultados' })).toBeInTheDocument();
    expect(screen.getByText('Abrir registro completo').closest('details')).not.toHaveAttribute('open');
    await user.click(screen.getByText('Abrir registro completo'));
    expect(await screen.findByText('Não vou conseguir conversar.', { selector: 'dd' })).toBeVisible();
    // A emoção aparece pelo nome, nunca pelo código interno.
    expect(screen.getByText('Ansiedade · intensidade 8; Saudade · intensidade 4 · depois 2')).toBeVisible();
    expect(screen.queryByText(/ANSIEDADE/)).not.toBeInTheDocument();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ url: 'http://localhost:3000/api/records/search', body: { term: 'ansiosa', page: 1 } });
  });

  it('mostra o rótulo do campo no trecho, realça a palavra inteira e não repete o título (#305)', async () => {
    const task = {
      id: '00000000-0000-4000-9000-000000000003', type: 'TASK', date: '2026-11-18', title: 'Tarefa fictícia',
      titleMatch: { start: 7, length: 8 }, excerpt: 'Anotar uma observação fictícia.', excerptField: 'description', matchStart: 22, matchLength: 8,
      content: { title: 'Tarefa fictícia', description: 'Anotar uma observação fictícia.', responseText: null, responseStatus: null },
    };
    const onlyTitle = {
      id: '00000000-0000-4000-9000-000000000004', type: 'ACTIVITY', date: '2026-11-17', title: 'Ligar para uma amiga',
      titleMatch: { start: 15, length: 5 }, excerpt: '', excerptField: null, matchStart: 0, matchLength: 0,
      content: { name: 'Ligar para uma amiga', status: 'PLANEJADA', observation: null, wantBefore: null, pleasure: null, achievement: null },
    };
    const longTitle = `${'Um pensamento automático bem comprido. '.repeat(8)}No fim aparece a palavra procurada.`;
    const longThought = {
      ...searchResult, id: '00000000-0000-4000-9000-000000000005', title: longTitle,
      titleMatch: { start: longTitle.indexOf('procurada'), length: 9 }, excerpt: '', excerptField: null, matchStart: 0, matchLength: 0,
    };
    const planEntry = {
      id: '00000000-0000-4000-9000-000000000006', type: 'PLAN_ENTRY', date: '2026-11-16', title: 'Plano fictício', titleMatch: null,
      excerpt: 'Liguei para um amigo', excerptField: 'answers', matchStart: 15, matchLength: 5,
      content: { planId: 'x', questions: ['O que fiz?'], answers: ['Liguei para um amigo'], entryTime: null },
    };
    server.use(http.post('*/api/records/search', () =>
      HttpResponse.json({ results: [searchResult, task, onlyTitle, longThought, planEntry], page: 1, pageSize: 20, total: 5, hasMore: false })));
    const user = userEvent.setup();
    renderRoute('/buscar');
    await user.type(await screen.findByRole('textbox', { name: 'O que você quer encontrar?' }), 'fictício');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    const [thought, taskCard, activityCard, longCard, planCard] = await screen.findAllByRole('article');
    expect(thought).toHaveTextContent('Situação: Fiquei ansioso antes da conversa.');
    expect(thought!.querySelector('mark')).toHaveTextContent(/^ansioso$/);
    expect(taskCard).toHaveTextContent('Tarefa combinada: Anotar uma observação fictícia.');
    expect([...taskCard!.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['fictícia', 'fictícia']);
    // Palavra só no título: realce no título e nenhum trecho repetindo o título.
    expect(activityCard!.querySelectorAll('mark')).toHaveLength(1);
    expect(activityCard!.querySelector('mark')).toHaveTextContent('amiga');
    const outsideDetails = [...activityCard!.children].filter((child) => child.tagName !== 'DETAILS').map((child) => child.textContent).join(' ');
    expect(outsideDetails.match(/Ligar para uma amiga/g)).toHaveLength(1);
    // Título longo: recortado em volta da palavra, para o realce não ficar escondido pelo limite de linhas.
    expect(longCard!.querySelector('mark')).toHaveTextContent('procurada');
    expect(longCard!.querySelector('p')!.textContent!.startsWith('…')).toBe(true);
    // No trecho aparece uma resposta só: o rótulo vai para o singular.
    expect(planCard).toHaveTextContent('Resposta: Liguei para um amigo');
  });

  it('com resultados de mais de um ano, separa por ano; de um ano só, sem título de ano (DEC-120)', async () => {
    const older = { ...searchResult, id: '00000000-0000-4000-9000-000000000002', date: '2025-12-30' };
    let results = [searchResult, older];
    server.use(http.post('*/api/records/search', () =>
      HttpResponse.json({ results, page: 1, pageSize: 20, total: results.length, hasMore: false })));
    const user = userEvent.setup();
    renderRoute('/buscar');

    await user.type(await screen.findByRole('textbox', { name: 'O que você quer encontrar?' }), 'ansiosa');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    const year2026 = await screen.findByRole('heading', { name: '2026' });
    const year2025 = screen.getByRole('heading', { name: '2025' });
    expect(year2026.compareDocumentPosition(year2025) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('30/12/2025')).toBeInTheDocument();
    expect(year2026).toHaveProperty('tagName', 'H3');
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(2);

    results = [searchResult];
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: '2025' })).not.toBeInTheDocument());
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('carrega páginas seguintes sem colocar a busca na URL', async () => {
    const pages: number[] = [];
    server.use(http.post('*/api/records/search', async ({ request }) => {
      const body = await request.json() as { page: number };
      pages.push(body.page);
      return HttpResponse.json({ results: [{ ...searchResult, id: `00000000-0000-4000-9000-${String(body.page).padStart(12, '0')}` }], page: body.page, pageSize: 1, total: 2, hasMore: body.page === 1 });
    }));
    const user = userEvent.setup();
    const { router } = renderRoute('/buscar');
    await user.type(await screen.findByRole('textbox', { name: 'O que você quer encontrar?' }), 'ansiosa');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await user.click(await screen.findByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(pages).toEqual([1, 2]));
    expect(router.state.location.search).toBe('');
  });

  it('a psicóloga vê o filtro de não lidos e envia a busca no corpo para o paciente aberto', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: therapist })),
      http.post('*/api/therapist/patients/:patientId/records/search', async ({ request, params }) => {
        bodies.push({ url: request.url, patientId: params.patientId, body: await request.json() });
        return HttpResponse.json({ results: [], page: 1, pageSize: 20, total: 0, hasMore: false });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/pacientes/00000000-0000-4000-8000-000000000045/buscar');
    expect(await screen.findByRole('checkbox', { name: 'Só registros para ler' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'O que você quer encontrar?' }), 'ansiosa');
    await user.click(screen.getByRole('checkbox', { name: 'Só registros para ler' }));
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      url: 'http://localhost:3000/api/therapist/patients/00000000-0000-4000-8000-000000000045/records/search',
      patientId: '00000000-0000-4000-8000-000000000045', body: { term: 'ansiosa', onlyUnread: true },
    });
  });
});
