import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ACCESSIBILITY, type AccessibilitySettings } from '../features/profile/accessibility';
import {
  urlBase64ToUint8Array,
  type PushSubscriptionInput,
  type ReminderSettings,
  type RemindersResponse,
} from '../features/reminders/reminders-api';
import { renderRoute } from '../test/render';
import { apiError, fakeUser, loggedIn, server } from '../test/server';

// Lembretes de manhã e de noite (DEC-089, DEC-090). Dados fictícios (regra 5).
const VAPID_PUBLIC_KEY =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const FAKE_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/ficticio-123';
const FAKE_P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const FAKE_AUTH = 'tBHItJI5svbpez7KI4CCXg';

const baseSettings: ReminderSettings = {
  channel: 'EMAIL',
  morningEnabled: false,
  morningTime: '08:00',
  eveningEnabled: false,
  eveningTime: '20:00',
  quietHoursEnabled: true,
  quietStart: '22:00',
  quietEnd: '07:00',
  pausedUntil: null,
  lastFallbackAt: null,
};

function makeResponse(
  overrides: Partial<ReminderSettings> = {},
  pushOverrides: Partial<RemindersResponse['push']> = {},
): RemindersResponse {
  return {
    settings: { ...baseSettings, ...overrides },
    push: {
      configured: true,
      vapidPublicKey: VAPID_PUBLIC_KEY,
      hasSubscription: false,
      subscriptionCount: 0,
      ...pushOverrides,
    },
  };
}

function mockBrowserPush(
  initialPermission: NotificationPermission = 'default',
  requestedPermission: NotificationPermission = 'granted',
) {
  const subscribeSpy = vi.fn().mockResolvedValue({
    endpoint: FAKE_ENDPOINT,
    toJSON: () => ({
      endpoint: FAKE_ENDPOINT,
      keys: { p256dh: FAKE_P256DH, auth: FAKE_AUTH },
    }),
  });
  const getSubscriptionSpy = vi.fn().mockResolvedValue(null);

  Object.defineProperty(window, 'PushManager', {
    configurable: true,
    writable: true,
    value: function PushManager() {},
  });
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    writable: true,
    value: {
      permission: initialPermission,
      requestPermission: vi.fn().mockResolvedValue(requestedPermission),
    },
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    writable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: getSubscriptionSpy,
          subscribe: subscribeSpy,
        },
      }),
    },
  });

  return { subscribeSpy, getSubscriptionSpy };
}

