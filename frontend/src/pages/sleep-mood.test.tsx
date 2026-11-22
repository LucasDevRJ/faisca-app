import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckIn } from '../features/daily-check-ins/daily-check-ins-api';
import { SHARED_AREAS, type SharedArea } from '../features/links/links-api';
import { summaryBlocks } from '../features/summary/summary-format';
import type { PatientSummary } from '../features/therapist/therapist-api';
import { renderRoute } from '../test/render';
import { fakeAgenda, fakePeriodSummary, fakeUser, loggedIn, server } from '../test/server';

// Sono, humor e remédio (DEC-107, DEC-108). Dados fictícios (regra 5). "Hoje": quinta, 12/11/2026.
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

function checkIn(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    date: TODAY,
    bedTime: '23:30',
    wakeTime: '07:00',
    sleepMinutes: 450,
    sleepQuality: 6,
    mood: 7,
    moodWord: 'tranquila',
    medication: 'TOMOU',
    editable: true,
    ...overrides,
  };
}

// A API do paciente: devolve os dias pedidos e guarda o que foi gravado.
function patientApi(checkIns: CheckIn[], tracksMedication = false) {
  const saved: { date: string; body: unknown }[] = [];
  const settings: unknown[] = [];
  server.use(
    loggedIn,
    http.get('*/api/daily-check-ins', () => HttpResponse.json({ checkIns, tracksMedication })),
    http.put('*/api/daily-check-ins/settings', async ({ request }) => {
      const body = (await request.json()) as { tracksMedication: boolean };
      settings.push(body);
      return HttpResponse.json(body);
    }),
    http.put('*/api/daily-check-ins/:date', async ({ request, params }) => {
      const body = await request.json();
      saved.push({ date: String(params.date), body });
      return HttpResponse.json({ checkIn: checkIn({ ...(body as object), date: String(params.date) }) });
    }),
  );
  return { saved, settings };
}

describe('cartão de hoje em Meus registros', () => {
  it('sem registro, convida sem cobrar; registra o sono e o humor, sem a pergunta do remédio', async () => {
    const { saved } = patientApi([]);
    const user = userEvent.setup();
    renderRoute('/registros');

    const card = await screen.findByRole('region', { name: 'Sono e humor de hoje' });
    expect(
      await within(card).findByText('Quer registrar como dormiu e como está o dia? Leva menos de um minuto.'),
    ).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: /Registrar/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Sono e humor de quinta-feira, 12/11' });
    expect(within(dialog).getByText('Tudo bem preencher só uma parte.')).toBeInTheDocument();
    // A pergunta do remédio só aparece para quem a liga em Conta.
    expect(within(dialog).queryByRole('group', { name: 'Tomou o remédio como combinado?' })).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Que horas você deitou?'), '23:30');
    await user.type(within(dialog).getByLabelText('Que horas acordou?'), '07:00');
    expect(within(dialog).getByText('Dá 7h30 de sono.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Uma palavra ou frase para o dia (opcional)'), 'tranquila');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Registro do dia salvo.')).toBeInTheDocument();
    expect(saved).toEqual([
      {
        date: TODAY,
        body: {
          bedTime: '23:30',
          wakeTime: '07:00',
          sleepQuality: null,
          mood: null,
          moodWord: 'tranquila',
          medication: null,
        },
      },
    ]);
  });

  it('valida antes de enviar: só um horário, ou nada preenchido', async () => {
    const { saved } = patientApi([]);
    const user = userEvent.setup();
    renderRoute('/registros');

    const card = await screen.findByRole('region', { name: 'Sono e humor de hoje' });
    await user.click(within(card).getByRole('button', { name: /Registrar/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(within(dialog).getByText('Preencha ao menos uma resposta.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Que horas você deitou?'), '23:30');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(within(dialog).getByText('Informe a hora em que deitou e a hora em que acordou.')).toBeInTheDocument();
    expect(saved).toEqual([]);
  });

  it('com o registro de hoje, mostra o resumo; com a pergunta ligada, o remédio aparece', async () => {
    const { saved } = patientApi([checkIn()], true);
    const user = userEvent.setup();
    renderRoute('/registros');

    const card = await screen.findByRole('region', { name: 'Sono e humor de hoje' });
    expect(
      await within(card).findByText('Dormiu 7h30 · sono 6 · humor 7 · remédio: como combinado'),
    ).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: /Editar/ }));

    const dialog = await screen.findByRole('dialog');
    const medication = within(dialog).getByRole('group', { name: 'Tomou o remédio como combinado?' });
    expect(within(medication).getByRole('radio', { name: 'Sim' })).toBeChecked();
    expect(within(dialog).getByText('Mudanças no remédio, só com quem receitou.')).toBeInTheDocument();
    await user.click(within(medication).getByRole('radio', { name: 'Esqueci algum' }));
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await screen.findByText('Registro do dia salvo.');
    expect(saved[0]?.body).toMatchObject({ medication: 'ESQUECEU_ALGUM', mood: 7 });
  });
});

