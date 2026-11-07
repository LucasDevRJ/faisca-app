import { api } from '../../lib/api';

export type ReminderChannel = 'EMAIL' | 'PUSH';

export type ReminderSettings = {
  channel: ReminderChannel;
  morningEnabled: boolean;
  morningTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  pausedUntil: string | null;
  lastFallbackAt: string | null;
};

export type PushInfo = {
  configured: boolean;
  vapidPublicKey: string | null;
  hasSubscription: boolean;
  subscriptionCount: number;
};

export type RemindersResponse = {
  settings: ReminderSettings;
  push: PushInfo;
};

export type UpdateRemindersInput = {
  channel: ReminderChannel;
  morningEnabled: boolean;
  morningTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
};

export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

// Intervalos de 15 minutos (00:00 a 23:45), como na SPEC e no CHECK do banco (DEC-089).
export const TIME_SLOTS: string[] = Array.from({ length: 24 * 4 }, (_, index) => {
  const hours = String(Math.floor(index / 4)).padStart(2, '0');
  const minutes = String((index % 4) * 15).padStart(2, '0');
  return `${hours}:${minutes}`;
});

export async function fetchReminders(): Promise<RemindersResponse> {
  const { data } = await api.get<RemindersResponse>('/reminders');
  return data;
}

export async function updateReminders(input: UpdateRemindersInput): Promise<RemindersResponse> {
  const { data } = await api.put<RemindersResponse>('/reminders', input);
  return data;
}

export async function pauseReminders(until: string): Promise<RemindersResponse> {
  const { data } = await api.post<RemindersResponse>('/reminders/pause', { until });
  return data;
}

export async function resumeReminders(): Promise<RemindersResponse> {
  const { data } = await api.delete<RemindersResponse>('/reminders/pause');
  return data;
}

export async function savePushSubscription(input: PushSubscriptionInput): Promise<RemindersResponse> {
  const { data } = await api.post<RemindersResponse>('/reminders/push-subscriptions', input);
  return data;
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await api.delete('/reminders/push-subscriptions', {
    data: { endpoint },
  });
}

// Converte a chave pública VAPID em base64url para o formato esperado pelo PushManager.subscribe.
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export type SubscribeDeviceResult =
  | { ok: true; status: RemindersResponse }
  | { ok: false; reason: 'UNSUPPORTED' | 'PERMISSION_DENIED' | 'SUBSCRIBE_FAILED' };

// Pede permissão de notificação ao navegador, inscreve este aparelho no PushManager e grava na API.
export async function subscribeCurrentDevice(vapidPublicKey: string): Promise<SubscribeDeviceResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'UNSUPPORTED' };
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return { ok: false, reason: 'PERMISSION_DENIED' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));

    const json = subscription.toJSON();
    const endpoint = json.endpoint ?? subscription.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return { ok: false, reason: 'SUBSCRIBE_FAILED' };
    }

    const status = await savePushSubscription({
      endpoint,
      keys: { p256dh, auth },
    });
    return { ok: true, status };
  } catch {
    return { ok: false, reason: 'SUBSCRIBE_FAILED' };
  }
}
