import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../features/activities/activities-api';
import { SHARED_AREAS } from '../features/links/links-api';
import type { PatientSummary } from '../features/therapist/therapist-api';
import { api } from '../lib/api';
import { renderRoute } from '../test/render';
import { fakeActivity, fakeUser, loggedIn, server } from '../test/server';

// Fotos das atividades (DEC-103, DEC-104). "Hoje" fixo: quinta, 24/09/2026, 15h em São Paulo.
// Dados fictícios (regra 5).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  server.use(loggedIn);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const photo = (n: number) => ({ id: `00000000-0000-4000-b000-${String(n).padStart(12, '0')}`, createdAt: '2026-09-23T21:00:00.000Z' });

// Responde as atividades e guarda as fotos removidas. O envio é conferido na chamada ao Axios:
// o File do jsdom não passa pelo Request do Node que o MSW usa.
function activitiesApi(activities: Activity[] | (() => Activity[])) {
  const uploads: { path: string; type: unknown }[] = [];
  const removed: string[] = [];
  vi.spyOn(api, 'post').mockImplementation(async (path, _body, config) => {
    uploads.push({ path, type: config?.headers?.['Content-Type'] });
    return { data: { photo: photo(99) }, status: 201 };
  });
  server.use(
    http.get('*/api/activities', () =>
      HttpResponse.json({ activities: typeof activities === 'function' ? activities() : activities }),
    ),
    http.delete('*/api/activities/:id/photos/:photoId', ({ params }) => {
      removed.push(params.photoId as string);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { uploads, removed };
}

const card = (name: string) => screen.findByRole('article', { name });

describe('/registros: fotos da atividade (paciente)', () => {
  it('aberta: "Adicionar fotos" sem prazo, com o lembrete de quem vê; manda o arquivo com o tipo', async () => {
    const activity = fakeActivity({ name: 'Caminhada fictícia', activityDate: '2026-09-24', status: 'PLANEJADA' });
    const { uploads } = activitiesApi([activity]);
    const user = userEvent.setup();
    renderRoute('/registros');

    const item = await card('Caminhada fictícia');
    expect(item).toHaveTextContent('Até 10 fotos.');
    expect(item).not.toHaveTextContent('Dá para adicionar ou remover até');
    expect(item).toHaveTextContent('As fotos aparecem só para quem você liberar em Conta.');
    await user.upload(
      item.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['x'], 'parque.png', { type: 'image/png' }),
    );
    await waitFor(() => expect(uploads).toEqual([{ path: `/activities/${activity.id}/photos`, type: 'image/png' }]));
  });

  it('concluída no prazo: miniaturas, o prazo da consulta e a foto grande com "Remover foto"', async () => {
    let photos = [photo(1), photo(2)];
    const activity = () =>
      fakeActivity({
        id: '00000000-0000-4000-a000-000000000002',
        name: 'Leitura fictícia',
        activityDate: '2026-09-23',
        status: 'CONCLUIDA',
        wantBefore: 3,
        pleasure: 7,
        achievement: 6,
        photos,
        photosDeadline: { date: '2026-09-28', time: '14:00' },
        photosOpen: true,
      });
    const { removed } = activitiesApi(() => [activity()]);
    const user = userEvent.setup();
    renderRoute('/registros');

    const item = await card('Leitura fictícia');
    expect(item).toHaveTextContent('Dá para adicionar ou remover até seg, 28/09, às 14:00. 2 fotos (cabem até 10).');
    const thumb = within(item).getByRole('button', { name: 'Abrir a foto 2 de 2' });
    expect(within(thumb).getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      `/api/activities/00000000-0000-4000-a000-000000000002/photos/${photo(2).id}?size=thumb`,
    );

    await user.click(thumb);
    const viewer = await screen.findByRole('dialog', { name: 'Foto 2 de 2' });
    photos = [photo(1)];
    await user.click(within(viewer).getByRole('button', { name: 'Remover foto' }));
    await user.click(within(viewer).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(removed).toEqual([photo(2).id]));
    expect(await screen.findByRole('dialog', { name: 'Foto 1 de 1' })).toBeInTheDocument();
  });

  it('concluída fora do prazo: as fotos ficam à vista, sem adicionar nem remover', async () => {
    activitiesApi([
      fakeActivity({
        name: 'Feira fictícia',
        activityDate: '2026-09-22',
        status: 'CONCLUIDA',
        wantBefore: 3,
        pleasure: 7,
        achievement: 6,
        photos: [photo(1)],
        photosDeadline: { date: '2026-09-23', time: '14:00' },
        photosOpen: false,
      }),
    ]);
    const user = userEvent.setup();
    renderRoute('/registros');

    const item = await card('Feira fictícia');
    expect(within(item).queryByRole('button', { name: 'Adicionar fotos' })).not.toBeInTheDocument();
    await user.click(within(item).getByRole('button', { name: 'Abrir a foto 1 de 1' }));
    const viewer = await screen.findByRole('dialog', { name: 'Foto 1 de 1' });
    expect(within(viewer).queryByRole('button', { name: 'Remover foto' })).not.toBeInTheDocument();
  });

  it('não realizada: sem "Adicionar fotos", com o aviso, e dá para tirar as que estão lá', async () => {
    const { removed } = activitiesApi([
      fakeActivity({
        id: '00000000-0000-4000-a000-000000000003',
        name: 'Ida fictícia ao cinema',
        activityDate: '2026-09-22',
        status: 'NAO_REALIZADA',
        photos: [photo(1)],
        photosOpen: false,
      }),
    ]);
    const user = userEvent.setup();
    renderRoute('/registros');

    const item = await card('Ida fictícia ao cinema');
    expect(item).toHaveTextContent('Esta atividade não aconteceu, então não recebe fotos novas. Se quiser, pode tirar as que estão aqui.');
    expect(within(item).queryByRole('button', { name: 'Adicionar fotos' })).not.toBeInTheDocument();
    await user.click(within(item).getByRole('button', { name: 'Abrir a foto 1 de 1' }));
    const viewer = await screen.findByRole('dialog', { name: 'Foto 1 de 1' });
    await user.click(within(viewer).getByRole('button', { name: 'Remover foto' }));
    await user.click(within(viewer).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(removed).toEqual([photo(1).id]));
  });

  it('não realizada sem fotos: o cartão não fala de fotos', async () => {
    activitiesApi([fakeActivity({ name: 'Passeio fictício', activityDate: '2026-09-22', status: 'NAO_REALIZADA', photosOpen: false })]);
    renderRoute('/registros');

    const item = await card('Passeio fictício');
    expect(item).not.toHaveTextContent('foto');
  });

  it('sem o aceite da versão nova: "Adicionar fotos" abre o pedido de aceite numa janela', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, privacyUpToDate: false, privacyAreas: { ...fakeUser.privacyAreas, activityPhotos: false } } }),
      ),
    );
    activitiesApi([fakeActivity({ name: 'Caminhada fictícia', activityDate: '2026-09-24', status: 'PLANEJADA' })]);
    const user = userEvent.setup();
    renderRoute('/registros');

    const item = await card('Caminhada fictícia');
    expect(item.querySelector('input[type="file"]')).toBeNull();
    await user.click(within(item).getByRole('button', { name: 'Adicionar fotos' }));
    const dialog = await screen.findByRole('dialog', { name: 'Fotos da atividade' });
    expect(dialog).toHaveTextContent('Para adicionar fotos às suas atividades, leia o que mudou e confirme.');
  });

  it('com "sem pressão de tempo" ligado, o cartão não mostra o prazo da consulta', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, accessibility: { ...fakeUser.accessibility, noTimePressure: true } } }),
      ),
    );
    activitiesApi([
      fakeActivity({
        name: 'Leitura fictícia',
        activityDate: '2026-09-23',
        status: 'CONCLUIDA',
        wantBefore: 3,
        pleasure: 7,
        achievement: 6,
        photosDeadline: { date: '2026-09-28', time: '14:00' },
      }),
    ]);
    renderRoute('/registros');

    const item = await card('Leitura fictícia');
    expect(within(item).getByRole('button', { name: 'Adicionar fotos' })).toBeInTheDocument();
    expect(item).not.toHaveTextContent('Dá para adicionar ou remover até');
    expect(item).toHaveTextContent('Até 10 fotos.');
  });
});

