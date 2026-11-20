import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckIn } from '../features/daily-check-ins/daily-check-ins-api';
import type { SharedArea } from '../features/links/links-api';
import type { Medication, Symptom } from '../features/medications/medications-api';
import { summaryBlocks } from '../features/summary/summary-format';
import type { PatientSummary } from '../features/therapist/therapist-api';
import { renderRoute } from '../test/render';
import { fakeAgenda, fakePeriodSummary, fakeUser, loggedIn, server } from '../test/server';

// Remédios e o que sinto (DEC-114, DEC-115). Dados fictícios (regra 5). "Hoje": quinta, 12/11/2026.
const TODAY = '2026-11-12';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T18:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function medication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    name: 'Remédio Fictício A',
    schedule: 'de manhã',
    dose: '100 mg',
    active: true,
    startedOn: '2026-09-20',
    stoppedOn: null,
    changes: [
      { id: '00000000-0000-4000-8000-0000000000c1', kind: 'COMECOU', changeDate: '2026-09-20', dose: '50 mg', note: null },
      {
        id: '00000000-0000-4000-8000-0000000000c2',
        kind: 'MUDOU_DOSE',
        changeDate: '2026-11-05',
        dose: '100 mg',
        note: 'Nota fictícia da mudança.',
      },
    ],
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-11-05T12:00:00.000Z',
    ...overrides,
  };
}

function symptom(overrides: Partial<Symptom> = {}): Symptom {
  return {
    id: '00000000-0000-4000-8000-0000000000b1',
    description: 'enjoo de manhã',
    startedOn: '2026-11-10',
    endedOn: null,
    medicationId: '00000000-0000-4000-8000-0000000000a1',
    note: null,
    sinceChange: { medicationId: '00000000-0000-4000-8000-0000000000a1', kind: 'MUDOU_DOSE', date: '2026-11-05', days: 5 },
    checks: [
      { date: '2026-11-10', intensity: 7 },
      { date: '2026-11-11', intensity: 5 },
    ],
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-11T12:00:00.000Z',
    ...overrides,
  };
}

const checkIn: CheckIn = {
  date: '2026-11-10',
  bedTime: '23:30',
  wakeTime: '07:00',
  sleepMinutes: 450,
  sleepQuality: 6,
  mood: 7,
  moodWord: null,
  medication: null,
  editable: true,
};

type Sent = { method: string; path: string; body: unknown };

