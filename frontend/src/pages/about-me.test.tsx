import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AboutMe } from '../features/about-me/about-me-api';
import type { UnreadResponse } from '../features/therapist/read-marks-api';
import type { PatientSummary } from '../features/therapist/therapist-api';
import { renderRoute } from '../test/render';
import { fakeAgenda, fakeUser, loggedIn, server } from '../test/server';
import { SHARED_AREAS } from '../features/links/links-api';

// "Sobre mim" (DEC-081, DEC-082). Dados fictícios (regra 5).
const PATIENT_ID = '00000000-0000-4000-8000-00000000000a';
const BASE = `*/api/therapist/patients/${PATIENT_ID}`;
const about: AboutMe = {
  id: '00000000-0000-4000-c000-000000000001',
  aboutMe: 'Gosto de caminhar de manhã.',
  goals: 'Ansiedade',
  habits: null,
  updatedAt: '2026-09-23T15:00:00.000Z',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('Conta → Sobre mim (paciente)', () => {
  beforeEach(() => {
    server.use(loggedIn);
  });

  function aboutApi(initial: AboutMe | null = null) {
    const saved: unknown[] = [];
    server.use(
      http.get('*/api/about-me', () => HttpResponse.json({ aboutMe: initial })),
      http.put('*/api/about-me', async ({ request }) => {
        const body = (await request.json()) as Record<string, string | null>;
        saved.push(body);
        const empty = !body.aboutMe && !body.goals && !body.habits;
        return HttpResponse.json({ aboutMe: empty ? null : { ...about, ...body } });
      }),
    );
    return saved;
  }

  it('três campos opcionais com o aviso de que a psicóloga lê; salva os três de uma vez', async () => {
    const saved = aboutApi();
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Sobre mim' });
    await user.type(await within(section).findByRole('textbox', { name: 'Sobre mim' }), 'Gosto de caminhar.');
    expect(section).toHaveTextContent('a sua psicóloga lê o que você escrever aqui');
    await user.type(within(section).getByRole('textbox', { name: 'Hábitos que quero deixar (ou já deixei)' }), '  ');
    await user.click(within(section).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(saved).toEqual([{ aboutMe: 'Gosto de caminhar.', goals: null, habits: null }]));
    expect(await within(section).findByRole('status')).toHaveTextContent('Pronto, salvo.');
  });

  it('as sugestões inserem texto editável no campo e somem quando já estão lá', async () => {
    aboutApi();
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Sobre mim' });
    const goals = await within(section).findByRole('textbox', { name: 'O que eu gostaria de trabalhar' });
    const suggestions = within(section).getByRole('group', { name: 'Sugestões para o que gostaria de trabalhar' });

    await user.click(within(suggestions).getByRole('button', { name: 'Inserir: Ansiedade' }));
    await user.click(within(suggestions).getByRole('button', { name: 'Inserir: Sono' }));
    expect(goals).toHaveValue('Ansiedade, Sono');
    expect(within(suggestions).queryByRole('button', { name: 'Inserir: Ansiedade' })).not.toBeInTheDocument();

    await user.type(goals, ' e cansaço');
    expect(goals).toHaveValue('Ansiedade, Sono e cansaço');
  });

  it('depois de inserir, o foco vai para a próxima sugestão; palavra parecida não esconde a sugestão', async () => {
    aboutApi();
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Sobre mim' });
    const goals = await within(section).findByRole('textbox', { name: 'O que eu gostaria de trabalhar' });
    const suggestions = within(section).getByRole('group', { name: 'Sugestões para o que gostaria de trabalhar' });

    await user.click(within(suggestions).getByRole('button', { name: 'Inserir: Ansiedade' }));
    await waitFor(() =>
      expect(within(suggestions).getByRole('button', { name: 'Inserir: Tristeza ou desânimo' })).toHaveFocus(),
    );
    expect(within(section).getByText('Inserido: Ansiedade.')).toBeInTheDocument();

    await user.clear(goals);
    await user.type(goals, 'sonolência');
    expect(within(suggestions).getByRole('button', { name: 'Inserir: Sono' })).toBeInTheDocument();
  });

  it('acima de 2000 caracteres: aviso no campo, sem enviar', async () => {
    const saved = aboutApi();
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Sobre mim' });
    const field = await within(section).findByRole('textbox', { name: 'Sobre mim' });
    await user.click(field);
    await user.paste('a'.repeat(2001));
    await user.click(within(section).getByRole('button', { name: 'Salvar' }));

    expect(within(section).getByText('Este campo pode ter até 2000 caracteres.')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(saved).toEqual([]);
  });

  it('"Abrir o Sobre mim" (card de Novidades) leva até a seção, com o foco no título', async () => {
    aboutApi();
    renderRoute('/conta#sobre-mim');

    const title = await screen.findByRole('heading', { level: 2, name: 'Sobre mim' });
    await waitFor(() => expect(title).toHaveFocus());
  });

  it('abre com o que já foi salvo; apagar tudo e salvar avisa que ficou vazio', async () => {
    const saved = aboutApi(about);
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Sobre mim' });
    const first = await within(section).findByRole('textbox', { name: 'Sobre mim' });
    expect(first).toHaveValue('Gosto de caminhar de manhã.');
    await user.clear(first);
    await user.clear(within(section).getByRole('textbox', { name: 'O que eu gostaria de trabalhar' }));
    await user.click(within(section).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(saved).toEqual([{ aboutMe: null, goals: null, habits: null }]));
    expect(await within(section).findByRole('status')).toHaveTextContent('Pronto, o "Sobre mim" ficou vazio.');
  });

  it('sem o aceite da versão nova: o pedido de aceite, sem buscar', async () => {
    let asked = false;
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, privacyUpToDate: false, privacyAreas: { ...fakeUser.privacyAreas, aboutMe: false } } }),
      ),
      http.get('*/api/about-me', () => {
        asked = true;
        return HttpResponse.json({ aboutMe: null });
      }),
    );
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Sobre mim' });
    expect(await within(section).findByText(/Para contar sobre você no “Sobre mim”/)).toBeInTheDocument();
    expect(asked).toBe(false);
  });

  it('o card de Novidades do "Sobre mim" é só de paciente', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: { ...fakeUser, profiles: { patient: false, therapist: true }, pendingAnnouncement: '2026-11-sobre-mim' },
        }),
      ),
    );
    renderRoute('/conta');

    expect(await screen.findByRole('heading', { level: 1, name: 'Conta' })).toBeInTheDocument();
    expect(screen.queryByText('Novidade: o “Sobre mim”')).not.toBeInTheDocument();
  });

  it('quem é só terapeuta não vê o "Sobre mim" em Conta', async () => {
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } })),
    );
    renderRoute('/conta');

    expect(await screen.findByRole('heading', { level: 1, name: 'Conta' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Sobre mim' })).not.toBeInTheDocument();
  });
});