describe('aba Sono e humor', () => {
  it('sem o aceite da versão nova, pede o aceite', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, privacyAreas: { ...fakeUser.privacyAreas, sleepMood: false, medication: false } } }),
      ),
    );
    renderRoute('/sono-humor?semana=2026-11-09');

    expect(await screen.findByRole('heading', { name: 'Antes de começar' })).toBeInTheDocument();
    expect(screen.getByText(/para incluir o Sono e humor/)).toBeInTheDocument();
  });

  it('mostra o gráfico e os dias; só os últimos 7 dias aceitam registro', async () => {
    patientApi([
      checkIn({ date: '2026-11-04', editable: false, mood: 3, moodWord: null, medication: null }),
      checkIn({ date: '2026-11-10', mood: 5, moodWord: null, medication: 'NAO_TOMOU' }),
    ]);
    renderRoute('/sono-humor?semana=2026-11-02');

    expect(await screen.findByRole('heading', { name: 'Horas de sono e humor' })).toBeInTheDocument();
    // 04/11 é antigo: aparece, mas sem botão. 06/11 em diante ainda aceita registro.
    const old = screen.getByRole('heading', { name: /04\/11/ }).closest('li')!;
    expect(within(old).getByText('Dormiu 7h30 · sono 6 · humor 3')).toBeInTheDocument();
    expect(within(old).queryByRole('button')).not.toBeInTheDocument();
    const recent = screen.getByRole('heading', { name: /08\/11/ }).closest('li')!;
    expect(within(recent).getByText('Sem registro.')).toBeInTheDocument();
    expect(within(recent).getByRole('button', { name: /Registrar/ })).toBeInTheDocument();
    // O dia de antes da janela, sem registro, nem aparece.
    expect(screen.queryByRole('heading', { name: /05\/11/ })).not.toBeInTheDocument();
  });
});

describe('Conta: pergunta do remédio', () => {
  it('liga a pergunta e explica que desligar só esconde', async () => {
    const { settings } = patientApi([]);
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Sono e humor' });
    const toggle = await within(section).findByRole('checkbox', { name: /Registrar se tomei o remédio/ });
    expect(toggle).not.toBeChecked();
    expect(within(section).getByText(/Desligar só esconde a pergunta/)).toBeInTheDocument();
    await user.click(toggle);
    expect(await within(section).findByText('A pergunta do remédio vai aparecer no registro do dia.')).toBeInTheDocument();
    expect(settings).toEqual([{ tracksMedication: true }]);
  });
});

const PATIENT_ID = '00000000-0000-4000-8000-00000000000a';
const BASE = `*/api/therapist/patients/${PATIENT_ID}`;

