import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Dialog, DialogActions, DialogForm } from '../../components/ui/dialog';
import { FieldError } from '../../components/ui/field-error';
import { choiceCardClasses, fieldClasses } from '../../components/ui/field-styles';
import { TextField } from '../../components/ui/text-field';
import {
  addDays,
  formatDayMonth,
  formatRelativeDay,
  isValidDateOnly,
  todayInAppZone,
} from '../activities/week';
import { getApiError } from '../auth/auth-api';
import { useAccessibility } from '../profile/use-profile';
import {
  subscribeCurrentDevice,
  TIME_SLOTS,
  type PushInfo,
  type ReminderChannel,
  type ReminderSettings,
  type RemindersResponse,
} from './reminders-api';
import {
  REMINDERS_QUERY_KEY,
  usePauseReminders,
  useReminders,
  useResumeReminders,
  useUpdateReminders,
} from './use-reminders';

const MAX_PAUSE_DAYS = 365;

// "Lembretes", em Conta, só para quem é paciente (DEC-089, DEC-090).
export function RemindersSection() {
  const query = useReminders();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { hash } = useLocation();
  const ready = !query.isPending;

  // "Configurar lembretes" (card de Novidades) chega com #lembretes: rola até a seção e põe o foco no título.
  useEffect(() => {
    if (hash === '#lembretes' && ready) {
      titleRef.current?.scrollIntoView?.({ block: 'start' });
      titleRef.current?.focus();
    }
  }, [hash, ready]);

  return (
    <section aria-labelledby="reminders-title" className="flex flex-col gap-3">
      <h2 id="reminders-title" ref={titleRef} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
        Lembretes
      </h2>
      {query.isPending ? (
        <p className="text-muted" aria-busy="true">
          Carregando lembretes…
        </p>
      ) : query.isError ? (
        <Alert tone="attention">{getApiError(query.error).message}</Alert>
      ) : (
        <RemindersContent data={query.data} />
      )}
    </section>
  );
}

function RemindersContent({ data }: { data: RemindersResponse }) {
  const { settings, push } = data;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6">
      {settings.lastFallbackAt && (
        <Alert tone="attention">
          Não conseguimos entregar a notificação no aparelho, então enviamos o último lembrete por e-mail. Você pode
          reativar a notificação neste aparelho e salvar, ou manter por e-mail.
        </Alert>
      )}
      <PauseRemindersCard settings={settings} />
      <RemindersForm initial={settings} push={push} />
    </div>
  );
}

function PauseRemindersCard({ settings }: { settings: ReminderSettings }) {
  const { noTimePressure } = useAccessibility();
  const resume = useResumeReminders();
  const [dialogOpen, setDialogOpen] = useState(false);
  const actionContainerRef = useRef<HTMLDivElement>(null);
  const today = todayInAppZone();
  const isPaused = Boolean(settings.pausedUntil);

  function focusActionButton() {
    requestAnimationFrame(() => actionContainerRef.current?.querySelector('button')?.focus());
  }

  const pausedText = settings.pausedUntil
    ? noTimePressure
      ? `Lembretes pausados até ${formatDayMonth(settings.pausedUntil)}.`
      : `Lembretes pausados até ${formatDayMonth(settings.pausedUntil)} (${formatRelativeDay(settings.pausedUntil, today)}).`
    : null;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-bg p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="flex flex-col gap-1">
        <p className="font-medium">
          {pausedText ?? 'Vai tirar uns dias de descanso? Você pode pausar os lembretes.'}
        </p>
        {resume.isError && <Alert tone="attention">{getApiError(resume.error).message}</Alert>}
      </div>
      <div ref={actionContainerRef} className="shrink-0">
        {isPaused ? (
          <Button
            variant="secondary"
            disabled={resume.isPending}
            onClick={() => resume.mutate(undefined, { onSuccess: focusActionButton })}
          >
            {resume.isPending ? 'Retomando…' : 'Retomar agora'}
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Pausar lembretes
          </Button>
        )}
      </div>
      {dialogOpen && (
        <PauseRemindersDialog
          today={today}
          onClose={() => setDialogOpen(false)}
          onPaused={() => {
            setDialogOpen(false);
            focusActionButton();
          }}
        />
      )}
    </div>
  );
}

