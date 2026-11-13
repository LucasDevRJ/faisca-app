import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHARED_AREAS } from '../features/links/links-api';
import type { PeriodSummary } from '../features/summary/summary-api';
import { summaryBlocks } from '../features/summary/summary-format';
import type { PatientSummary } from '../features/therapist/therapist-api';
import { renderRoute } from '../test/render';
import { apiError, fakeAgenda, fakePeriodSummary, fakeUser, loggedIn, server } from '../test/server';

// Resumo do período em números (DEC-100): o cartão da profissional e o "Meu resumo" do paciente.
// Dados fictícios (regra 5). "Hoje": quinta, 12/11/2026.
const PATIENT_ID = '00000000-0000-4000-8000-00000000000a';
const BASE = `*/api/therapist/patients/${PATIENT_ID}`;
const TODAY = '2026-11-12';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T18:00:00Z'));
  try {
    localStorage.clear();
  } catch {
    // Sem armazenamento, os testes seguem.
  }
});

afterEach(() => {
  vi.useRealTimers();
});

// O exemplo aprovado pelo usuário: todas as áreas com registros.
const FULL: PeriodSummary = fakePeriodSummary({
  daysWithRecords: { current: 54, previous: 41 },
  activities: {
    current: { done: 32, notDone: 4, open: 3, avgWantBefore: 4.1, avgPleasure: 6.8, avgAchievement: 7 },
    previous: { done: 20, notDone: 2, open: 0, avgWantBefore: 3.8, avgPleasure: 6.1, avgAchievement: 6.5 },
  },
  thoughtRecords: {
    current: {
      count: 18,
      topEmotions: [
        { emotion: 'ANSIEDADE', count: 12, avgIntensity: 7.1 },
        { emotion: 'TRISTEZA', count: 8, avgIntensity: 6 },
        { emotion: 'OUTRA', count: 1, avgIntensity: 5.4 },
      ],
      avgBelief: 6.2,
      withAlternative: 9,
      alternativeEffect: { before: 7, after: 4.3 },
    },
    previous: { count: 25, topEmotions: [], avgBelief: 7.4, withAlternative: 3, alternativeEffect: null },
  },
  tensionEpisodes: {
    current: { count: 11, avgTension: 5.3, maxTension: 9, avgVocalize: 4 },
    previous: { count: 15, avgTension: 6.6, maxTension: 10, avgVocalize: 5.2 },
  },
  actions: {
    current: {
      evaluated: 12,
      notDone: 2,
      planned: 0,
      byCategory: { PRAZER: 5, CONEXAO: 3, REALIZACAO: 4 },
      avgExpectation: 4.2,
      avgPleasure: 6.9,
      avgAchievement: 6.5,
    },
    previous: {
      evaluated: 0,
      notDone: 0,
      planned: 0,
      byCategory: { PRAZER: 0, CONEXAO: 0, REALIZACAO: 0 },
      avgExpectation: null,
      avgPleasure: null,
      avgAchievement: null,
    },
  },
  plans: { current: { entries: 7, plans: 2 }, previous: { entries: 0, plans: 0 } },
});