function patientSummary(sharedAreas: SharedArea[]): PatientSummary {
  return {
    patient: { id: PATIENT_ID, name: 'Paula Fictícia', email: 'paula@faisca.test', linkedAt: '2026-09-01T15:00:00.000Z', avatarVersion: null },
    today: TODAY,
    lastAppointment: null,
    nextAppointment: null,
    agendaStatus: null,
    pause: null,
    highlight: { from: '2026-11-06', to: TODAY, reason: 'LAST_7_DAYS' },
    access: { kind: 'PSIQUIATRIA', sharedAreas },
  };
}

function professionalApi(sharedAreas: SharedArea[], checkIns: CheckIn[]) {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } })),
    http.get(BASE, () => HttpResponse.json(patientSummary(sharedAreas))),
    http.get(`${BASE}/appointments`, () => HttpResponse.json(fakeAgenda())),
    http.get(`${BASE}/activities`, () => HttpResponse.json({ activities: [] })),
    http.get(`${BASE}/daily-check-ins`, () => HttpResponse.json({ checkIns })),
  );
}

describe('profissional: aba Sono e humor', () => {
  it('só com a caixa Remédio, a aba aparece e mostra o remédio em terceira pessoa', async () => {
    professionalApi(['MEDICATION'], [
      checkIn({ bedTime: null, wakeTime: null, sleepMinutes: null, sleepQuality: null, mood: null, moodWord: null, medication: 'ESQUECEU_ALGUM', editable: false }),
    ]);
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const tabs = await screen.findByRole('group', { name: 'Tipo de registro' });
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual(['Sono e humor']);
    await user.click(within(tabs).getByRole('button', { name: 'Sono e humor' }));
    expect(await screen.findByText('Remédio: esqueceu algum')).toBeInTheDocument();
    // Nada de editar do lado dela.
    expect(screen.queryByRole('button', { name: /Registrar|Editar/ })).not.toBeInTheDocument();
  });

  it('sem nenhuma das duas caixas, não há aba', async () => {
    professionalApi(['ACTIVITIES'], []);
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const tabs = await screen.findByRole('group', { name: 'Tipo de registro' });
    expect(within(tabs).queryByRole('button', { name: 'Sono e humor' })).not.toBeInTheDocument();
  });
});

describe('resumo: sono, humor e remédio', () => {
  it('seguem os textos aprovados, sem a palavra do dia', () => {
    const blocks = summaryBlocks(
      fakePeriodSummary({
        sleepMood: {
          current: {
            nights: 41,
            avgSleepMinutes: 410,
            avgSleepQuality: 6.2,
            moodDays: 44,
            avgMood: 6,
            minMood: 2,
            maxMood: 9,
            series: [],
          },
          previous: {
            nights: 30,
            avgSleepMinutes: 370,
            avgSleepQuality: 5.4,
            moodDays: 30,
            avgMood: 5.1,
            minMood: 1,
            maxMood: 8,
            series: [],
          },
        },
        medication: {
          current: { days: 40, taken: 36, forgotSome: 3, notTaken: 1 },
          previous: { days: 0, taken: 0, forgotSome: 0, notTaken: 0 },
        },
      }),
    );
    expect(blocks).toEqual([
      {
        area: 'sleepMood',
        title: 'Sono e humor',
        lines: [
          'Sono: 41 noites registradas · 6h50 em média (antes: 6h10) · nota do sono 6,2 (antes: 5,4)',
          'Humor: 44 dias registrados · média 6,0 (antes: 5,1) · a menor: 2 · a maior: 9',
        ],
      },
      {
        area: 'medication',
        title: 'Remédio',
        lines: ['Nos 40 dias registrados: como combinado 36 · esqueceu algum 3 · não tomou 1'],
      },
    ]);
  });
});

// Usado para conferir que as áreas novas estão na lista de caixas do vínculo.
it('as duas caixas novas estão na lista do vínculo', () => {
  expect(SHARED_AREAS).toEqual(expect.arrayContaining(['SLEEP_MOOD', 'MEDICATION']));
});