// A API do paciente: devolve a lista e guarda o que foi enviado.
function patientApi(data: { medications?: Medication[]; symptoms?: Symptom[]; listsMedications?: boolean } = {}) {
  const sent: Sent[] = [];
  const record = async (request: Request) => {
    const body = request.method === 'DELETE' ? null : await request.json();
    sent.push({ method: request.method, path: new URL(request.url).pathname.replace(/^\/api/, ''), body });
    return body;
  };
  server.use(
    loggedIn,
    http.get('*/api/daily-check-ins', () => HttpResponse.json({ checkIns: [checkIn], tracksMedication: false })),
    http.get('*/api/medications', () =>
      HttpResponse.json({
        medications: data.medications ?? [],
        symptoms: data.symptoms ?? [],
        listsMedications: data.listsMedications ?? true,
      }),
    ),
    http.put('*/api/medications/settings', async ({ request }) => HttpResponse.json(await record(request))),
    http.post('*/api/medications', async ({ request }) => {
      await record(request);
      return HttpResponse.json({ medication: medication() }, { status: 201 });
    }),
    http.post('*/api/medications/:id/changes', async ({ request }) => {
      await record(request);
      return HttpResponse.json({ medication: medication() }, { status: 201 });
    }),
    http.post('*/api/symptoms', async ({ request }) => {
      await record(request);
      return HttpResponse.json({ symptom: symptom() }, { status: 201 });
    }),
    http.put('*/api/symptoms/:id/checks/:date', async ({ request }) => {
      await record(request);
      return HttpResponse.json({ symptom: symptom() });
    }),
    http.patch('*/api/symptoms/:id', async ({ request }) => {
      await record(request);
      return HttpResponse.json({ symptom: symptom() });
    }),
    http.patch('*/api/medications/:id', async ({ request }) => {
      await record(request);
      return HttpResponse.json({ medication: medication() });
    }),
    http.delete('*/api/medications/:id', async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return sent;
}

describe('paciente: Meus remédios e O que tenho sentido', () => {
  it('com a opção desligada, a seção não aparece', async () => {
    patientApi({ listsMedications: false });
    renderRoute('/sono-humor?semana=2026-11-09');

    expect(await screen.findByRole('heading', { name: 'Horas de sono e humor' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Meus remédios' })).not.toBeInTheDocument();
  });

  it('sem nada anotado, convida sem cobrar; anota um remédio com a data de início', async () => {
    const sent = patientApi();
    const user = userEvent.setup();
    renderRoute('/sono-humor?semana=2026-11-09');

    expect(
      await screen.findByText('Anote os remédios que você toma, com a dose e o horário, para levar à consulta.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Percebeu algo diferente no corpo ou no humor? Anote aqui, com a data, para conversar na consulta.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Anotar remédio' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anotar remédio' });
    expect(within(dialog).getByText('Mudanças no remédio, só com quem receitou.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Nome do remédio'), 'Remédio Fictício A');
    await user.type(within(dialog).getByLabelText('Dose (opcional)'), '50 mg');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Remédio anotado.')).toBeInTheDocument();
    expect(sent).toEqual([
      { method: 'POST', path: '/medications', body: { name: 'Remédio Fictício A', dose: '50 mg', schedule: null, startedOn: TODAY } },
    ]);
  });

  it('mostra o remédio, as mudanças e o que sente, com os dias desde a mudança e a evolução', async () => {
    patientApi({ medications: [medication()], symptoms: [symptom()] });
    renderRoute('/sono-humor?semana=2026-11-09');

    const card = (await screen.findByRole('heading', { name: 'Remédio Fictício A · 100 mg · de manhã' })).closest('li')!;
    expect(within(card).getByText('Em uso desde 20/09/2026')).toBeInTheDocument();
    expect(within(card).getByText('20/09/2026: começou, 50 mg')).toBeInTheDocument();
    expect(within(card).getByText('05/11/2026: mudou a dose para 100 mg')).toBeInTheDocument();
    expect(within(card).getByText('Nota fictícia da mudança.')).toBeInTheDocument();

    const felt = screen.getByRole('heading', { name: 'enjoo de manhã' }).closest('li')!;
    expect(within(felt).getByText('Desde 10/11/2026 · 5 dias depois de mudar a dose de Remédio Fictício A')).toBeInTheDocument();
    expect(within(felt).getByText('7 → 5')).toBeInTheDocument();
    // A mudança de 05/11 fica fora da semana mostrada: não vira linha no gráfico.
    expect(screen.queryByText('Mudanças no remédio')).not.toBeInTheDocument();
  });

  it('a mudança dentro do período vira uma linha no gráfico, com o texto na tabela dos números', async () => {
    const changes = medication().changes.map((change) =>
      change.kind === 'MUDOU_DOSE' ? { ...change, changeDate: '2026-11-11' } : change,
    );
    patientApi({ medications: [medication({ changes })] });
    renderRoute('/sono-humor?semana=2026-11-09');

    expect(await screen.findByText('11/11: Mudou a dose de Remédio Fictício A')).toBeInTheDocument();
    expect(screen.getByText(/A linha pontilhada marca uma mudança no remédio/)).toBeInTheDocument();
  });

  it('registrar mudança: a dose nova é pedida antes de enviar', async () => {
    const sent = patientApi({ medications: [medication()] });
    const user = userEvent.setup();
    renderRoute('/sono-humor?semana=2026-11-09');

    await user.click(await screen.findByRole('button', { name: /Registrar mudança/ }));
    const dialog = await screen.findByRole('dialog', { name: /Registrar mudança/ });
    expect(within(dialog).getByRole('radio', { name: 'Mudou a dose' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'Parei' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('Informe a dose nova.')).toBeInTheDocument();
    expect(sent).toEqual([]);

    await user.click(within(dialog).getByRole('radio', { name: 'Parei' }));
    expect(within(dialog).queryByLabelText(/Dose/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Mudança anotada.')).toBeInTheDocument();
    expect(sent[0]).toMatchObject({
      method: 'POST',
      path: '/medications/00000000-0000-4000-8000-0000000000a1/changes',
      body: { kind: 'PAROU', changeDate: TODAY, dose: null, note: null },
    });
  });

  it('remédio parado só pode voltar a ser tomado, e fica em "Remédios que já tomei"', async () => {
    patientApi({
      medications: [
        medication({
          active: false,
          dose: null,
          stoppedOn: '2026-10-20',
          changes: [
            { id: '00000000-0000-4000-8000-0000000000c1', kind: 'COMECOU', changeDate: '2026-09-20', dose: '50 mg', note: null },
            { id: '00000000-0000-4000-8000-0000000000c3', kind: 'PAROU', changeDate: '2026-10-20', dose: null, note: null },
          ],
        }),
      ],
    });
    const user = userEvent.setup();
    renderRoute('/sono-humor?semana=2026-11-09');

    await user.click(await screen.findByText(/Remédios que já tomei \(1\)/));
    expect(screen.getByText('Parou em 20/10/2026')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Registrar mudança/ }));
    const dialog = await screen.findByRole('dialog', { name: /Registrar mudança/ });
    expect(within(dialog).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent)).toEqual(['Voltei a tomar']);
  });

  it('anota o que sente, com o texto de cuidado, e o "como está agora"', async () => {
    const sent = patientApi({ medications: [medication()], symptoms: [symptom()] });
    const user = userEvent.setup();
    renderRoute('/sono-humor?semana=2026-11-09');

    await user.click(await screen.findByRole('button', { name: 'Anotar o que estou sentindo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anotar o que estou sentindo' });
    expect(within(dialog).getByText(/não avalia remédios nem sintomas.*ligue 192 \(SAMU\)/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('O que você tem sentido?'), 'boca seca');
    await user.selectOptions(
      within(dialog).getByLabelText('Começou depois de algum remédio ou mudança?'),
      'Remédio Fictício A',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Anotado.')).toBeInTheDocument();
    expect(sent[0]).toEqual({
      method: 'POST',
      path: '/symptoms',
      body: {
        description: 'boca seca',
        startedOn: TODAY,
        intensity: null,
        medicationId: '00000000-0000-4000-8000-0000000000a1',
        note: null,
      },
    });

    await user.click(screen.getByRole('button', { name: /Como está agora\?/ }));
    const check = await screen.findByRole('dialog', { name: /Como está agora\?/ });
    await user.click(within(check).getByRole('button', { name: 'Salvar' }));
    expect(await within(check).findByText('Escolha a intensidade.')).toBeInTheDocument();
  });

  it('sem o aceite da versão nova, a seção não aparece e Conta pede o aceite', async () => {
    patientApi();
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, privacyAreas: { ...fakeUser.privacyAreas, medications: false } } }),
      ),
    );
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Sono e humor' });
    expect(
      await within(section).findByText('Para anotar seus remédios e o que tem sentido, leia e aceite o aviso de privacidade atualizado.'),
    ).toBeInTheDocument();
    expect(within(section).queryByRole('checkbox', { name: /^Anotar meus remédios/ })).not.toBeInTheDocument();
  });

  it('Conta: liga a seção e explica que desligar só esconde', async () => {
    const sent = patientApi({ listsMedications: false });
    const user = userEvent.setup();
    renderRoute('/conta');

    const toggle = await screen.findByRole('checkbox', { name: /^Anotar meus remédios e o que sinto/ });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/Desligar só\s+esconde: o que você já anotou continua guardado/)).toBeInTheDocument();
    await user.click(toggle);
    expect(await screen.findByText('Os seus remédios e o que você sente vão aparecer na aba Sono e humor.')).toBeInTheDocument();
    expect(sent).toEqual([{ method: 'PUT', path: '/medications/settings', body: { listsMedications: true } }]);
  });
});

describe('paciente: editar, apagar e o cartão de hoje', () => {
  it('"Já passou" grava a data em que passou', async () => {
    const sent = patientApi({ medications: [medication()], symptoms: [symptom()] });
    const user = userEvent.setup();
    renderRoute('/sono-humor?semana=2026-11-09');

    await user.click(await screen.findByRole('button', { name: /Já passou/ }));
    const dialog = await screen.findByRole('dialog', { name: /Já passou\?/ });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Anotado que já passou.')).toBeInTheDocument();
    expect(sent).toEqual([
      { method: 'PATCH', path: '/symptoms/00000000-0000-4000-8000-0000000000b1', body: { endedOn: TODAY } },
    ]);
  });

  it('apagar um remédio pede confirmação e explica o que acontece com o que sentiu', async () => {
    const sent = patientApi({ medications: [medication()] });
    const user = userEvent.setup();
    renderRoute('/sono-humor?semana=2026-11-09');

    await user.click(await screen.findByRole('button', { name: /^Editar\s*Remédio Fictício A$/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar remédio' });
    await user.click(within(dialog).getByRole('button', { name: 'Apagar este remédio' }));
    const confirm = await screen.findByRole('dialog', { name: 'Apagar este remédio?' });
    expect(within(confirm).getByText(/continua, só sem a ligação com ele/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Apagar' }));
    expect(await screen.findByText('Remédio apagado.')).toBeInTheDocument();
    expect(sent).toEqual([{ method: 'DELETE', path: '/medications/00000000-0000-4000-8000-0000000000a1', body: null }]);
  });

  it('a única mudança do remédio não tem "Apagar"; as outras têm', async () => {
    const onlyStart = medication({
      id: '00000000-0000-4000-8000-0000000000a2',
      name: 'Remédio Fictício B',
      dose: '50 mg',
      changes: [medication().changes[0]!],
    });
    patientApi({ medications: [medication(), onlyStart] });
    const user = userEvent.setup();
    renderRoute('/sono-humor?semana=2026-11-09');

    const only = (await screen.findByRole('heading', { name: /Remédio Fictício B/ })).closest('li')!;
    await user.click(within(only).getByRole('button', { name: /Editar\s*a mudança de\s*20\/09/ }));
    let dialog = await screen.findByRole('dialog', { name: /Editar mudança/ });
    expect(within(dialog).queryByRole('button', { name: 'Apagar esta mudança' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    const two = screen.getByRole('heading', { name: /Remédio Fictício A/ }).closest('li')!;
    await user.click(within(two).getByRole('button', { name: /Editar\s*a mudança de\s*05\/11/ }));
    dialog = await screen.findByRole('dialog', { name: /Editar mudança/ });
    expect(within(dialog).getByRole('button', { name: 'Apagar esta mudança' })).toBeInTheDocument();
  });

  it('o cartão de hoje oferece "Anotar o que estou sentindo" com a opção ligada', async () => {
    const sent = patientApi({ medications: [medication()] });
    const user = userEvent.setup();
    renderRoute('/registros');

    const card = await screen.findByRole('region', { name: 'Sono e humor de hoje' });
    await user.click(await within(card).findByRole('button', { name: 'Anotar o que estou sentindo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anotar o que estou sentindo' });
    await user.type(within(dialog).getByLabelText('O que você tem sentido?'), 'tontura leve');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(card).findByText('Anotado.')).toBeInTheDocument();
    expect(sent[0]).toMatchObject({ method: 'POST', path: '/symptoms', body: { description: 'tontura leve' } });
  });

  it('com a opção desligada, o cartão de hoje não oferece anotar o que sente', async () => {
    patientApi({ listsMedications: false });
    renderRoute('/registros');

    const card = await screen.findByRole('region', { name: 'Sono e humor de hoje' });
    expect(await within(card).findByRole('link', { name: 'Ver os outros dias' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Anotar o que estou sentindo' })).not.toBeInTheDocument();
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

function professionalApi(sharedAreas: SharedArea[]) {
  const checkInsRequested: string[] = [];
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } })),
    http.get(BASE, () => HttpResponse.json(patientSummary(sharedAreas))),
    http.get(`${BASE}/appointments`, () => HttpResponse.json(fakeAgenda())),
    http.get(`${BASE}/activities`, () => HttpResponse.json({ activities: [] })),
    http.get(`${BASE}/daily-check-ins`, ({ request }) => {
      checkInsRequested.push(request.url);
      return HttpResponse.json({ checkIns: [checkIn] });
    }),
    http.get(`${BASE}/medications`, () => HttpResponse.json({ medications: [medication()], symptoms: [symptom()] })),
  );
  return checkInsRequested;
}

describe('profissional: Remédios e o que sente', () => {
  it('só com a caixa Remédios e o que sinto, a aba mostra os remédios só para leitura, sem pedir o sono', async () => {
    const checkInsRequested = professionalApi(['MEDICATIONS']);
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const tabs = await screen.findByRole('group', { name: 'Tipo de registro' });
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual(['Sono e humor']);
    await user.click(within(tabs).getByRole('button', { name: 'Sono e humor' }));

    expect(await screen.findByRole('heading', { name: 'Remédios e o que sente' })).toBeInTheDocument();
    expect(screen.getByText('Anotações de Paula, sem avaliação do Faísca.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Remédio Fictício A · 100 mg · de manhã' })).toBeInTheDocument();
    expect(screen.getByText('Desde 10/11/2026 · 5 dias depois de mudar a dose de Remédio Fictício A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar mudança|Editar|Como está agora|Já passou/ })).not.toBeInTheDocument();
    expect(checkInsRequested).toEqual([]);
  });

  it('sem o aceite dela da versão nova, pede o aceite no lugar dos remédios', async () => {
    professionalApi(['MEDICATIONS']);
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: {
            ...fakeUser,
            profiles: { patient: false, therapist: true },
            privacyAreas: { ...fakeUser.privacyAreas, medications: false },
          },
        }),
      ),
    );
    renderRoute(`/pacientes/${PATIENT_ID}?aba=sono-humor`);

    expect(await screen.findByRole('heading', { name: 'Remédios e o que sente' })).toBeInTheDocument();
    expect(await screen.findByText(/Para ver os remédios e o que seus pacientes têm sentido/)).toBeInTheDocument();
    expect(screen.queryByText('Remédio Fictício A · 100 mg · de manhã')).not.toBeInTheDocument();
  });

  it('sem nada anotado, diz isso sem cobrar', async () => {
    professionalApi(['MEDICATIONS']);
    server.use(http.get(`${BASE}/medications`, () => HttpResponse.json({ medications: [], symptoms: [] })));
    renderRoute(`/pacientes/${PATIENT_ID}?aba=sono-humor`);

    expect(await screen.findByText('Paula não anotou remédios nem o que tem sentido.')).toBeInTheDocument();
  });

  it('com as duas caixas, a mudança vira uma linha no gráfico do sono e humor', async () => {
    professionalApi(['SLEEP_MOOD', 'MEDICATIONS']);
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}?aba=sono-humor`);

    const tabs = await screen.findByRole('group', { name: 'Tipo de registro' });
    await user.click(within(tabs).getByRole('button', { name: 'Sono e humor' }));
    expect(await screen.findByText('05/11: Mudou a dose de Remédio Fictício A')).toBeInTheDocument();
  });
});

describe('resumo do período', () => {
  it('só números e datas, sem o nome do remédio nem o texto do sintoma', () => {
    const blocks = summaryBlocks(
      fakePeriodSummary({
        medications: {
          current: {
            activeMedications: 1,
            changes: [{ date: '2026-11-05', kind: 'MUDOU_DOSE' }],
            newSymptoms: 1,
            endedSymptoms: 0,
            maxIntensity: 6,
          },
          previous: { activeMedications: 1, changes: [], newSymptoms: 0, endedSymptoms: 0, maxIntensity: null },
        },
      }),
    );
    expect(blocks.find((block) => block.area === 'medications')).toEqual({
      area: 'medications',
      title: 'Remédios e o que sinto',
      lines: [
        'Remédios em uso no fim do período: 1',
        'Mudanças: 05/11, mudou a dose',
        'Sintomas novos: 1 · que passaram: 0',
        'Maior intensidade anotada: 6 de 10',
      ],
    });
  });
});