beforeEach(() => {
  server.use(loggedIn);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Conta → Lembretes (paciente)', () => {
  function remindersApi(initial: Partial<ReminderSettings> = {}, pushOverrides: Partial<RemindersResponse['push']> = {}) {
    let state = makeResponse(initial, pushOverrides);
    const saved: unknown[] = [];
    const paused: string[] = [];
    const subscriptions: PushSubscriptionInput[] = [];
    let resumed = 0;

    server.use(
      http.get('*/api/reminders', () => HttpResponse.json(state)),
      http.put('*/api/reminders', async ({ request }) => {
        const body = (await request.json()) as Partial<ReminderSettings>;
        saved.push(body);
        state = {
          ...state,
          settings: {
            ...state.settings,
            ...body,
            lastFallbackAt: null,
          },
        };
        return HttpResponse.json(state);
      }),
      http.post('*/api/reminders/pause', async ({ request }) => {
        const body = (await request.json()) as { until: string };
        paused.push(body.until);
        state = {
          ...state,
          settings: {
            ...state.settings,
            pausedUntil: body.until,
          },
        };
        return HttpResponse.json(state);
      }),
      http.delete('*/api/reminders/pause', () => {
        resumed += 1;
        state = {
          ...state,
          settings: {
            ...state.settings,
            pausedUntil: null,
          },
        };
        return HttpResponse.json(state);
      }),
      http.post('*/api/reminders/push-subscriptions', async ({ request }) => {
        const body = (await request.json()) as PushSubscriptionInput;
        subscriptions.push(body);
        const nextCount = state.push.subscriptionCount + 1;
        state = {
          ...state,
          push: {
            ...state.push,
            hasSubscription: true,
            subscriptionCount: nextCount,
          },
        };
        return HttpResponse.json(state);
      }),
    );

    return { saved, paused, subscriptions, wasResumed: () => resumed };
  }

  it('mostra padrões desligados e salva horários de manhã, de noite e de silêncio', async () => {
    const { saved } = remindersApi();
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Lembretes' });
    expect(await within(section).findByRole('radio', { name: /E-mail/ })).toBeChecked();
    expect(within(section).getByRole('checkbox', { name: /De manhã/ })).not.toBeChecked();
    expect(within(section).getByRole('checkbox', { name: /À noite/ })).not.toBeChecked();
    expect(within(section).getByRole('checkbox', { name: /Respeitar horário de silêncio/ })).toBeChecked();

    await user.click(within(section).getByRole('checkbox', { name: /De manhã/ }));
    await user.selectOptions(within(section).getByLabelText('Horário da manhã'), '08:30');
    await user.click(within(section).getByRole('checkbox', { name: /À noite/ }));
    await user.selectOptions(within(section).getByLabelText('Horário da noite'), '20:15');
    await user.click(within(section).getByRole('button', { name: 'Salvar lembretes' }));

    await waitFor(() =>
      expect(saved).toEqual([
        {
          channel: 'EMAIL',
          morningEnabled: true,
          morningTime: '08:30',
          eveningEnabled: true,
          eveningTime: '20:15',
          quietHoursEnabled: true,
          quietStart: '22:00',
          quietEnd: '07:00',
        },
      ]),
    );
    expect(await within(section).findByRole('status')).toHaveTextContent('Pronto, lembretes salvos.');
  });

  it('barra horário de silêncio com início igual ao fim sem chamar a API', async () => {
    const { saved } = remindersApi();
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Lembretes' });
    const endSelect = await within(section).findByLabelText('Termina às');
    await user.selectOptions(endSelect, '22:00');
    await user.click(within(section).getByRole('button', { name: 'Salvar lembretes' }));

    expect(
      within(section).getByText('O início e o fim do horário de silêncio precisam ser diferentes.'),
    ).toBeInTheDocument();
    expect(endSelect).toHaveAttribute('aria-invalid', 'true');
    expect(saved).toEqual([]);
  });

  it('ao escolher Notificação neste aparelho, pede permissão, inscreve no PushManager e salva', async () => {
    const { saved, subscriptions } = remindersApi();
    const { subscribeSpy } = mockBrowserPush('default', 'granted');
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Lembretes' });
    await user.click(await within(section).findByRole('radio', { name: /Notificação neste aparelho/ }));
    await user.click(within(section).getByRole('button', { name: 'Salvar lembretes' }));

    await waitFor(() =>
      expect(subscriptions).toEqual([
        {
          endpoint: FAKE_ENDPOINT,
          keys: { p256dh: FAKE_P256DH, auth: FAKE_AUTH },
        },
      ]),
    );
    expect(subscribeSpy).toHaveBeenCalledOnce();
    expect(saved).toEqual([
      expect.objectContaining({
        channel: 'PUSH',
      }),
    ]);
    expect(await within(section).findByText('1 aparelho conectado para notificações.')).toBeInTheDocument();
  });

  it('se a permissão de notificação for negada, mostra orientação clara sem enviar PUT', async () => {
    const { saved } = remindersApi();
    mockBrowserPush('default', 'denied');
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Lembretes' });
    await user.click(await within(section).findByRole('radio', { name: /Notificação neste aparelho/ }));
    await user.click(within(section).getByRole('button', { name: 'Salvar lembretes' }));

    expect(
      await within(section).findByText(
        /As notificações estão bloqueadas neste navegador ou aparelho\. Libere nas configurações do navegador ou escolha receber por e-mail\./,
      ),
    ).toBeInTheDocument();
    expect(saved).toEqual([]);
  });

  it('mostra o aviso quando o último push caiu para e-mail (lastFallbackAt)', async () => {
    remindersApi({ channel: 'PUSH', lastFallbackAt: '2026-11-07T11:00:00.000Z' });
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Lembretes' });
    expect(
      await within(section).findByText(/Não conseguimos entregar a notificação no aparelho, então enviamos o último lembrete por e-mail/),
    ).toBeInTheDocument();
  });

  it('pausa os lembretes até uma data e permite retomar agora, mantendo o foco no botão', async () => {
    const { paused, wasResumed } = remindersApi();
    const user = userEvent.setup();
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Lembretes' });
    await user.click(await within(section).findByRole('button', { name: 'Pausar lembretes' }));

    const dialog = await screen.findByRole('dialog', { name: 'Pausar lembretes' });
    await user.click(within(dialog).getByRole('button', { name: 'Pausar' }));

    await waitFor(() => expect(paused).toHaveLength(1));
    const resumeButton = await within(section).findByRole('button', { name: 'Retomar agora' });
    await waitFor(() => expect(resumeButton).toHaveFocus());
    expect(within(section).getByText(/Lembretes pausados até/)).toBeInTheDocument();

    await user.click(resumeButton);
    await waitFor(() => expect(wasResumed()).toBe(1));
    const pauseButton = await within(section).findByRole('button', { name: 'Pausar lembretes' });
    await waitFor(() => expect(pauseButton).toHaveFocus());
  });

  it('respeita Linguagem direta e Sem pressão de tempo nos textos dos lembretes', async () => {
    const accessibility: AccessibilitySettings = {
      ...DEFAULT_ACCESSIBILITY,
      directLanguage: true,
      noTimePressure: true,
    };
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, accessibility } })),
    );
    remindersApi({ pausedUntil: '2026-12-20' });

    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Lembretes' });
    expect(
      await within(section).findByText(
        'Receba um lembrete quando houver atividades ou ações planejadas para o dia. O aviso nunca mostra o conteúdo dos seus registros.',
      ),
    ).toBeInTheDocument();
    expect(
      within(section).getByText('Quando ainda houver atividade ou ação sem registro até hoje.'),
    ).toBeInTheDocument();
    expect(within(section).getByText('Lembretes pausados até 20/12.')).toBeInTheDocument();
  });

  it('"#lembretes" (card de Novidades) leva até a seção com foco no título; terapeuta não vê Lembretes', async () => {
    remindersApi();
    const { unmount } = renderRoute('/conta#lembretes');

    const title = await screen.findByRole('heading', { level: 2, name: 'Lembretes' });
    await waitFor(() => expect(title).toHaveFocus());
    unmount();

    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: {
            ...fakeUser,
            profiles: { patient: false, therapist: true },
            pendingAnnouncement: '2026-11-lembretes',
          },
        }),
      ),
    );
    renderRoute('/conta');
    expect(await screen.findByRole('heading', { level: 1, name: 'Conta' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Lembretes' })).not.toBeInTheDocument();
    expect(screen.queryByText('Novidade: lembretes de manhã e de noite')).not.toBeInTheDocument();
  });

  it('mostra erro da API quando falha ao carregar ou salvar', async () => {
    server.use(http.get('*/api/reminders', () => apiError(500, 'INTERNAL', 'Não foi possível carregar os lembretes.')));
    renderRoute('/conta');

    const section = await screen.findByRole('region', { name: 'Lembretes' });
    expect(await within(section).findByText('Não foi possível carregar os lembretes.')).toBeInTheDocument();
  });

  it('urlBase64ToUint8Array decodifica chave VAPID em base64url', () => {
    const bytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });
});

describe('/privacidade: Lembretes', () => {
  it('cita as preferências de lembretes e o endereço técnico da notificação no aviso de privacidade', async () => {
    renderRoute('/privacidade');

    expect(await screen.findByRole('heading', { level: 1, name: 'Aviso de privacidade' })).toBeInTheDocument();
    expect(
      screen.getByText(/Nos lembretes: o canal escolhido \(e-mail ou notificação no aparelho\)/),
    ).toBeInTheDocument();
  });
});
