import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { fieldClasses } from '../components/ui/field-styles';
import { TextAreaField } from '../components/ui/text-field';
import { getApiError } from '../features/auth/auth-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { formatDateTime } from '../features/links/link-format';
import {
  fetchConversations, fetchMessages, MESSAGE_LIMIT, messageTopics, sendMessage,
  type Conversation, type Message, type MessageTopic,
} from '../features/messages/messages-api';
import { MessageSettings } from '../features/messages/message-settings';

const linkClass = 'inline-flex min-h-11 items-center font-medium text-primary-text underline underline-offset-4';
const roles = { PATIENT: 'Paciente', PSICOLOGIA: 'Psicóloga', PSIQUIATRIA: 'Psiquiatra' };

export function MessagesPage({ settings = false }: { settings?: boolean }) {
  const { data: user } = useSession();
  const { linkId } = useParams();
  if (!user) return null;
  if (!user.privacyAreas.messages) {
    return <PrivacyConsentGate area="messages" audience={user.profiles.patient ? 'patient' : 'therapist'} />;
  }
  if (settings) return <MessageSettings key={user.id} userId={user.id} />;
  return <Conversations key={user.id} userId={user.id} linkId={linkId} />;
}

function Conversations({ userId, linkId }: { userId: string; linkId?: string }) {
  const list = useQuery({
    queryKey: ['messages', userId, 'conversations'],
    queryFn: ({ signal }) => fetchConversations(signal),
    retry: false,
    gcTime: 0,
    refetchInterval: 15000,
  });
  const current = list.data?.find((item) => item.id === linkId);
  const status = list.isError ? getApiError(list.error).status : null;
  const canUseList = list.data && status !== 401 && status !== 403;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Mensagens</h1>
      <p className="text-muted">
        Use este espaço para combinar detalhes da consulta e tirar dúvidas breves. Combinem entre vocês
        os horários de contato. A resposta depende da disponibilidade de cada pessoa.
      </p>
      <Alert tone="attention">Este canal não atende urgências. Em uma emergência, procure atendimento de urgência.</Alert>
      {linkId ? <Link className={linkClass} to="/mensagens">Voltar às conversas</Link>
        : <Link className={linkClass} to="/mensagens/avisos">Configurar avisos de mensagens</Link>}
      {list.isPending && <p role="status">Carregando conversas…</p>}
      {list.isError && <Alert tone="attention">{getApiError(list.error).message}</Alert>}
      {canUseList && (linkId
        ? current?.available
          ? <ConversationThread key={linkId} conversation={current} userId={userId} />
          : <Alert tone="attention">Esta conversa não está disponível. É preciso ter vínculo ativo e os dois aceites do aviso de privacidade.</Alert>
        : list.data.length === 0
          ? <p className="text-muted">Suas conversas aparecem aqui quando houver um vínculo ativo.</p>
          : (
              <ul className="flex flex-col gap-2">
                {list.data.map((item) => (
                  <li key={item.id} className="min-w-0 rounded-lg border border-border bg-surface p-3 wrap-anywhere">
                    {item.available
                      ? <Link className={linkClass} to={`/mensagens/${item.id}`}>{item.name}</Link>
                      : <p className="font-medium">{item.name}</p>}
                    <p className="text-sm text-muted">{roles[item.counterpart]}</p>
                    {!item.available && <p className="text-sm text-muted">A conversa abre quando os dois aceitarem o aviso de privacidade.</p>}
                  </li>
                ))}
              </ul>
            ))}
    </section>
  );
}

