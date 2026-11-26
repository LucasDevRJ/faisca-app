import { useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogActions, DialogForm } from '../../components/ui/dialog';
import { FieldError } from '../../components/ui/field-error';
import { choiceCardClasses } from '../../components/ui/field-styles';
import { TextAreaField } from '../../components/ui/text-field';
import { getApiError } from '../auth/auth-api';
import {
  TEAM_CONTACT_MESSAGE_MAX,
  TEAM_CONTACT_MESSAGE_MIN,
  type TeamContactTopic,
} from './profile-api';
import { useSendTeamContact } from './use-profile';

const TOPIC_OPTIONS: ReadonlyArray<{ topic: TeamContactTopic; label: string }> = [
  { topic: 'SUGESTAO', label: 'Sugestão' },
  { topic: 'PROBLEMA', label: 'Problema' },
  { topic: 'DUVIDA', label: 'Dúvida' },
  { topic: 'REVISAO_TEXTOS', label: 'Revisão de textos' },
];

// "Fale com a equipe" em Conta, para quem acompanha pacientes (#332, DEC-142).
// A mensagem vai por e-mail para suporte@minhafaisca.com.br com reply-to da profissional,
// sem ficar guardada no banco.
export function TeamContactSection({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [sentMessage, setSentMessage] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);

  function closeDialog(focusTrigger = true) {
    setOpen(false);
    if (focusTrigger) {
      queueMicrotask(() => triggerRef.current?.focus());
    }
  }

  return (
    <section aria-labelledby="team-contact-title" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 id="team-contact-title" className="text-xl font-semibold">
        Fale com a equipe
      </h2>
      <p className="text-muted">
        Canal direto com quem cuida do Faísca para enviar sugestões, relatar problemas, tirar dúvidas ou revisar textos do app.
      </p>
      <div>
        <Button
          ref={triggerRef}
          variant="secondary"
          onClick={() => {
            setSentMessage('');
            setOpen(true);
          }}
        >
          Escrever para a equipe
        </Button>
        <p role="status" className="text-sm text-muted not-empty:mt-2">
          {sentMessage}
        </p>
      </div>
      {open && (
        <TeamContactDialog
          email={email}
          onClose={() => closeDialog(true)}
          onSent={() => {
            setSentMessage(`Mensagem enviada. A equipe responderá por e-mail em ${email}.`);
            closeDialog(true);
          }}
        />
      )}
    </section>
  );
}

function TeamContactDialog({
  email,
  onClose,
  onSent,
}: {
  email: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const send = useSendTeamContact();
  const [topic, setTopic] = useState<TeamContactTopic | null>(null);
  const [message, setMessage] = useState('');
  const [topicError, setTopicError] = useState<string>();
  const [messageError, setMessageError] = useState<string>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let hasError = false;

    if (!topic) {
      setTopicError('Escolha o assunto da mensagem.');
      hasError = true;
    } else {
      setTopicError(undefined);
    }

    const trimmed = message.trim();
    if (trimmed.length < TEAM_CONTACT_MESSAGE_MIN) {
      setMessageError(`Escreva pelo menos ${TEAM_CONTACT_MESSAGE_MIN} caracteres.`);
      hasError = true;
    } else if (trimmed.length > TEAM_CONTACT_MESSAGE_MAX) {
      setMessageError(`A mensagem pode ter até ${TEAM_CONTACT_MESSAGE_MAX} caracteres.`);
      hasError = true;
    } else {
      setMessageError(undefined);
    }

    if (hasError || !topic) return;

    send.mutate(
      { topic, message: trimmed },
      { onSuccess: onSent },
    );
  }

  const apiError = send.error ? getApiError(send.error) : null;
  const effectiveTopicError = topicError ?? apiError?.fields.topic;
  const effectiveMessageError = messageError ?? apiError?.fields.message;

  return (
    <Dialog
      title="Fale com a equipe"
      description={
        <span>
          A resposta vai por e-mail para <strong className="break-all text-text">{email}</strong>. Pode levar alguns dias.
        </span>
      }
      onClose={onClose}
    >
      <div className="rounded-md border border-border bg-bg p-3 text-sm text-text">
        <p className="font-medium">
          Não escreva nomes nem dados dos seus pacientes. Para falar de um registro, descreva a tela, sem o conteúdo.
        </p>
      </div>
      <DialogForm
        onSubmit={handleSubmit}
        error={apiError && !apiError.fields.topic && !apiError.fields.message ? apiError.message : null}
      >
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={effectiveTopicError ? 'team-contact-topic-error' : undefined}
        >
          <legend className="mb-1 font-medium">Qual é o assunto?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TOPIC_OPTIONS.map((option) => (
              <label
                key={option.topic}
                className={`flex min-h-11 items-center gap-3 p-3 has-focus-visible:outline-2 has-focus-visible:outline-primary ${choiceCardClasses}`}
              >
                <input
                  type="radio"
                  name="team-contact-topic"
                  checked={topic === option.topic}
                  onChange={() => {
                    setTopic(option.topic);
                    setTopicError(undefined);
                  }}
                  aria-invalid={effectiveTopicError ? true : undefined}
                />
                <span className="font-medium">{option.label}</span>
              </label>
            ))}
          </div>
          {effectiveTopicError && <FieldError id="team-contact-topic-error">{effectiveTopicError}</FieldError>}
        </fieldset>

        <TextAreaField
          label="Sua mensagem"
          rows={5}
          value={message}
          limit={TEAM_CONTACT_MESSAGE_MAX}
          onChange={(event) => {
            setMessage(event.target.value);
            if (messageError) setMessageError(undefined);
          }}
          error={effectiveMessageError}
        />

        <DialogActions
          submitLabel="Enviar mensagem"
          pendingLabel="Enviando…"
          pending={send.isPending}
          onCancel={onClose}
        />
      </DialogForm>
    </Dialog>
  );
}
