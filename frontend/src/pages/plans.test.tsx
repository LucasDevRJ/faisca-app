import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plan, PlanEntry } from '../features/plans/plans-api';
import { TEMPLATE_QUESTIONS } from '../features/plans/plan-labels';
import type { PatientSummary } from '../features/therapist/therapist-api';
import { renderRoute } from '../test/render';
import { DEFAULT_ACCESSIBILITY } from '../features/profile/accessibility';
import { apiError, fakeAgenda, fakeUser, loggedIn, server } from '../test/server';
import { SHARED_AREAS } from '../features/links/links-api';

// Meus Planos (DEC-094, DEC-095). Dados fictícios (regra 5). "Hoje": quinta, 24/09/2026, 15h.
const PLAN_ID = '00000000-0000-4000-8000-0000000000a1';
const ENTRY_ID = '00000000-0000-4000-8000-0000000000b1';
const PATIENT_ID = '00000000-0000-4000-8000-00000000000a';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  server.use(loggedIn);
});

afterEach(() => {
  vi.useRealTimers();
});

function fakePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: PLAN_ID,
    title: 'Quando surgir vontade de rolar o celular',
    questions: ['O que aconteceu antes?', 'O que fiz?'],
    archived: false,
    archivedAt: null,
    hasEntries: false,
    lastEntryDate: null,
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
    ...overrides,
  };
}

function fakeEntry(overrides: Partial<PlanEntry> = {}): PlanEntry {
  return {
    id: ENTRY_ID,
    planId: PLAN_ID,
    planTitle: 'Quando surgir vontade de rolar o celular',
    entryDate: '2026-09-23',
    entryTime: '21:30',
    questions: ['O que aconteceu antes?', 'O que fiz?'],
    answers: ['Dia cansativo fictício', ''],
    editable: false,
    createdAt: '2026-09-23T23:00:00.000Z',
    updatedAt: '2026-09-23T23:00:00.000Z',
    ...overrides,
  };
}

// API do paciente: os planos, os registros e as escritas (método, caminho e corpo).
function plansApi({ plans = [fakePlan()], entries = [] as PlanEntry[] } = {}) {
  const writes: { method: string; path: string; body: unknown }[] = [];
  const record = (method: string, reply: (body: unknown) => Response) => async ({ request }: { request: Request }) => {
    const path = new URL(request.url).pathname.replace(/^\/api/, '');
    const text = await request.text();
    const body = text ? JSON.parse(text) : undefined;
    writes.push({ method, path, body });
    return reply(body);
  };
  server.use(
    http.get('*/api/plans', () => HttpResponse.json({ plans })),
    http.get('*/api/plans/:id', ({ params }) => {
      const plan = plans.find((item) => item.id === params.id);
      return plan ? HttpResponse.json({ plan }) : apiError(404, 'PLAN_NOT_FOUND', 'Plano não encontrado.');
    }),
    http.get('*/api/plans/:id/entries', () => HttpResponse.json({ entries })),
    http.get('*/api/plan-entries/:id', () => HttpResponse.json({ entry: entries[0] })),
    http.post(
      '*/api/plans',
      record('POST', (body) => HttpResponse.json({ plan: fakePlan(body as Partial<Plan>) }, { status: 201 })),
    ),
    http.patch(
      '*/api/plans/:id',
      record('PATCH', (body) => HttpResponse.json({ plan: fakePlan(body as Partial<Plan>) })),
    ),
    http.delete('*/api/plans/:id', record('DELETE', () => new HttpResponse(null, { status: 204 }))),
    http.post(
      '*/api/plans/:id/entries',
      record('POST', (body) => HttpResponse.json({ entry: fakeEntry(body as Partial<PlanEntry>) }, { status: 201 })),
    ),
    http.delete('*/api/plan-entries/:id', record('DELETE', () => new HttpResponse(null, { status: 204 }))),
  );
  return writes;
}