describe('/pacientes/:id: fotos da atividade (profissional)', () => {
  const PATIENT_ID = '00000000-0000-4000-8000-00000000000a';
  const BASE = `*/api/therapist/patients/${PATIENT_ID}`;
  const summary: PatientSummary = {
    patient: { id: PATIENT_ID, name: 'Paula Fictícia', email: 'paula@faisca.test', linkedAt: '2026-09-01T15:00:00.000Z', avatarVersion: null },
    today: '2026-09-24',
    lastAppointment: null,
    nextAppointment: null,
    agendaStatus: null,
    pause: null,
    highlight: { from: '2026-09-21', to: '2026-09-27', reason: 'LAST_7_DAYS' },
    access: { kind: 'PSICOLOGIA', sharedAreas: SHARED_AREAS.filter((area) => area !== 'APPOINTMENTS') },
  };

  function therapistApi(activities: Activity[]) {
    const writes: string[] = [];
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } }),
      ),
      http.get(BASE, () => HttpResponse.json(summary)),
      http.get(`${BASE}/activities`, () => HttpResponse.json({ activities })),
      http.post('*/api/*', ({ request }) => {
        writes.push(request.url);
        return new HttpResponse(null, { status: 403 });
      }),
    );
    return writes;
  }

  it('sem o aceite da versão nova: "Ver as fotos" abre o pedido de aceite da profissional', async () => {
    therapistApi([
      fakeActivity({ name: 'Caminhada fictícia', activityDate: '2026-09-23', status: 'CONCLUIDA', photos: [photo(1)] }),
    ]);
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: {
            ...fakeUser,
            profiles: { patient: false, therapist: true },
            privacyUpToDate: false,
            privacyAreas: { ...fakeUser.privacyAreas, activityPhotos: false },
          },
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const item = await card('Caminhada fictícia');
    expect(item).toHaveTextContent('Esta atividade tem 1 foto.');
    expect(within(item).queryByRole('img')).not.toBeInTheDocument();
    await user.click(within(item).getByRole('button', { name: 'Ver as fotos' }));
    const dialog = await screen.findByRole('dialog', { name: 'Fotos da atividade' });
    expect(dialog).toHaveTextContent('Para ver as fotos das atividades dos seus pacientes, leia o que mudou e confirme.');
  });

  it('vê as miniaturas e a foto grande pelo endereço do vínculo, sem botões de mudança', async () => {
    const activity = fakeActivity({
      id: '00000000-0000-4000-a000-000000000004',
      name: 'Caminhada fictícia',
      activityDate: '2026-09-23',
      status: 'CONCLUIDA',
      wantBefore: 3,
      pleasure: 7,
      achievement: 6,
      photos: [photo(1)],
      // A API manda photosOpen: false para a profissional sem a agenda; o botão some de qualquer jeito.
      photosOpen: true,
    });
    therapistApi([activity]);
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const item = await card('Caminhada fictícia');
    expect(within(item).queryByRole('button', { name: 'Adicionar fotos' })).not.toBeInTheDocument();
    const thumb = within(item).getByRole('button', { name: 'Abrir a foto 1 de 1' });
    expect(within(thumb).getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      `/api/therapist/patients/${PATIENT_ID}/activities/${activity.id}/photos/${photo(1).id}?size=thumb`,
    );
    await user.click(thumb);
    const viewer = await screen.findByRole('dialog', { name: 'Foto 1 de 1' });
    expect(within(viewer).queryByRole('button', { name: 'Remover foto' })).not.toBeInTheDocument();
  });
});
