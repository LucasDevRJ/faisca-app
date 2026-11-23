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
  fetchConversations, fetchMessages, markConversationSeen, MESSAGE_LIMIT, messageTopics, sendMessage,
  type Conversation, type Message, type MessageRecord, type MessageTopic,
} from '../features/messages/messages-api';
import { MessageSettings } from '../features/messages/message-settings';
import { RecordLinkPicker } from '../features/record-links/record-link-picker';
import type { RecordSummary } from '../features/record-links/record-links-api';
import { formatRecordDate, recordLinkHref, TYPE_LABEL } from '../features/record-links/record-links-format';

const linkClass = 'inline-flex min-h-11 items-center font-medium text-primary-text underline underline-offset-4';
const roles = { PATIENT: 'Paciente', PSICOLOGIA: 'Psicóloga', PSIQUIATRIA: 'Psiquiatra' };

export function MessagesPage({ settings = false }: { settings?: boolean }) {
  const { data: user } = useSession();
  const { linkId } = useParams();
  if (!user) return null;
  if (!user.privacyAreas.messages) {
    return <PrivacyConsentGate area="messages" audience={user.profiles.patient ? 'patient' : 'therapist'} />;
  }
  if (settings) return <MessageSettings key={user.id} userId={user.id} professional={user.profiles.therapist} />;
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
      {/* Urgência (DEC-127): os números ficam à mão; no celular, um toque liga. */}
      <Alert tone="attention">
        Este canal não atende urgências. Se precisar de ajuda agora, ligue para o{' '}
        <a className="font-semibold underline underline-offset-4" href="tel:188">CVV, no 188</a>{' '}
        (apoio emocional, 24 horas, gratuito), ou para o{' '}
        <a className="font-semibold underline underline-offset-4" href="tel:192">SAMU, no 192</a>.
      </Alert>
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
                    <div className="flex flex-wrap items-center gap-2">
                      {item.available
                        ? <Link className={linkClass} to={`/mensagens/${item.id}`}>
                          {item.name}{item.unread && <span className="sr-only">, mensagem nova</span>}
                        </Link>
                        : <p className="font-medium">{item.name}</p>}
                      {item.unread && <span aria-hidden="true" className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">Nova</span>}
                    </div>
                    <p className="text-sm text-muted">{roles[item.counterpart]}</p>
                    {item.lastMessage && (
                      <p className="text-sm text-muted wrap-anywhere">
                        {item.lastMessage.mine ? 'Você: ' : ''}{item.lastMessage.preview}{' · '}
                        <time dateTime={item.lastMessage.createdAt}>{formatDateTime(item.lastMessage.createdAt)}</time>
                      </p>
                    )}
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
  // "Sobre um registro" (DEC-128): o registro escolhido para uma mensagem nova.
  const [pickedRecord, setPickedRecord] = useState<RecordSummary | null>(null);
  // Ao escolher, o foco vai para "Trocar registro"; ao cancelar, para o assunto (o seletor some).
  const topicSelect = useRef<HTMLSelectElement>(null);
  const changeRecord = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<'change' | 'topic' | null>(null);
  useEffect(() => {
    if (focusNext.current === 'change') changeRecord.current?.focus();
    // Sem o seletor de assunto na tela (voltou ao assunto anterior), o foco vai para a mensagem.
    if (focusNext.current === 'topic') (topicSelect.current ?? composer.current?.querySelector('textarea'))?.focus();
    focusNext.current = null;
  }, [pickedRecord, newTopic]);
  const [fieldError, setFieldError] = useState('');
  const exportRequest = useRef<AbortController | null>(null);
  const composer = useRef<HTMLDivElement>(null);
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
  const latest = thread.data?.pages[0]?.messages[0];
  // Responder "Sobre um registro" segue o mesmo registro, se ele ainda está disponível; senão, a
  // resposta vira uma dúvida breve.
  const latestRecord = latest?.topic === 'REGISTRO' && latest.record && !('unavailable' in latest.record) ? latest.record : null;
  const previousTopic: MessageTopic | undefined = latest?.topic === 'REGISTRO' && !latestRecord ? 'DUVIDA' : latest?.topic;
  const topic = newTopic ?? replyTopic ?? previousTopic ?? 'LOGISTICA';
  const choosingTopic = previousTopic === undefined || newTopic !== null;
  const send = useMutation({
    mutationFn: (input: Parameters<typeof sendMessage>[1]) => sendMessage(id, input),
    gcTime: 0,
    onSuccess: () => {
      setBody('');
      setPickedRecord(null);
    },
    onSettled: async (_data, error) => {
      await cache.invalidateQueries({ queryKey });
      if (!error) {
        setNewTopic(null);
        setReplyTopic(null);
      }
    },
  });
  useEffect(() => () => exportRequest.current?.abort(), []);
  // Abrir a conversa marca o "visto" até a mensagem mais recente (DEC-127), de novo quando chega
  // outra enquanto ela está aberta. Depois, o selo do menu e a lista se atualizam.
  const newestId = thread.data?.pages[0]?.messages[0]?.id;
  const seenId = useRef<string | null>(null);
  useEffect(() => {
    if (!newestId || seenId.current === newestId) return;
    seenId.current = newestId;
    markConversationSeen(id, newestId)
      .then(() => cache.invalidateQueries({ queryKey: ['messages', userId] }))
      .catch(() => { seenId.current = null; });
  }, [newestId, id, userId, cache]);
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
        ...(row.record && { registro: 'unavailable' in row.record ? 'Registro indisponível' : `${TYPE_LABEL[row.record.type]} de ${formatRecordDate(row.record.date)}` }),
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
    if (topic === 'REGISTRO') {
      const record = choosingTopic ? pickedRecord : latestRecord;
      if (!record) {
        setFieldError('Escolha o registro antes de enviar.');
        return;
      }
      send.mutate({ topic, body: body.trim(), record: { type: record.type, id: record.id } });
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
          {/* Só em conversa longa: com poucas mensagens, o campo já está à vista. */}
          {messages.length > 4 && <Button variant="secondary" className="self-start" onClick={() => composer.current?.querySelector('textarea')?.focus()}>
            Ir para escrever mensagem
          </Button>}
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
                {message.record && <RecordCard record={message.record} patientId={conversation.patientId} />}
                <p className="whitespace-pre-wrap wrap-anywhere">{message.body}</p>
              </li>
            ))}
          </ol>
          {/* O assunto e o seletor de registro ficam fora do formulário da mensagem: o seletor tem a
              própria busca, e um formulário dentro do outro dispararia o envio (revisor-telas). */}
          <div ref={composer} className="flex flex-col gap-3">
            {previousTopic && (
              <div className="flex flex-wrap items-center gap-x-2">
                {!choosingTopic && <p className="text-muted">Respondendo sobre <strong>{topic === 'REGISTRO' ? 'o registro' : messageTopics[topic]}</strong></p>}
                {!choosingTopic && topic === 'REGISTRO' && latestRecord && <RecordCard record={latestRecord} patientId={conversation.patientId} />}
                <Button variant="ghost" disabled={send.isPending} aria-expanded={choosingTopic}
                  onClick={() => setNewTopic(choosingTopic ? null : topic)}>
                  {choosingTopic ? 'Manter assunto anterior' : 'Mudar de assunto'}
                </Button>
              </div>
            )}
            {choosingTopic && (
              <label className="flex flex-col gap-1.5 font-medium">
                Assunto
                <select ref={topicSelect} className={`${fieldClasses} min-h-11`} value={topic} disabled={send.isPending}
                  onChange={(event) => {
                    const value = event.target.value;
                    setNewTopic(value === 'DUVIDA' || value === 'REGISTRO' ? value : 'LOGISTICA');
                    setPickedRecord(null);
                  }}>
                  <option value="LOGISTICA">{messageTopics.LOGISTICA}</option>
                  <option value="DUVIDA">{messageTopics.DUVIDA}</option>
                  {conversation.recordTopics && <option value="REGISTRO">{messageTopics.REGISTRO}</option>}
                </select>
              </label>
            )}
            {choosingTopic && topic === 'REGISTRO' && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">
                  Use para uma dúvida breve sobre o registro. O conteúdo em si vocês conversam na consulta.
                </p>
                {pickedRecord
                  ? <div className="flex flex-wrap items-center gap-2">
                    <RecordCard record={pickedRecord} />
                    <Button ref={changeRecord} variant="ghost" disabled={send.isPending} onClick={() => setPickedRecord(null)}>Trocar registro</Button>
                  </div>
                  : <section aria-labelledby={`${id}-qual-registro`} className="flex flex-col gap-2">
                    <h3 id={`${id}-qual-registro`} className="font-medium">Qual registro?</h3>
                    <RecordLinkPicker linkedKeys={NO_KEYS} busy={send.isPending} allowedTypes={conversation.recordTypes}
                      legend="Registros disponíveis" confirmLabel="Escolher"
                      onLink={(record) => { focusNext.current = 'change'; setPickedRecord(record); }}
                      onCancel={() => { focusNext.current = 'topic'; setNewTopic(previousTopic ?? 'LOGISTICA'); }} />
                  </section>}
              </div>
            )}
          <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
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
          </div>
          {canDownload && <Button variant="secondary" disabled={download.isPending}
            onClick={() => download.mutate()} className="self-start">Baixar cópia da conversa</Button>}
          {download.isError && <Alert tone="attention">{getApiError(download.error).message}</Alert>}
        </>
      )}
    </section>
  );
}

const NO_KEYS = new Set<string>();

// Cartão do registro apontado (DEC-128): tipo, data e começo do título, com o link para abrir. Sem
// acesso, ou registro apagado, só "Registro indisponível".
function RecordCard({ record, patientId }: { record: MessageRecord | RecordSummary; patientId?: string }) {
  if ('unavailable' in record) return <p className="text-sm text-muted">Registro indisponível</p>;
  return (
    <p className="text-sm wrap-anywhere">
      <span className="text-muted">Sobre: {TYPE_LABEL[record.type]} · {formatRecordDate(record.date)}</span>{' — '}
      <span>{record.title}</span>{' '}
      <Link className="font-medium text-primary-text underline underline-offset-4" to={recordLinkHref(record as RecordSummary, patientId)}>Abrir registro</Link>
    </p>
  );
}