describe('abas do paciente', () => {
  it('sem plano: a aba fica escondida, a grade continua 2×2 e um link leva a criar o primeiro', async () => {
    plansApi({ plans: [] });
    renderRoute('/tensao');

    const link = await screen.findByRole('link', { name: 'Criar um plano' });
    expect(link).toHaveAttribute('href', '/planos/novo');
    const nav = screen.getByRole('navigation', { name: 'Registros' });
    expect(within(nav).queryByRole('link', { name: 'Meus Planos' })).not.toBeInTheDocument();
    expect(nav).toHaveClass('grid-cols-2');
  });

  it('com plano: a aba aparece, a grade passa a 3 colunas e o link sai', async () => {
    plansApi();
    renderRoute('/tensao');

    const nav = await screen.findByRole('navigation', { name: 'Registros' });
    expect(await within(nav).findByRole('link', { name: 'Meus Planos' })).toHaveAttribute('href', '/planos');
    expect(nav).toHaveClass('grid-cols-3');
    expect(screen.queryByRole('link', { name: 'Criar um plano' })).not.toBeInTheDocument();
  });

  it('sem o aceite da versão que cita o Meus Planos: pede o aceite na área', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, privacyUpToDate: false, privacyAreas: { ...fakeUser.privacyAreas, plans: false } } }),
      ),
    );
    renderRoute('/planos');

    expect(await screen.findByRole('heading', { name: 'Antes de começar' })).toBeInTheDocument();
    expect(screen.getByText(/incluir o Meus Planos/)).toBeInTheDocument();
  });
});

