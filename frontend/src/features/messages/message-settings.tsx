import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { getApiError } from '../auth/auth-api';
import { subscribeCurrentDevice } from '../reminders/reminders-api';
import { fetchMessagePreferences, updateMessagePreferences, type MessagePreferences } from './messages-api';

export function MessageSettings({ userId, professional = false }: { userId: string; professional?: boolean }) {
  const settings = useQuery({
    queryKey: ['messages', userId, 'preferences'],
    queryFn: ({ signal }) => fetchMessagePreferences(signal),
    retry: false,
    gcTime: 0,
  });
  return (
    <section aria-labelledby="message-settings-title" className="flex flex-col gap-3">
      <h1 id="message-settings-title" className="text-3xl font-bold">Avisos de mensagens</h1>
      <p className="text-muted">Escolha como receber avisos. Eles não mostram o conteúdo nem quem enviou.</p>
      {settings.isPending && <p role="status">Carregando preferências…</p>}
      {settings.isError && <Alert tone="attention">{getApiError(settings.error).message}</Alert>}
      {settings.isSuccess && <PreferencesForm initial={settings.data} professional={professional} />}
    </section>
  );
}

function PreferencesForm({ initial, professional }: { initial: MessagePreferences; professional: boolean }) {
  const [email, setEmail] = useState(initial.email);
  // Profissional (DEC-128): receber mensagens "Sobre um registro". Começa ligado.
  const [recordTopics, setRecordTopics] = useState(initial.recordTopics);
  const [push, setPush] = useState(initial.push);
  const [savedPush, setSavedPush] = useState(initial.push);
  const save = useMutation({
    mutationFn: updateMessagePreferences,
    onSuccess: (_result, choices) => setSavedPush(choices.push),
  });
  const device = useMutation({
    mutationFn: async (key: string) => {
      const result = await subscribeCurrentDevice(key);
      if (!result.ok) throw new Error(result.reason);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(professional ? { email, push, recordTopics } : { email, push });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <form className="flex flex-col gap-2" onSubmit={submit}>
        <fieldset disabled={save.isPending}>
          <legend className="sr-only">Canais de aviso</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input type="checkbox" checked={email} onChange={(event) => { save.reset(); setEmail(event.target.checked); }} />
            E-mail
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input type="checkbox" checked={push} onChange={(event) => { save.reset(); setPush(event.target.checked); }} />
            Notificação no aparelho
          </label>
        </fieldset>
        {professional && (
          <fieldset disabled={save.isPending} className="flex flex-col gap-1">
            <legend className="sr-only">Mensagens sobre registros</legend>
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <input type="checkbox" checked={recordTopics} onChange={(event) => { save.reset(); setRecordTopics(event.target.checked); }} />
              Receber mensagens sobre registros
            </label>
            <p className="text-sm text-muted">
              Seus pacientes podem apontar um registro ao escrever. Você vê só os registros das áreas que cada um liberou.
            </p>
          </fieldset>
        )}
        <Button type="submit" disabled={save.isPending} className="self-start">{professional ? 'Salvar preferências' : 'Salvar avisos'}</Button>
        {save.isError && <Alert tone="attention">{getApiError(save.error).message}</Alert>}
        <p role="status">{save.isSuccess ? 'Preferências salvas.' : ''}</p>
      </form>
      <p className="text-sm text-muted">Para receber avisos neste aparelho, permita notificações no navegador.</p>
      {initial.pushPublicKey && savedPush && push && (
        <Button variant="secondary" className="self-start" disabled={device.isPending}
          onClick={() => device.mutate(initial.pushPublicKey!)}>Permitir neste aparelho</Button>
      )}
      {device.isError && <Alert tone="attention">Não consegui ativar neste aparelho. Confira as permissões do navegador.</Alert>}
      <p role="status">{device.isSuccess && savedPush && push ? 'Aparelho pronto para receber avisos.' : ''}</p>
    </div>
  );
}