describe('textos do resumo', () => {
  it('seguem o exemplo aprovado, com o "(antes: X)" neutro', () => {
    expect(summaryBlocks(FULL)).toEqual([
      {
        area: 'activities',
        title: 'Atividades',
        lines: [
          '32 feitas, 4 não realizadas, 3 ainda abertas',
          'Nas feitas, em média: vontade antes 4,1 · prazer 6,8 · realização 7,0 (antes: 3,8 · 6,1 · 6,5)',
        ],
      },
      {
        area: 'thoughtRecords',
        title: 'Pensamentos',
        lines: [
          '18 registros (antes: 25)',
          // "Outra" sai sem o nome escrito pelo paciente, que a API nem manda.
          'Emoções mais presentes: ansiedade (12 vezes, intensidade média 7,1) · tristeza (8 vezes, 6,0) · outra emoção (1 vez, 5,4)',
          'O quanto acreditava no pensamento, em média: 6,2 (antes: 7,4)',
          'Com explicação alternativa: 9 de 18. Nelas, a intensidade das emoções foi de 7,0 para 4,3, em média.',
        ],
      },
      {
        area: 'tensionEpisodes',
        title: 'Tensão',
        lines: [
          '11 episódios (antes: 15)',
          'Tensão média 5,3 (antes: 6,6) · a maior: 9 · vontade de vocalizar média 4,0 (antes: 5,2)',
        ],
      },
      {
        area: 'actions',
        title: 'Ação',
        lines: [
          '12 avaliadas e 2 não realizadas (Prazer 5 · Conexão 3 · Realização 4)',
          'Esperava 4,2 em média; depois, prazer 6,9 e realização 6,5',
        ],
      },
      { area: 'plans', title: 'Meus Planos', lines: ['7 registros em 2 planos'] },
    ]);
  });

  it('área sem registro no período não aparece; sem média anterior, sem "(antes)"; Ação só planejada', () => {
    const blocks = summaryBlocks(
      fakePeriodSummary({
        tensionEpisodes: {
          current: { count: 1, avgTension: 4, maxTension: 4, avgVocalize: 2 },
          previous: { count: 0, avgTension: null, maxTension: null, avgVocalize: null },
        },
        actions: {
          current: {
            evaluated: 0,
            notDone: 0,
            planned: 1,
            byCategory: { PRAZER: 0, CONEXAO: 0, REALIZACAO: 0 },
            avgExpectation: null,
            avgPleasure: null,
            avgAchievement: null,
          },
          previous: {
            evaluated: 0,
            notDone: 0,
            planned: 0,
            byCategory: { PRAZER: 0, CONEXAO: 0, REALIZACAO: 0 },
            avgExpectation: null,
            avgPleasure: null,
            avgAchievement: null,
          },
        },
        plans: { current: { entries: 0, plans: 0 }, previous: { entries: 3, plans: 1 } },
      }),
    );
    expect(blocks).toEqual([
      {
        area: 'tensionEpisodes',
        title: 'Tensão',
        lines: ['1 episódio (antes: 0)', 'Tensão média 4,0 · a maior: 4 · vontade de vocalizar média 2,0'],
      },
      // Só planejadas: sem "0 avaliadas e 0 não realizadas" na frente.
      { area: 'actions', title: 'Ação', lines: ['1 planejada'] },
    ]);
  });
});

function patientSummary(): PatientSummary {
  return {
    patient: { id: PATIENT_ID, name: 'Paula Fictícia', email: 'paula@faisca.test', linkedAt: '2026-09-01T15:00:00.000Z', avatarVersion: null },
    today: TODAY,
    lastAppointment: null,
    nextAppointment: null,
    agendaStatus: 'SEM_AGENDA',
    pause: null,
    highlight: { from: '2026-11-06', to: TODAY, reason: 'LAST_7_DAYS' },
    access: { kind: 'PSIQUIATRIA', sharedAreas: [...SHARED_AREAS] },
  };
}

// A psiquiatra com tudo liberado; guarda os períodos pedidos ao resumo.
function psychiatristApi(response: () => Response) {
  const ranges: string[] = [];
  server.use(
    http.get('*/api/auth/me', () =>
      HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } }),
    ),
    http.get(BASE, () => HttpResponse.json(patientSummary())),
    http.get(`${BASE}/cycle`, () => HttpResponse.json({ today: TODAY, cycle: null })),
    http.get(`${BASE}/appointments`, () => HttpResponse.json(fakeAgenda())),
    http.get(`${BASE}/activities`, () => HttpResponse.json({ activities: [] })),
    http.get(`${BASE}/thought-records`, () => HttpResponse.json({ thoughtRecords: [] })),
    http.get(`${BASE}/tension-episodes`, () => HttpResponse.json({ tensionEpisodes: [] })),
    http.get(`${BASE}/period-summary`, ({ request }) => {
      const url = new URL(request.url);
      ranges.push(`${url.searchParams.get('from')}..${url.searchParams.get('to')}`);
      return response();
    }),
  );
  return ranges;
}

