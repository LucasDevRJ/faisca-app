import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { fakeUser, server } from '../../test/server';
import { ActionVideo } from './action-video';

function renderVideo(patientId?: string, activity = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(http.get('*/api/auth/me', () => HttpResponse.json({
    user: { ...fakeUser, privacyAreas: { ...fakeUser.privacyAreas, actionVideos: true, activityVideos: true } },
  })));
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ActionVideo actionId="acao-ficticia" canChange={!patientId} patientId={patientId} activity={activity} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('vídeos na Ação', () => {
  it.each([true, false])('abre com áudio ligado e envia a escolha %s', async (keepAudio) => {
    const user = userEvent.setup();
    let requested: string | null = null;
    server.use(
      http.get('*/api/actions/acao-ficticia/video', () => HttpResponse.json(null)),
      http.post('*/api/actions/acao-ficticia/video', ({ request }) => {
        requested = new URL(request.url).searchParams.get('audio');
        return HttpResponse.json({ state: 'PENDING' }, { status: 202 });
      }),
    );
    renderVideo();
    await user.click(await screen.findByRole('button', { name: 'Adicionar vídeo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar vídeo à Ação' });
    const audio = within(dialog).getByRole('checkbox', { name: 'Manter o áudio no vídeo final' });
    expect(audio).toBeChecked();
    if (!keepAudio) await user.click(audio);
    const choose = within(dialog).getByRole('button', { name: 'Escolher vídeo' });
    const fileInput = within(dialog).getByLabelText('Arquivo de vídeo');
    let opened = false;
    fileInput.addEventListener('click', () => { opened = true; }, { once: true });
    await user.click(choose);
    expect(opened).toBe(true);
    await user.upload(fileInput, new File(['fictício'], 'ficticio.mov', { type: 'video/quicktime' }));
    expect(within(dialog).getByRole('status')).toHaveTextContent('ficticio.mov');
    expect(within(dialog).getByRole('button', { name: 'Trocar vídeo' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Enviar vídeo' }));
    await waitFor(() => expect(requested).toBe(keepAudio ? 'keep' : 'remove'));
  });

  it('oferece só reprodução na visão da profissional', async () => {
    server.use(http.get('*/api/therapist/patients/paciente-ficticio/actions/acao-ficticia/video', () =>
      HttpResponse.json({ state: 'READY' })));
    renderVideo('paciente-ficticio');
    expect(await screen.findByLabelText('Vídeo da Ação')).toHaveAttribute(
      'src', '/api/therapist/patients/paciente-ficticio/actions/acao-ficticia/video/play',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

it('envia GIF nas atividades sem áudio e aguarda a reprodução manual', async () => {
  const user = userEvent.setup();
  let uploaded: { audio: string | null; type: string | null } | undefined;
  const path = '*/api/activities/acao-ficticia/video';
  server.use(
    http.get(path, () => HttpResponse.json(uploaded ? { state: 'READY' } : null)),
    http.post(path, ({ request }) => {
      uploaded = { audio: new URL(request.url).searchParams.get('audio'), type: request.headers.get('content-type') };
      return HttpResponse.json({ state: 'PENDING' }, { status: 202 });
    }),
  );
  renderVideo(undefined, true);
  await user.click(await screen.findByRole('button', { name: 'Adicionar vídeo ou GIF' }));
  const dialog = screen.getByRole('dialog', { name: 'Adicionar vídeo ou GIF à atividade' });
  await user.upload(within(dialog).getByLabelText('Arquivo de vídeo ou GIF'), new File(['fictício'], 'ficticio.gif', { type: 'image/gif' }));
  expect(within(dialog).queryByRole('checkbox', { name: 'Manter o áudio no vídeo final' })).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Enviar arquivo' }));
  const video = await screen.findByLabelText('Vídeo ou GIF da atividade');
  expect(uploaded).toEqual({ audio: 'remove', type: 'image/gif' });
  expect(video).toHaveAttribute('controls');
  expect(video).not.toHaveAttribute('autoplay');
  expect(video).not.toHaveAttribute('loop');
});
