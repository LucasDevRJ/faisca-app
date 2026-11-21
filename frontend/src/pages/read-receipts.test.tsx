import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListedPatient, PatientLink, PatientReadReceipts } from '../features/links/links-api';
import type { ReadReceipt } from '../features/read-receipts/use-read-receipts';
import type { ThoughtRecord } from '../features/thought-records/thought-records-api';
import { Providers } from '../app/providers';
import { PatientReadReceipts as PatientReadReceiptsPanel } from '../features/read-receipts/read-receipts-request';
import { renderRoute } from '../test/render';
import { fakeThoughtRecord, fakeUser, loggedIn, server } from '../test/server';

// "Lido" para o paciente (DEC-117, DEC-118). Dados fictícios (regra 5). "Hoje": quinta, 24/09/2026.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function link(readReceipts: PatientReadReceipts): PatientLink {
  return {
    id: '00000000-0000-4000-8000-0000000000c1',
    method: 'CODE',
    createdAt: '2026-09-01T15:00:00Z',
    seen: true,
    kind: 'PSICOLOGIA',
    sharedAreas: ['THOUGHT_RECORDS'],
    readReceipts,
    therapist: { name: 'Tereza Fictícia', email: 'tereza@faisca.test', avatarVersion: null, councilNumber: null },
  };
}

// O vínculo do paciente, guardando os pedidos enviados.
function linkApi(initial: PatientReadReceipts) {
  const writes: unknown[] = [];
  let current = link(initial);
  server.use(
    http.get('*/api/link', () => HttpResponse.json({ links: [current], link: current, invite: null, code: null })),
    http.put('*/api/link/:linkId/read-receipts', async ({ request }) => {
      const body = (await request.json()) as { requested: boolean };
      writes.push(body);
      current = { ...current, readReceipts: body.requested ? 'REQUESTED' : 'OFF' };
      return HttpResponse.json({ readReceipts: current.readReceipts });
    }),
  );
  return writes;
}

describe('paciente, em Conta', () => {
  beforeEach(() => {
    server.use(loggedIn);
  });

  it('liga o pedido por profissional; o texto diz "Pedido enviado" até ela ativar', async () => {
    const writes = linkApi('OFF');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRoute('/conta');

    const card = await screen.findByRole('article', { name: 'Tereza Fictícia' });
    // O nome da caixa é só a frase; a situação vem como descrição, sem repetir.
    const checkbox = within(card).getByRole('checkbox', { name: 'Quero ver quando Tereza ler os meus registros' });
    expect(checkbox).not.toBeChecked();
    expect(within(card).getByText(/Nunca aparece o que falta ler/)).toBeInTheDocument();

    await user.click(checkbox);

    await waitFor(() => expect(writes).toEqual([{ requested: true }]));
    expect(await within(card).findByText('Pedido enviado. Quando Tereza ativar, você passa a ver.')).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });

  it('ativo dos dois lados: diz que está ativo, e desligar manda o pedido desligado', async () => {
    const writes = linkApi('ON');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRoute('/conta');

    const card = await screen.findByRole('article', { name: 'Tereza Fictícia' });
    expect(within(card).getByText(/Ativo\. Nos seus registros, aparece a data em que Tereza leu/)).toBeInTheDocument();

    await user.click(within(card).getByRole('checkbox', { name: /Quero ver quando Tereza/ }));
    await waitFor(() => expect(writes).toEqual([{ requested: false }]));
  });

  it('sem o aceite do aviso novo, pede para ler e aceitar antes', async () => {
    linkApi('OFF');
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, privacyAreas: { ...fakeUser.privacyAreas, readReceipts: false } } }),
      ),
    );
    renderRoute('/conta');

    const card = await screen.findByRole('article', { name: 'Tereza Fictícia' });
    expect(within(card).getByRole('button', { name: /Ler e aceitar/ })).toBeInTheDocument();
    expect(within(card).queryByRole('checkbox', { name: /Quero ver quando Tereza/ })).not.toBeInTheDocument();
  });
});

describe('paciente, nos registros', () => {
  function thoughts(records: ThoughtRecord[], receipts: ReadReceipt[]) {
    const calls: string[] = [];
    server.use(
      loggedIn,
      http.get('*/api/thought-records', () => HttpResponse.json({ thoughtRecords: records })),
      http.get('*/api/read-receipts', () => {
        calls.push('read-receipts');
        return HttpResponse.json({ receipts });
      }),
    );
    return calls;
  }

  it('mostra quando cada profissional que ativou leu, e nada nos outros registros', async () => {
    const read = fakeThoughtRecord({ situation: 'Reunião lida' });
    const notRead = fakeThoughtRecord({ situation: 'Ainda sem leitura' });
    thoughts(
      [read, notRead],
      [
        { type: 'THOUGHT_RECORD', id: read.id, readAt: '2026-09-24T13:00:00Z', kind: 'PSIQUIATRIA' },
        { type: 'THOUGHT_RECORD', id: read.id, readAt: '2026-09-23T13:00:00Z', kind: 'PSICOLOGIA' },
      ],
    );
    renderRoute('/pensamentos');

    const readCard = (await screen.findByText('Reunião lida')).closest('article')!;
    expect(
      await within(readCard).findByText('Lido pela sua psicóloga em 23/09 e pela sua psiquiatra em 24/09'),
    ).toBeInTheDocument();
    const otherCard = screen.getByText('Ainda sem leitura').closest('article')!;
    // Nunca "não lido": sem leitura, o cartão não diz nada.
    expect(within(otherCard).queryByText(/^Lido /)).not.toBeInTheDocument();
    expect(within(otherCard).queryByText(/não lido/i)).not.toBeInTheDocument();
  });

  it('sem o aceite do aviso novo, nem pergunta à API', async () => {
    const calls = thoughts([fakeThoughtRecord({ situation: 'Um registro' })], []);
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, privacyAreas: { ...fakeUser.privacyAreas, readReceipts: false } } }),
      ),
    );
    renderRoute('/pensamentos');

    expect(await screen.findByText('Um registro')).toBeInTheDocument();
    expect(calls).toEqual([]);
  });
});