describe('resumo na visão da profissional', () => {
  it('no topo, segue o período da tela, e "Ver registros" abre a aba da área', async () => {
    const ranges = psychiatristApi(() => HttpResponse.json(FULL));
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const card = await screen.findByRole('region', { name: 'Resumo do período' });
    expect(await within(card).findByText('Dias com registro: 54 (antes: 41)')).toBeInTheDocument();
    expect(within(card).getByText('13/08 a 12/11 · comparado com 14/05 a 12/08')).toBeInTheDocument();
    expect(within(card).getByText('11 episódios (antes: 15)')).toBeInTheDocument();
    // Os 3 meses da psiquiatra (DEC-099).
    expect(ranges).toContain('2026-08-13..2026-11-12');

    await user.click(within(card).getByRole('button', { name: /Ver registros.*Tensão/ }));
    const tabs = screen.getByRole('group', { name: 'Tipo de registro' });
    expect(within(tabs).getByRole('button', { name: 'Tensão' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('sem nenhuma área com acesso, o cartão não aparece', async () => {
    const ranges = psychiatristApi(() => HttpResponse.json(fakePeriodSummary()));
    renderRoute(`/pacientes/${PATIENT_ID}`);

    await screen.findByRole('group', { name: 'Tipo de registro' });
    await vi.waitFor(() => expect(ranges.length).toBeGreaterThan(0));
    await vi.waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Resumo do período' })).not.toBeInTheDocument(),
    );
  });

  it('erro da API: explica e deixa tentar de novo', async () => {
    let fail = true;
    psychiatristApi(() => (fail ? apiError(500, 'INTERNAL', 'Erro') : HttpResponse.json(FULL)));
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const card = await screen.findByRole('region', { name: 'Resumo do período' });
    expect(
      await within(card).findByText('Não conseguimos carregar o resumo. Confira sua conexão e tente de novo.'),
    ).toBeInTheDocument();
    fail = false;
    await user.click(within(card).getByRole('button', { name: 'Tentar de novo' }));
    expect(await within(card).findByText('Dias com registro: 54 (antes: 41)')).toBeInTheDocument();
  });

  it('vínculo desfeito (403): a página inteira some', async () => {
    psychiatristApi(() => apiError(403, 'FORBIDDEN', 'Sem acesso'));
    renderRoute(`/pacientes/${PATIENT_ID}`);

    expect(await screen.findByRole('heading', { name: 'Registros indisponíveis' })).toBeInTheDocument();
  });
});

describe('"Meu resumo" do paciente', () => {
  it('fechado por padrão: só pergunta à API depois de aberto, no período da tela', async () => {
    const ranges: string[] = [];
    server.use(
      loggedIn,
      http.get('*/api/period-summary', ({ request }) => {
        const url = new URL(request.url);
        ranges.push(`${url.searchParams.get('from')}..${url.searchParams.get('to')}`);
        // O front nunca manda o id do paciente: a API usa a sessão.
        expect(url.searchParams.has('patientId')).toBe(false);
        return HttpResponse.json(FULL);
      }),
    );
    const user = userEvent.setup();
    renderRoute('/registros?semana=2026-11-09');

    const card = await screen.findByRole('region', { name: 'Meu resumo' });
    const toggle = within(card).getByRole('button', { name: 'Ver o resumo' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(ranges).toEqual([]);

    await user.click(toggle);
    expect(await within(card).findByText('Dias com registro: 54 (antes: 41)')).toBeInTheDocument();
    expect(ranges).toEqual(['2026-11-09..2026-11-15']);
    expect(within(card).getByRole('button', { name: 'Esconder o resumo' })).toHaveAttribute('aria-expanded', 'true');

    // As atividades já estão nesta tela: sem link. As outras áreas abrem a própria página, no mesmo período.
    expect(within(card).queryByRole('link', { name: /de Atividades/ })).not.toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Ver registros.*Pensamentos/ })).toHaveAttribute(
      'href',
      '/pensamentos?semana=2026-11-09',
    );
  });

  it('sem registro no período, diz isso; com erro da API, deixa tentar de novo', async () => {
    let fail = true;
    server.use(
      loggedIn,
      http.get('*/api/period-summary', () =>
        fail
          ? apiError(500, 'INTERNAL', 'Erro')
          : HttpResponse.json(fakePeriodSummary()),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/registros?semana=2026-11-09');

    const card = await screen.findByRole('region', { name: 'Meu resumo' });
    await user.click(within(card).getByRole('button', { name: 'Ver o resumo' }));
    expect(
      await within(card).findByText('Não conseguimos carregar o resumo. Confira sua conexão e tente de novo.'),
    ).toBeInTheDocument();

    fail = false;
    await user.click(within(card).getByRole('button', { name: 'Tentar de novo' }));
    expect(await within(card).findByText('Nada registrado neste período.')).toBeInTheDocument();
    expect(within(card).queryByText(/Dias com registro/)).not.toBeInTheDocument();
  });
});
