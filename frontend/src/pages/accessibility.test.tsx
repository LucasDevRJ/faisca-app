import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ACCESSIBILITY, type AccessibilitySettings } from '../features/profile/accessibility';
import { renderRoute } from '../test/render';
import { fakeActivity, fakeAgenda, fakeSession, fakeThoughtRecord, fakeUser, loggedIn, server } from '../test/server';

// "Acessibilidade" em Conta e efeito dos 5 ajustes nas telas (DEC-076, DEC-087). Dados fictícios (regra 5).
beforeEach(() => {
  server.use(
    loggedIn,
    http.get('*/api/link', () => HttpResponse.json({ links: [], link: null, invite: null, code: null })),
  );
});

afterEach(() => {
  delete document.documentElement.dataset.comfortableReading;
  delete document.documentElement.dataset.reducedMotion;
  localStorage.clear();
});

function withAccessibility(overrides: Partial<AccessibilitySettings>) {
  const accessibility: AccessibilitySettings = { ...DEFAULT_ACCESSIBILITY, ...overrides };
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, accessibility } })),
    http.get('*/api/profile', () =>
      HttpResponse.json({
        profile: { fullName: null, palette: 'SALVIA', avatarVersion: null, accessibility },
      }),
    ),
  );
  return accessibility;
}

describe('/conta: Acessibilidade', () => {
  it('mostra os cinco ajustes desligados por padrão, com descrição acessível no grupo', async () => {
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Acessibilidade' });
    const group = await within(section).findByRole('group', { name: 'Ajustes de acessibilidade' });
    expect(group).toHaveAccessibleDescription(/Valem neste aparelho e nos outros/);

    const checkboxes = within(group).getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(5);
    for (const checkbox of checkboxes) {
      expect(checkbox).not.toBeChecked();
    }
    expect(within(group).getByRole('checkbox', { name: /Linguagem direta/ })).toBeInTheDocument();
    expect(within(group).getByRole('checkbox', { name: /Uma coisa por vez/ })).toBeInTheDocument();
    expect(within(group).getByRole('checkbox', { name: /Leitura confortável/ })).toBeInTheDocument();
    expect(within(group).getByRole('checkbox', { name: /Sem pressão de tempo/ })).toBeInTheDocument();
    expect(within(group).getByRole('checkbox', { name: /Menos movimento/ })).toBeInTheDocument();
  });

  it('aplica prévia de leitura confortável e menos movimento na hora e grava na conta ao salvar', async () => {
    const patches: unknown[] = [];
    server.use(
      http.patch('*/api/profile', async ({ request }) => {
        const body = (await request.json()) as { accessibility?: Partial<AccessibilitySettings> };
        patches.push(body);
        return HttpResponse.json({
          profile: {
            fullName: null,
            palette: 'SALVIA',
            avatarVersion: null,
            accessibility: { ...DEFAULT_ACCESSIBILITY, ...body.accessibility },
          },
        });
      }),
    );

    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Acessibilidade' });
    await user.click(await within(section).findByRole('checkbox', { name: /Leitura confortável/ }));
    await user.click(within(section).getByRole('checkbox', { name: /Menos movimento/ }));

    expect(document.documentElement.dataset.comfortableReading).toBe('true');
    expect(document.documentElement.dataset.reducedMotion).toBe('true');
    expect(localStorage.getItem('faisca:comfortable-reading')).toBeNull();
    expect(localStorage.getItem('faisca:reduced-motion')).toBeNull();

    await user.click(within(section).getByRole('button', { name: 'Salvar acessibilidade' }));

    await waitFor(() =>
      expect(patches).toEqual([
        {
          accessibility: {
            ...DEFAULT_ACCESSIBILITY,
            comfortableReading: true,
            reducedMotion: true,
          },
        },
      ]),
    );
    await waitFor(() =>
      expect(within(section).getByRole('status')).toHaveTextContent('Pronto, ajustes salvos.'),
    );
    expect(localStorage.getItem('faisca:comfortable-reading')).toBe('true');
    expect(localStorage.getItem('faisca:reduced-motion')).toBe('true');
  });

  it('sair de Conta sem salvar desfaz a prévia de leitura confortável e menos movimento', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Acessibilidade' });
    await user.click(await within(section).findByRole('checkbox', { name: /Leitura confortável/ }));
    expect(document.documentElement.dataset.comfortableReading).toBe('true');

    await router.navigate('/novidades');
    await waitFor(() => expect(document.documentElement.dataset.comfortableReading).toBeUndefined());
  });

  it('aplica leitura confortável e menos movimento da sessão ao abrir qualquer tela', async () => {
    withAccessibility({ comfortableReading: true, reducedMotion: true });
    renderRoute('/novidades');

    await waitFor(() => expect(document.documentElement.dataset.comfortableReading).toBe('true'));
    expect(document.documentElement.dataset.reducedMotion).toBe('true');
    expect(localStorage.getItem('faisca:comfortable-reading')).toBe('true');
    expect(localStorage.getItem('faisca:reduced-motion')).toBe('true');
  });
});