describe('profissional, em Meus pacientes', () => {
  const patient = (readReceipts: ListedPatient['readReceipts']): ListedPatient => ({
    id: '00000000-0000-4000-8000-00000000000a',
    name: 'Paula Fictícia',
    email: 'paula@faisca.test',
    linkedAt: '2026-09-28T15:00:00.000Z',
    avatarVersion: null,
    unreadCount: 0,
    readReceipts,
  });

  function patientsApi(initial: ListedPatient['readReceipts'], consented = true) {
    const writes: unknown[] = [];
    let current = patient(initial);
    const privacyAreas = { ...fakeUser.privacyAreas, readReceipts: consented };
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, privacyAreas, profiles: { patient: false, therapist: true } } }),
      ),
      http.get('*/api/links/patients', () => HttpResponse.json({ patients: [current] })),
      http.put('*/api/therapist/read-receipts/:patientId', async ({ request }) => {
        const body = (await request.json()) as { shared: boolean };
        writes.push(body);
        current = { ...current, readReceipts: body.shared ? 'ON' : 'NOT_NOW' };
        return HttpResponse.json({ readReceipts: current.readReceipts });
      }),
    );
    return writes;
  }

  it('o pedido aparece com "Ativar" e "Agora não", e some depois da resposta', async () => {
    const writes = patientsApi('PENDING');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRoute('/pacientes');

    const request = await screen.findByRole('region', { name: 'Paula gostaria de ver quando você lê os registros' });
    expect(within(request).getByText(/não fica sabendo se você escolher “Agora não”/)).toBeInTheDocument();

    await user.click(within(request).getByRole('button', { name: 'Ativar para Paula' }));

    await waitFor(() => expect(writes).toEqual([{ shared: true }]));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /Paula gostaria de ver/ })).not.toBeInTheDocument(),
    );
    // O foco não cai no começo da página: vai para a confirmação.
    const status = await screen.findByText(/^Ativado\. Paula passa a ver/);
    await waitFor(() => expect(status).toHaveFocus());
  });

  it('sem o aceite do aviso novo, pede para ler e aceitar no lugar dos botões', async () => {
    patientsApi('PENDING', false);
    renderRoute('/pacientes');

    const request = await screen.findByRole('region', { name: /Paula gostaria de ver/ });
    expect(within(request).getByRole('button', { name: /Ler e aceitar/ })).toBeInTheDocument();
    expect(within(request).queryByRole('button', { name: 'Ativar para Paula' })).not.toBeInTheDocument();
  });

  it('"Agora não" grava a resposta sem ativar', async () => {
    const writes = patientsApi('PENDING');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRoute('/pacientes');

    const request = await screen.findByRole('region', { name: /Paula gostaria de ver/ });
    await user.click(within(request).getByRole('button', { name: /Agora não/ }));

    await waitFor(() => expect(writes).toEqual([{ shared: false }]));
  });

  it('sem pedido, ou já respondido, não aparece nada', async () => {
    patientsApi('NOT_NOW');
    renderRoute('/pacientes');

    expect(await screen.findByText('Paula Fictícia')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /gostaria de ver/ })).not.toBeInTheDocument();
  });
});

describe('profissional, na página do paciente', () => {
  function renderPanel(readReceipts: ListedPatient['readReceipts']) {
    const writes: unknown[] = [];
    let current: ListedPatient = {
      id: '00000000-0000-4000-8000-00000000000a',
      name: 'Paula Fictícia',
      email: 'paula@faisca.test',
      linkedAt: '2026-09-28T15:00:00.000Z',
      avatarVersion: null,
      unreadCount: 0,
      readReceipts,
    };
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } }),
      ),
      http.get('*/api/links/patients', () => HttpResponse.json({ patients: [current] })),
      http.put('*/api/therapist/read-receipts/:patientId', async ({ request }) => {
        const body = (await request.json()) as { shared: boolean };
        writes.push(body);
        current = { ...current, readReceipts: body.shared ? 'ON' : 'NOT_NOW' };
        return HttpResponse.json({ readReceipts: current.readReceipts });
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <Providers queryClient={queryClient}>
        <PatientReadReceiptsPanel patientId={current.id} />
      </Providers>,
    );
    return writes;
  }

  it('ativo: diz que Paula vê, e "Parar de mostrar" desliga', async () => {
    const writes = renderPanel('ON');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    expect(await screen.findByText('Paula vê a data em que você marca um registro como lido.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Parar de mostrar para Paula' }));

    await waitFor(() => expect(writes).toEqual([{ shared: false }]));
  });

  it('depois do "Agora não", lembra o pedido e deixa ativar', async () => {
    const writes = renderPanel('NOT_NOW');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    expect(await screen.findByText(/Você escolheu “Agora não”/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ativar para Paula' }));

    await waitFor(() => expect(writes).toEqual([{ shared: true }]));
  });

  it('sem pedido, não mostra nada', async () => {
    renderPanel('OFF');
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());
    expect(screen.queryByText(/Paula/)).not.toBeInTheDocument();
  });
});
