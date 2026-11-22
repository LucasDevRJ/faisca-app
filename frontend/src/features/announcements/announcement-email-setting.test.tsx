import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../../test/render';
import { fakeUser, server } from '../../test/server';

describe('preferência de novidades por e-mail (DEC-119)', () => {
  it('começa ligada e pode ser desligada sem afetar os avisos da conta', async () => {
    let enabled = true;
    let requestBody: unknown;
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, announcementEmails: enabled } })),
      http.put('*/api/auth/announcement-emails', async ({ request }) => {
        requestBody = await request.json();
        enabled = (requestBody as { enabled: boolean }).enabled;
        return HttpResponse.json({ user: { ...fakeUser, announcementEmails: enabled, loginAlert: true } });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/conta');

    const checkbox = await screen.findByRole('checkbox', {
      name: 'Quero receber por e-mail avisos sobre novidades importantes do Faísca',
    });
    expect(checkbox).toBeChecked();
    await user.click(checkbox);

    await waitFor(() => expect(requestBody).toEqual({ enabled: false }));
    expect(checkbox).not.toBeChecked();
    expect(await screen.findByText('Pronto, os avisos por e-mail foram desligados.')).toBeInTheDocument();
  });
});