describe('página do paciente → Sobre a Paula (terapeuta)', () => {
  const therapist = { ...fakeUser, profiles: { patient: false, therapist: true } };
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

  function therapistApi(aboutMe: (AboutMe & { readStatus: 'NAO_LIDO' | 'LIDO' | 'ATUALIZADO'; readAt: string | null }) | null, unread?: Partial<UnreadResponse>) {
    const marks: unknown[] = [];
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: therapist })),
      http.get(BASE, () => HttpResponse.json(summary)),
      http.get(`${BASE}/cycle`, () => HttpResponse.json({ today: '2026-09-24', cycle: null })),
      http.get(`${BASE}/appointments`, () => HttpResponse.json(fakeAgenda())),
      http.get(`${BASE}/activities`, () => HttpResponse.json({ activities: [] })),
      http.get(`${BASE}/about-me`, () => HttpResponse.json({ aboutMe })),
      http.get(`${BASE}/unread`, () =>
        HttpResponse.json({
          thoughtRecords: [],
          tensionEpisodes: [],
          actions: [],
          aboutMe: [],
          planEntries: [],
          counts: { thoughtRecords: 0, tensionEpisodes: 0, actions: 0, aboutMe: 0, planEntries: 0 },
          ...unread,
        }),
      ),
      http.put(`*/api/therapist/read-marks/${PATIENT_ID}`, async ({ request }) => {
        marks.push(await request.json());
        return HttpResponse.json({ marked: 1, readAt: '2026-09-24T18:00:00.000Z' });
      }),
    );
    return marks;
  }

  it('mostra só os campos preenchidos, a data e o "Marcar como lido"', async () => {
    const marks = therapistApi({ ...about, readStatus: 'NAO_LIDO', readAt: null });
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const section = await screen.findByRole('region', { name: 'Sobre Paula' });
    expect(await within(section).findByText('Gosto de caminhar de manhã.')).toBeInTheDocument();
    expect(section).toHaveTextContent('O que eu gostaria de trabalhar');
    expect(section).not.toHaveTextContent('Hábitos que quero deixar');
    expect(section).toHaveTextContent('Atualizado em 23/09');
    // Só leitura: nenhum campo para a terapeuta escrever.
    expect(within(section).queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(within(section).getByRole('button', { name: 'Marcar como lido: Sobre mim' }));
    await waitFor(() => expect(marks).toEqual([{ items: [{ type: 'ABOUT_ME', id: about.id }] }]));
  });

  it('paciente que não contou nada: uma frase, sem cartão', async () => {
    therapistApi(null);
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const section = await screen.findByRole('region', { name: 'Sobre Paula' });
    expect(await within(section).findByText('Paula ainda não escreveu no “Sobre mim”.')).toBeInTheDocument();
  });

  it('entra no "Para ler", com a área e o contador', async () => {
    therapistApi(
      { ...about, readStatus: 'ATUALIZADO', readAt: '2026-09-20T12:00:00.000Z' },
      {
        aboutMe: [{ ...about, readStatus: 'ATUALIZADO', readAt: '2026-09-20T12:00:00.000Z' }],
        counts: { thoughtRecords: 0, tensionEpisodes: 0, actions: 0, aboutMe: 1, planEntries: 0 },
      },
    );
    renderRoute(`/pacientes/${PATIENT_ID}?aba=para-ler`);

    expect(await screen.findByRole('heading', { name: 'Para ler' })).toBeInTheDocument();
    expect(await screen.findByText(/Sobre mim · /)).toBeInTheDocument();
    expect(screen.getAllByText('Atualizado depois que você leu').length).toBeGreaterThan(0);
  });

  it('terapeuta sem o aceite do "Sobre mim": linha curta e o aceite numa janela', async () => {
    therapistApi(null);
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...therapist, privacyUpToDate: false, privacyAreas: { ...therapist.privacyAreas, aboutMe: false } } }),
      ),
    );
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const section = await screen.findByRole('region', { name: 'Sobre Paula' });
    expect(await within(section).findByText(/Para ler o “Sobre mim” de Paula/)).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Ler e aceitar' }));
    const dialog = await screen.findByRole('dialog', { name: '“Sobre mim”' });
    expect(dialog).toHaveTextContent('Para ler o “Sobre mim” dos seus pacientes, leia o que mudou e confirme.');
  });
});