function ConversationThread({ conversation, userId }: { conversation: Conversation; userId: string }) {
  const [body, setBody] = useState('');
  const [newTopic, setNewTopic] = useState<MessageTopic | null>(null);
  const [replyTopic, setReplyTopic] = useState<MessageTopic | null>(null);
  const [fieldError, setFieldError] = useState('');
  const exportRequest = useRef<AbortController | null>(null);
  const composer = useRef<HTMLFormElement>(null);
  const cache = useQueryClient();
  const id = conversation.id;
  const queryKey = ['messages', userId, 'thread', id];
  const thread = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchMessages(id, pageParam, signal),
    getNextPageParam: (last) => last.next ?? undefined,
    gcTime: 0,
    retry: false,
    refetchInterval: 15000,
  });
  // A primeira página vem do mais recente para o mais antigo.
  const previousTopic = thread.data?.pages[0]?.messages[0]?.topic;
  const topic = newTopic ?? replyTopic ?? previousTopic ?? 'LOGISTICA';
  const choosingTopic = previousTopic === undefined || newTopic !== null;
  const send = useMutation({
    mutationFn: (input: { topic: MessageTopic; body: string }) => sendMessage(id, input),
    gcTime: 0,
    onSuccess: () => setBody(''),
    onSettled: async (_data, error) => {
      await cache.invalidateQueries({ queryKey });
      if (!error) {
        setNewTopic(null);
        setReplyTopic(null);
      }
    },
  });
  useEffect(() => () => exportRequest.current?.abort(), []);
  const canDownload = thread.isSuccess && thread.data.pages.some((page) => page.messages.length > 0);
  useEffect(() => {
    if (!canDownload) exportRequest.current?.abort();
  }, [canDownload]);
  const download = useMutation({
    mutationFn: async () => {
      const controller = new AbortController();
      exportRequest.current = controller;
      const rows: Message[] = [];
      let before: string | undefined;
      do {
        const page = await fetchMessages(id, before, controller.signal);
        rows.push(...page.messages);
        before = page.next ?? undefined;
      } while (before);
      if (controller.signal.aborted) return;
      const file = new Blob([JSON.stringify({ mensagens: rows.reverse().map((row) => ({
        remetente: row.mine ? 'Você' : conversation.name,
        assunto: messageTopics[row.topic],
        texto: row.body,
        enviadoEmUtc: row.createdAt,
      })) }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'faisca-conversa.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    gcTime: 0,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const length = body.trim().length;
    if (!length || length > MESSAGE_LIMIT) {
      setFieldError(length ? 'A mensagem pode ter até 2.000 caracteres.' : 'Escreva uma mensagem antes de enviar.');
      return;
    }
    send.mutate({ topic, body: body.trim() });
  }

  const messages = thread.data?.pages.flatMap((page) => page.messages).reverse() ?? [];
  return (
    <section aria-labelledby="conversation-heading" className="flex min-w-0 flex-col gap-3">
      <h2 id="conversation-heading" className="text-2xl font-semibold wrap-anywhere">Conversa com {conversation.name}</h2>
      {thread.isPending && <p role="status">Carregando mensagens…</p>}
      {thread.isError && <Alert tone="attention">{getApiError(thread.error).message}</Alert>}
      {thread.isSuccess && (
        <>
          <Button variant="secondary" className="self-start" onClick={() => composer.current?.querySelector('textarea')?.focus()}>
            Ir para escrever mensagem
          </Button>
          {thread.hasNextPage && <Button variant="secondary" disabled={thread.isFetching}
            onClick={() => void thread.fetchNextPage()} className="self-start">Ver mensagens anteriores</Button>}
          {messages.length === 0 && <p className="text-muted">Ainda não há mensagens nesta conversa.</p>}
          <ol aria-label="Histórico de mensagens" className="flex flex-col gap-2">
            {messages.map((message) => (
              <li key={message.id} className={`w-fit max-w-[95%] rounded-lg border border-border bg-surface p-3 ${message.mine ? 'self-end' : ''}`}>
                <p className="text-sm text-muted wrap-anywhere">
                  {message.mine ? 'Você' : conversation.name} · {messageTopics[message.topic]} ·{' '}
                  <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
                </p>
                <p className="whitespace-pre-wrap wrap-anywhere">{message.body}</p>
              </li>
            ))}
          </ol>
          <form ref={composer} className="flex flex-col gap-3" onSubmit={submit} noValidate>
            {previousTopic && (
              <div className="flex flex-wrap items-center gap-x-2">
                {!choosingTopic && <p className="text-muted">Respondendo sobre <strong>{messageTopics[topic]}</strong></p>}
                <Button variant="ghost" disabled={send.isPending} aria-expanded={choosingTopic}
                  onClick={() => setNewTopic(choosingTopic ? null : topic)}>
                  {choosingTopic ? 'Manter assunto anterior' : 'Mudar de assunto'}
                </Button>
              </div>
            )}
            {choosingTopic && (
              <label className="flex flex-col gap-1.5 font-medium">
                Assunto
                <select className={`${fieldClasses} min-h-11`} value={topic} disabled={send.isPending}
                  onChange={(event) => setNewTopic(event.target.value === 'DUVIDA' ? 'DUVIDA' : 'LOGISTICA')}>
                  <option value="LOGISTICA">{messageTopics.LOGISTICA}</option>
                  <option value="DUVIDA">{messageTopics.DUVIDA}</option>
                </select>
              </label>
            )}
            <TextAreaField label="Mensagem" value={body} limit={MESSAGE_LIMIT} error={fieldError}
              disabled={send.isPending} onChange={(event) => {
                const value = event.target.value;
                setBody(value);
                setReplyTopic(value.trim() ? replyTopic ?? previousTopic ?? 'LOGISTICA' : null);
                setFieldError('');
              }} />
            {send.isError && <Alert tone="attention">{getApiError(send.error).message}</Alert>}
            <p role="status">{send.isSuccess ? 'Mensagem enviada.' : ''}</p>
            <Button type="submit" disabled={send.isPending} className="self-start">Enviar mensagem</Button>
          </form>
          {canDownload && <Button variant="secondary" disabled={download.isPending}
            onClick={() => download.mutate()} className="self-start">Baixar cópia da conversa</Button>}
          {download.isError && <Alert tone="attention">{getApiError(download.error).message}</Alert>}
        </>
      )}
    </section>
  );
}