describe('Efeitos dos ajustes de acessibilidade nas telas', () => {
  it('Linguagem direta troca expressões figuradas por textos literais em atividades e pensamentos', async () => {
    withAccessibility({ directLanguage: true });
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    server.use(
      http.get('*/api/activities', () =>
        HttpResponse.json({
          activities: [fakeActivity({ name: 'Leitura fictícia', activityDate: today, status: 'PLANEJADA' })],
        }),
      ),
    );

    const user = userEvent.setup();
    const { router } = renderRoute('/registros');

    expect(await screen.findByRole('button', { name: 'Avaliar atividade' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conta como foi?' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Não aconteceu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar que não realizou' });
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await router.navigate('/pensamentos');
    expect(
      await screen.findByText(/Quando uma situação causar emoção ou pensamento forte/),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Use "Novo registro" para anotar uma situação\./)).toBeInTheDocument();
  });

  it('Sem pressão de tempo esconde contagem regressiva do ciclo, distância em dias e prazo de alternativa', async () => {
    withAccessibility({ noTimePressure: true });
    const nextSession = fakeSession('2026-09-28', { time: '14:00' });
    const lastSession = fakeSession('2026-09-21', { time: '14:00' });
    server.use(
      http.get('*/api/appointments', () =>
        HttpResponse.json(
          fakeAgenda({
            status: 'ATIVA',
            schedule: { startDate: '2026-09-07', time: '14:00', frequency: 'SEMANAL' },
            upcoming: [nextSession],
            sessions: [lastSession, nextSession],
            last: lastSession,
            next: nextSession,
          }),
        ),
      ),
      http.get('*/api/appointments/cycle', () =>
        HttpResponse.json({
          today: '2026-09-24',
          cycle: {
            from: '2026-09-22',
            to: '2026-09-28',
            session: { date: '2026-09-28', time: '14:00' },
            previous: null,
            next: null,
            truncated: false,
          },
        }),
      ),
      http.get('*/api/thought-records', () =>
        HttpResponse.json({
          thoughtRecords: [
            fakeThoughtRecord({
              situationDate: '2026-09-22',
              editable: false,
              canAddAlternative: true,
              alternativeDeadline: { date: '2026-09-28', time: '14:00' },
            }),
          ],
        }),
      ),
    );

    renderRoute('/pensamentos');

    expect(await screen.findByRole('heading', { name: 'Consulta de 28/09' })).toBeInTheDocument();
    expect(screen.queryByText(/Sua consulta é/)).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Adicionar explicação alternativa' })).toBeInTheDocument();
    expect(screen.queryByText(/até seg, 28\/09/)).not.toBeInTheDocument();
  });

  it('Uma coisa por vez divide o formulário de Pensamentos em 5 passos e valida antes de avançar', async () => {
    withAccessibility({ oneThingAtATime: true });
    const created: unknown[] = [];
    server.use(
      http.post('*/api/thought-records', async ({ request }) => {
        const body = await request.json();
        created.push(body);
        return HttpResponse.json({ thoughtRecord: fakeThoughtRecord() }, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderRoute('/pensamentos/novo?dia=2026-09-24');

    expect(await screen.findByText('Passo 1 de 5')).toBeInTheDocument();
    expect(screen.getByLabelText('Situação')).toBeInTheDocument();
    expect(screen.queryByLabelText('Pensamento automático')).not.toBeInTheDocument();

    // Tenta avançar sem preencher a situação: continua no passo 1 com o erro.
    await user.click(screen.getByRole('button', { name: 'Próximo ›' }));
    expect(screen.getByText('Conte qual foi a situação.')).toBeInTheDocument();
    expect(screen.getByText('Passo 1 de 5')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Situação'), 'Reunião fictícia no trabalho');
    await user.click(screen.getByRole('button', { name: 'Próximo ›' }));

    // Passo 2: pensamento automático e crença.
    expect(screen.getByText('Passo 2 de 5')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Pensamento automático'), 'Vou errar tudo');
    fireEvent.change(screen.getByRole('slider', { name: 'O quanto acredito nesse pensamento' }), {
      target: { value: '7' },
    });
    await user.click(screen.getByRole('button', { name: 'Próximo ›' }));

    // Passo 3: emoções.
    expect(screen.getByText('Passo 3 de 5')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Ansiedade' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Intensidade: ansiedade' }), {
      target: { value: '8' },
    });
    await user.click(screen.getByRole('button', { name: 'Próximo ›' }));

    // Passo 4: comportamento e consequência.
    expect(screen.getByText('Passo 4 de 5')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Comportamento'), 'Fiquei calada');
    await user.type(screen.getByLabelText('Consequência'), 'Saí cansada');
    await user.click(screen.getByRole('button', { name: 'Próximo ›' }));

    // Passo 5: explicação alternativa (opcional) e botão de salvar.
    expect(screen.getByText('Passo 5 de 5')).toBeInTheDocument();
    expect(screen.getByLabelText('Explicação alternativa')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar registro' }));

    await waitFor(() => expect(created).toHaveLength(1));
  });

  it('Uma coisa por vez divide o formulário de Tensão em 3 passos e o de Ação em 2 ou 3 passos', async () => {
    withAccessibility({ oneThingAtATime: true });
    const user = userEvent.setup();
    const { router } = renderRoute('/tensao/novo?dia=2026-09-24');

    expect(await screen.findByText('Passo 1 de 3')).toBeInTheDocument();
    expect(screen.getByLabelText('O que estava acontecendo?')).toBeInTheDocument();
    expect(screen.queryByText('Tensão no corpo')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('O que estava acontecendo?'), 'Situação fictícia');
    await user.click(screen.getByRole('button', { name: 'Próximo ›' }));
    expect(screen.getByText('Passo 2 de 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '‹ Anterior' }));
    expect(screen.getByText('Passo 1 de 3')).toBeInTheDocument();

    await router.navigate('/acao/nova?dia=2026-09-24');
    expect(await screen.findByText('Passo 1 de 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Já fiz' }));
    expect(screen.getByText('Passo 1 de 3')).toBeInTheDocument();
  });
});