describe('/planos', () => {
  it('o cartão mostra o último registro; encerrar pede confirmação e grava', async () => {
    const writes = plansApi({ plans: [fakePlan({ hasEntries: true, lastEntryDate: '2026-09-23' })] });
    const user = userEvent.setup();
    renderRoute('/planos');

    const card = await screen.findByRole('article', { name: 'Quando surgir vontade de rolar o celular' });
    expect(within(card).getByText('Último registro: 23/09')).toBeInTheDocument();
    // Com registros, não dá para apagar: só encerrar.
    expect(within(card).queryByRole('button', { name: /Apagar plano/ })).not.toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: /Encerrar plano/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Encerrar este plano?' });
    await user.click(within(dialog).getByRole('button', { name: 'Encerrar' }));

    await waitFor(() => expect(writes).toEqual([{ method: 'PATCH', path: `/plans/${PLAN_ID}`, body: { archived: true } }]));
    expect(await screen.findByText('Plano encerrado. Os registros continuam guardados.')).toBeInTheDocument();
  });

  it('plano sem registros pode ser apagado; os encerrados ficam recolhidos, com Reabrir', async () => {
    const archived = fakePlan({ id: '00000000-0000-4000-8000-0000000000c1', title: 'Plano encerrado fictício', archived: true });
    const writes = plansApi({ plans: [fakePlan(), archived] });
    const user = userEvent.setup();
    renderRoute('/planos');

    const card = await screen.findByRole('article', { name: 'Quando surgir vontade de rolar o celular' });
    await user.click(within(card).getByRole('button', { name: /Apagar plano/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Apagar este plano?' });
    await user.click(within(dialog).getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(writes[0]).toEqual({ method: 'DELETE', path: `/plans/${PLAN_ID}`, body: undefined }));

    await user.click(screen.getByText('Planos encerrados (1)'));
    await user.click(screen.getByRole('button', { name: /Reabrir.*Plano encerrado fictício/ }));
    await waitFor(() =>
      expect(writes[1]).toEqual({ method: 'PATCH', path: `/plans/${archived.id}`, body: { archived: false } }),
    );
  });
});

describe('/planos/novo', () => {
  it('cria com o modelo das 6 perguntas e volta para a lista', async () => {
    const writes = plansApi({ plans: [] });
    const user = userEvent.setup();
    renderRoute('/planos/novo');

    await user.type(await screen.findByLabelText(/Nome do plano/), 'Quando surgir vontade de adiar');
    // Começa com uma pergunta em branco; o modelo entra pelo botão, sem confirmação.
    expect(screen.getAllByLabelText(/^Pergunta \d+/)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Usar o modelo de 6 perguntas' }));
    expect(screen.getAllByLabelText(/^Pergunta \d+/)).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: 'Criar plano' }));

    await waitFor(() =>
      expect(writes).toEqual([
        { method: 'POST', path: '/plans', body: { title: 'Quando surgir vontade de adiar', questions: TEMPLATE_QUESTIONS } },
      ]),
    );
    expect(await screen.findByText('Plano criado.')).toBeInTheDocument();
  });

  it('com perguntas escritas, o modelo pede confirmação antes de trocar', async () => {
    plansApi({ plans: [] });
    const user = userEvent.setup();
    renderRoute('/planos/novo');

    await user.type(await screen.findByLabelText('Pergunta 1'), 'Minha pergunta fictícia?');
    await user.click(screen.getByRole('button', { name: 'Usar o modelo de 6 perguntas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Trocar pelas perguntas do modelo?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByLabelText('Pergunta 1')).toHaveValue('Minha pergunta fictícia?');
  });

  it('adiciona e remove perguntas; nome e pergunta vazios avisam sem enviar', async () => {
    const writes = plansApi({ plans: [] });
    const user = userEvent.setup();
    renderRoute('/planos/novo');

    await user.click(await screen.findByRole('button', { name: 'Adicionar pergunta' }));
    expect(screen.getByLabelText('Pergunta 2')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: /Remover.*pergunta 2/ }));
    expect(screen.queryByLabelText('Pergunta 2')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Pergunta 1')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Criar plano' }));
    expect(await screen.findByText('Dê um nome ao plano.')).toBeInTheDocument();
    expect(screen.getByText('Escreva a pergunta ou remova este espaço.')).toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it('editar um plano com registros explica que as perguntas novas valem para os próximos', async () => {
    plansApi({ plans: [fakePlan({ hasEntries: true })] });
    renderRoute(`/planos/${PLAN_ID}/editar`);

    expect(
      await screen.findByText(/As perguntas novas valem para os próximos registros/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Pergunta 1')).toHaveValue('O que aconteceu antes?');
  });
});

describe('registros', () => {
  it('registra: uma resposta por pergunta, em branco vira "", e volta ao plano com o aviso', async () => {
    const writes = plansApi();
    const user = userEvent.setup();
    renderRoute(`/planos/${PLAN_ID}/registrar?dia=2026-09-23`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Quando surgir vontade de rolar o celular' })).toBeInTheDocument();
    expect(screen.getByText('Novo registro')).toBeInTheDocument();
    // Nada respondido: avisa e não envia.
    await user.click(screen.getByRole('button', { name: 'Salvar registro' }));
    expect(await screen.findByText('Responda pelo menos uma pergunta.')).toBeInTheDocument();
    expect(writes).toHaveLength(0);

    await user.type(screen.getByLabelText('O que fiz?'), 'Saí para caminhar');
    await user.click(screen.getByRole('button', { name: 'Salvar registro' }));

    await waitFor(() =>
      expect(writes).toEqual([
        {
          method: 'POST',
          path: `/plans/${PLAN_ID}/entries`,
          body: { entryDate: '2026-09-23', entryTime: null, answers: ['', 'Saí para caminhar'] },
        },
      ]),
    );
    expect(await screen.findByText('Registro salvo.')).toBeInTheDocument();
  });

  it('plano encerrado não deixa registrar', async () => {
    plansApi({ plans: [fakePlan({ archived: true })] });
    renderRoute(`/planos/${PLAN_ID}/registrar`);

    expect(await screen.findByText('Este plano está encerrado. Reabra o plano para registrar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar registro' })).not.toBeInTheDocument();
  });

  it('a página do plano mostra as perguntas, as respostas e "Sem resposta"; editar só no dia', async () => {
    const writes = plansApi({
      entries: [fakeEntry(), fakeEntry({ id: '00000000-0000-4000-8000-0000000000d1', entryDate: '2026-09-24', editable: true, answers: ['Hoje', 'Algo'] })],
    });
    const user = userEvent.setup();
    renderRoute(`/planos/${PLAN_ID}?semana=2026-09-21`);

    expect(await screen.findByText('Dia cansativo fictício')).toBeInTheDocument();
    expect(screen.getByText('Sem resposta')).toBeInTheDocument();
    // Só o de hoje tem os botões.
    expect(screen.getAllByRole('button', { name: /^Excluir/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /^Editar/ })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /^Excluir.*às 21:30/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Excluir este registro?' });
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(writes[0]?.method).toBe('DELETE'));
    expect(await screen.findByText('Registro excluído.')).toBeInTheDocument();
  });
});

describe('acessibilidade e prazo', () => {
  function withAccessibility(settings: Partial<typeof DEFAULT_ACCESSIBILITY>) {
    const accessibility = { ...DEFAULT_ACCESSIBILITY, ...settings };
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, accessibility } })));
  }

  it('com Linguagem direta, os textos ficam literais', async () => {
    withAccessibility({ directLanguage: true });
    plansApi({ plans: [] });
    renderRoute('/planos');

    expect(await screen.findByText(/Cada plano tem perguntas\. Quando a situação do plano acontecer/)).toBeInTheDocument();
    expect(screen.getByText(/Você pode deixar perguntas sem resposta/)).toBeInTheDocument();
    expect(screen.queryByText(/olhar com calma/)).not.toBeInTheDocument();
  });

  it('com "Uma coisa por vez", o dia e cada pergunta ficam em passos', async () => {
    withAccessibility({ oneThingAtATime: true });
    const writes = plansApi();
    const user = userEvent.setup();
    renderRoute(`/planos/${PLAN_ID}/registrar?dia=2026-09-23`);

    expect(await screen.findByText('Passo 1 de 3')).toBeInTheDocument();
    expect(screen.queryByLabelText('O que aconteceu antes?')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próximo ›' }));
    await user.type(await screen.findByLabelText('O que aconteceu antes?'), 'Algo fictício');
    await user.click(screen.getByRole('button', { name: 'Próximo ›' }));
    expect(await screen.findByLabelText('O que fiz?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar registro' }));

    await waitFor(() =>
      expect(writes[0]?.body).toEqual({ entryDate: '2026-09-23', entryTime: null, answers: ['Algo fictício', ''] }),
    );
  });

  it('editar um registro de outro dia: fica só de leitura, com o aviso', async () => {
    plansApi({ entries: [fakeEntry({ editable: false })] });
    renderRoute(`/planos/registros/${ENTRY_ID}/editar`);

    expect(
      await screen.findByText('Este registro só podia ser alterado no dia em que foi feito. Ele continua guardado como está.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument();
  });
});

describe('visão da terapeuta', () => {
  const BASE = `*/api/therapist/patients/${PATIENT_ID}`;
  const summary: PatientSummary = {
    patient: { id: PATIENT_ID, name: 'Paula Fictícia', email: 'paula@faisca.test', linkedAt: '2026-09-01T15:00:00.000Z', avatarVersion: null },
    today: '2026-09-24',
    lastAppointment: null,
    nextAppointment: null,
    agendaStatus: 'SEM_AGENDA',
    pause: null,
    highlight: { from: '2026-09-18', to: '2026-09-24', reason: 'LAST_7_DAYS' },
    access: { kind: 'PSICOLOGIA', sharedAreas: [...SHARED_AREAS] },
  };
  const unreadEntry = { ...fakeEntry(), readStatus: 'NAO_LIDO' as const, readAt: null };

  function therapistApi({
    plans = [fakePlan({ hasEntries: true })],
    kind = 'PSICOLOGIA',
    planWrites = [] as unknown[],
  }: { plans?: Plan[]; kind?: PatientSummary['access']['kind']; planWrites?: unknown[] } = {}) {
    const marks: unknown[] = [];
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } }),
      ),
      http.get(BASE, () => HttpResponse.json({ ...summary, access: { ...summary.access, kind } })),
      http.get(`${BASE}/cycle`, () => HttpResponse.json({ today: '2026-09-24', cycle: null })),
      http.get(`${BASE}/appointments`, () => HttpResponse.json(fakeAgenda())),
      http.get(`${BASE}/activities`, () => HttpResponse.json({ activities: [] })),
      http.get(`${BASE}/plans`, () => HttpResponse.json({ plans })),
      http.post(`${BASE}/plans`, async ({ request }) => {
        const body = await request.json();
        planWrites.push(body);
        return HttpResponse.json({ plan: fakePlan(body as Partial<Plan>) }, { status: 201 });
      }),
      http.get(`${BASE}/plans/:planId/entries`, () => HttpResponse.json({ entries: [unreadEntry] })),
      http.get(`${BASE}/unread`, () =>
        HttpResponse.json({
          thoughtRecords: [],
          tensionEpisodes: [],
          actions: [],
          aboutMe: [],
          planEntries: [unreadEntry],
          counts: { thoughtRecords: 0, tensionEpisodes: 0, actions: 0, aboutMe: 0, planEntries: 1 },
        }),
      ),
      http.put(`*/api/therapist/read-marks/${PATIENT_ID}`, async ({ request }) => {
        marks.push(await request.json());
        return HttpResponse.json({ marked: 1, readAt: '2026-09-24T18:00:00.000Z' });
      }),
    );
    return marks;
  }

  it('a aba Meus Planos aparece com o paciente que tem planos, com o número para ler', async () => {
    therapistApi();
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const tabs = await screen.findByRole('group', { name: 'Tipo de registro' });
    expect(await within(tabs).findByRole('button', { name: 'Meus Planos, 1 para ler' })).toBeInTheDocument();
    expect(tabs).toHaveClass('grid-cols-3');
    expect(screen.getByText(/1 registro de plano/)).toBeInTheDocument();
  });

  it('psicóloga cria um plano para o paciente mesmo quando ainda não existe nenhum', async () => {
    const planWrites: unknown[] = [];
    const user = userEvent.setup();
    therapistApi({ plans: [], planWrites });
    renderRoute(`/pacientes/${PATIENT_ID}?aba=planos&semana=2026-09-21`);

    expect(await screen.findByText('Paula ainda não criou nenhum plano.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Criar plano para Paula' }));
    const dialog = await screen.findByRole('dialog', { name: 'Criar plano para Paula' });
    await user.type(within(dialog).getByLabelText('Nome do plano'), 'Quando surgir uma situação fictícia');
    await user.type(within(dialog).getByLabelText('Pergunta 1'), 'O que aconteceu antes?');
    await user.click(within(dialog).getByRole('button', { name: 'Criar plano' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Plano criado.');
    expect(planWrites).toEqual([{ title: 'Quando surgir uma situação fictícia', questions: ['O que aconteceu antes?'] }]);
  });

  it('psiquiatra não recebe a ação de criar plano', async () => {
    therapistApi({ plans: [], kind: 'PSIQUIATRIA' });
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const tabs = await screen.findByRole('group', { name: 'Tipo de registro' });
    await waitFor(() => expect(within(tabs).getAllByRole('button')).toHaveLength(4));
    expect(tabs).toHaveClass('grid-cols-2');
    expect(screen.queryByRole('button', { name: 'Criar plano para Paula' })).not.toBeInTheDocument();
  });

  it('na aba, os registros só de leitura e o "Marcar como lido" do registro', async () => {
    const marks = therapistApi();
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}?aba=planos&semana=2026-09-21`);

    expect(await screen.findByText('Dia cansativo fictício')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Marcar como lido: Quando surgir vontade de rolar o celular' }));
    await waitFor(() => expect(marks).toEqual([{ items: [{ type: 'PLAN_ENTRY', id: ENTRY_ID }] }]));
  });

  it('no "Para ler", o registro vem com o nome do plano', async () => {
    therapistApi();
    renderRoute(`/pacientes/${PATIENT_ID}?aba=para-ler`);

    expect(await screen.findByText('Plano: Quando surgir vontade de rolar o celular')).toBeInTheDocument();
    expect(screen.getByText(/Meus Planos · /)).toBeInTheDocument();
  });
});