function PauseRemindersDialog({
  today,
  onClose,
  onPaused,
}: {
  today: string;
  onClose: () => void;
  onPaused: () => void;
}) {
  const pause = usePauseReminders();
  const [until, setUntil] = useState(() => addDays(today, 7));
  const [fieldError, setFieldError] = useState<string>();
  const maxDate = addDays(today, MAX_PAUSE_DAYS);
  const apiError = pause.error ? getApiError(pause.error) : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidDateOnly(until)) {
      setFieldError('Escolha uma data válida.');
      return;
    }
    if (until < today || until > maxDate) {
      setFieldError('Escolha uma data de hoje até 1 ano à frente.');
      return;
    }
    setFieldError(undefined);
    pause.mutate(until, { onSuccess: onPaused });
  }

  return (
    <Dialog
      title="Pausar lembretes"
      description="Até essa data, nenhum lembrete será enviado. Depois dela, eles voltam sozinhos."
      onClose={onClose}
    >
      <DialogForm
        onSubmit={handleSubmit}
        error={apiError && !apiError.fields.until ? apiError.message : null}
      >
        <TextField
          label="Pausar até o dia"
          hint="No dia seguinte a essa data, os lembretes voltam ao normal."
          type="date"
          min={today}
          max={maxDate}
          value={until}
          onChange={(e) => {
            setUntil(e.target.value);
            setFieldError(undefined);
            pause.reset();
          }}
          error={fieldError ?? apiError?.fields.until}
        />
        <DialogActions submitLabel="Pausar" pending={pause.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

function TimeSelect({
  label,
  value,
  onChange,
  disabled,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`min-h-11 sm:w-40 ${fieldClasses} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {TIME_SLOTS.map((slot) => (
          <option key={slot} value={slot}>
            {slot}
          </option>
        ))}
      </select>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

function RemindersForm({ initial, push }: { initial: ReminderSettings; push: PushInfo }) {
  const { directLanguage } = useAccessibility();
  const queryClient = useQueryClient();
  const update = useUpdateReminders();

  const [channel, setChannel] = useState<ReminderChannel>(initial.channel);
  const [morningEnabled, setMorningEnabled] = useState(initial.morningEnabled);
  const [morningTime, setMorningTime] = useState(initial.morningTime);
  const [eveningEnabled, setEveningEnabled] = useState(initial.eveningEnabled);
  const [eveningTime, setEveningTime] = useState(initial.eveningTime);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(initial.quietHoursEnabled);
  const [quietStart, setQuietStart] = useState(initial.quietStart);
  const [quietEnd, setQuietEnd] = useState(initial.quietEnd);

  const [quietError, setQuietError] = useState<string>();
  const [pushError, setPushError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [status, setStatus] = useState('');

  const apiError = update.error ? getApiError(update.error) : null;
  const saving = subscribing || update.isPending;

  function clearFeedback() {
    setStatus('');
    setPushError(null);
    setQuietError(undefined);
    update.reset();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();

    if (quietHoursEnabled && quietStart === quietEnd) {
      setQuietError('O início e o fim do horário de silêncio precisam ser diferentes.');
      return;
    }

    if (channel === 'PUSH') {
      if (!push.configured || !push.vapidPublicKey) {
        setPushError(
          'As notificações no aparelho ainda não estão disponíveis no servidor. Por enquanto, escolha receber por e-mail.',
        );
        return;
      }
      setSubscribing(true);
      const result = await subscribeCurrentDevice(push.vapidPublicKey);
      setSubscribing(false);
      if (!result.ok) {
        if (result.reason === 'PERMISSION_DENIED') {
          setPushError(
            'As notificações estão bloqueadas neste navegador ou aparelho. Libere nas configurações do navegador ou escolha receber por e-mail.',
          );
        } else if (result.reason === 'UNSUPPORTED') {
          setPushError(
            'Este navegador não suporta notificações no aparelho. Escolha receber os lembretes por e-mail.',
          );
        } else {
          setPushError(
            'Não foi possível ativar a notificação neste aparelho agora. Tente de novo ou escolha receber por e-mail.',
          );
        }
        return;
      }
      queryClient.setQueryData<RemindersResponse>(REMINDERS_QUERY_KEY, result.status);
    }

    update.mutate(
      {
        channel,
        morningEnabled,
        morningTime,
        eveningEnabled,
        eveningTime,
        quietHoursEnabled,
        quietStart,
        quietEnd,
      },
      {
        onSuccess: () => {
          setStatus('Pronto, lembretes salvos.');
        },
      },
    );
  }

  const deviceCountText =
    push.subscriptionCount === 1
      ? '1 aparelho conectado para notificações.'
      : push.subscriptionCount > 1
        ? `${push.subscriptionCount} aparelhos conectados para notificações.`
        : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <p className="text-muted">
        {directLanguage
          ? 'Receba um lembrete quando houver atividades ou ações planejadas para o dia. O aviso nunca mostra o conteúdo dos seus registros.'
          : 'Receba um aviso gentil quando tiver atividades ou ações planejadas para o dia. O texto nunca mostra o que você escreveu.'}
      </p>

      {apiError && <Alert tone="attention">{apiError.message}</Alert>}
      {pushError && <Alert tone="attention">{pushError}</Alert>}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Por onde receber</legend>
        <div className="flex flex-col gap-2">
          <label className={`flex min-h-11 items-start gap-3 p-3 ${choiceCardClasses}`}>
            <input
              type="radio"
              name="reminder-channel"
              value="EMAIL"
              checked={channel === 'EMAIL'}
              onChange={() => {
                clearFeedback();
                setChannel('EMAIL');
              }}
              className="mt-0.5"
            />
            <span className="flex flex-col">
              <span className="font-medium">E-mail</span>
              <span className="text-sm text-muted">Envia para o e-mail da sua conta.</span>
            </span>
          </label>

          <label className={`flex min-h-11 items-start gap-3 p-3 ${choiceCardClasses}`}>
            <input
              type="radio"
              name="reminder-channel"
              value="PUSH"
              checked={channel === 'PUSH'}
              onChange={() => {
                clearFeedback();
                setChannel('PUSH');
              }}
              className="mt-0.5"
            />
            <span className="flex flex-col">
              <span className="font-medium">Notificação neste aparelho</span>
              <span className="text-sm text-muted">
                Mostra um aviso no celular ou computador. Se não entregar, enviamos por e-mail para você não perder.
              </span>
              {deviceCountText && <span className="mt-1 text-xs text-muted">{deviceCountText}</span>}
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium">Quando lembrar</legend>

        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={morningEnabled}
              onChange={(e) => {
                clearFeedback();
                setMorningEnabled(e.target.checked);
              }}
              className="mt-0.5"
            />
            <span className="flex flex-col">
              <span className="font-medium">De manhã</span>
              <span className="text-sm text-muted">Quando houver atividade ou ação planejada para o dia.</span>
            </span>
          </label>
          <div className="pl-7">
            <TimeSelect
              label="Horário da manhã"
              value={morningTime}
              disabled={!morningEnabled}
              onChange={(value) => {
                clearFeedback();
                setMorningTime(value);
              }}
              error={apiError?.fields.morningTime}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={eveningEnabled}
              onChange={(e) => {
                clearFeedback();
                setEveningEnabled(e.target.checked);
              }}
              className="mt-0.5"
            />
            <span className="flex flex-col">
              <span className="font-medium">À noite</span>
              <span className="text-sm text-muted">
                {directLanguage
                  ? 'Quando ainda houver atividade ou ação sem registro até hoje.'
                  : 'Para contar como foi o dia quando ainda houver atividade ou ação aberta.'}
              </span>
            </span>
          </label>
          <div className="pl-7">
            <TimeSelect
              label="Horário da noite"
              value={eveningTime}
              disabled={!eveningEnabled}
              onChange={(value) => {
                clearFeedback();
                setEveningTime(value);
              }}
              error={apiError?.fields.eveningTime}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium">Horário de silêncio</legend>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={quietHoursEnabled}
              onChange={(e) => {
                clearFeedback();
                setQuietHoursEnabled(e.target.checked);
              }}
              className="mt-0.5"
            />
            <span className="flex flex-col">
              <span className="font-medium">Respeitar horário de silêncio</span>
              <span className="text-sm text-muted">
                Nenhum lembrete sai nesse intervalo; o que cair nele fica para o fim do silêncio.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap gap-4 pl-7">
            <TimeSelect
              label="Começa às"
              value={quietStart}
              disabled={!quietHoursEnabled}
              onChange={(value) => {
                clearFeedback();
                setQuietStart(value);
              }}
              error={apiError?.fields.quietStart}
            />
            <TimeSelect
              label="Termina às"
              value={quietEnd}
              disabled={!quietHoursEnabled}
              onChange={(value) => {
                clearFeedback();
                setQuietEnd(value);
              }}
              error={quietError ?? apiError?.fields.quietEnd}
            />
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar lembretes'}
        </Button>
        <p role="status" className="text-sm text-muted">
          {status}
        </p>
      </div>
    </form>
  );
}
