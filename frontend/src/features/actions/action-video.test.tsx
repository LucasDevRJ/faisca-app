import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { fakeUser, server } from '../../test/server';
import { ActionVideo } from './action-video';

function renderVideo(patientId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(http.get('*/api/auth/me', () => HttpResponse.json({
    user: { ...fakeUser, privacyAreas: { ...fakeUser.privacyAreas, actionVideos: true } },
  })));
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ActionVideo actionId="acao-ficticia" canChange={!patientId} patientId={patientId} />
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
