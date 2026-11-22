import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render';
import { fakeUser, server } from '../test/server';

const therapistSession = { ...fakeUser, profiles: { patient: false, therapist: true } };

describe('/comunidade-psicologa', () => {
  it('mostra que o 2FA é necessário para ativar a revisão própria', async () => {
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: therapistSession })),
      http.get('*/api/therapist/community', () => HttpResponse.json({ community: { id: 'comunidade-ficticia', moderationEnabled: false }, twoFactorEnabled: false, requests: [], invitations: [], members: [] })),
      http.get('*/api/therapist/community/feed', () => HttpResponse.json({ posts: [], events: [] })),
      http.get('*/api/links/patients', () => HttpResponse.json({ patients: [] })),
    );
    renderRoute('/comunidade-psicologa');

    expect(await screen.findByRole('alert')).toHaveTextContent('ligue a verificação em duas etapas em Conta');
    expect(screen.getByRole('button', { name: 'Ativar revisão por mim' })).toBeDisabled();
  });

  it('deixa a psicóloga revisar a fila própria com mensagens privadas acolhedoras', async () => {
    const user = userEvent.setup();
    let submitted: unknown;
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: therapistSession })),
      http.get('*/api/therapist/community/moderation', () => HttpResponse.json({
        posts: [{ id: 'post-ficticio', authorKind: 'PATIENT', authorDisplayName: 'Sol', body: 'Relato fictício.', status: 'PENDING', moderationMessage: null, createdAt: '2026-11-21T12:00:00.000Z', updatedAt: '2026-11-21T12:00:00.000Z' }],
        comments: [],
        reports: [],
      })),
      http.patch('*/api/therapist/community/moderation/posts/post-ficticio', async ({ request }) => {
        submitted = await request.json();
        return HttpResponse.json({ post: { id: 'post-ficticio', status: 'REJECTED' } });
      }),
    );
    renderRoute('/comunidade-psicologa/moderacao');

    await user.click(await screen.findByRole('button', { name: 'Recusar com mensagem' }));
    expect(screen.getByText(/Escolha uma mensagem privada/i)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Privacidade/i }));
    await user.click(screen.getByRole('button', { name: 'Recusar conteúdo' }));

    expect(await screen.findByText('Decisão salva e mensagem enviada em privado.')).toBeInTheDocument();
    expect(submitted).toEqual({ decision: 'REJECT', message: 'Para proteger a privacidade, evite detalhes que identifiquem você ou outra pessoa. Se quiser, você pode editar e enviar novamente.' });
  });
});
