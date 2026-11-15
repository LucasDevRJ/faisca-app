import { useState, type FormEvent } from 'react';
import { DialogForm, DialogActions } from '../../components/ui/dialog';
import { TextField, TextAreaField } from '../../components/ui/text-field';
import { fieldClasses, choiceCardClasses } from '../../components/ui/field-styles';
import { Alert } from '../../components/ui/alert';
import { useLinkStatus } from '../links/use-links';
import { getApiError } from '../auth/auth-api';
import { RESPONSE_LABELS } from './task-labels';
import type { Task, TaskInput, TaskResponseInput, TaskResponseStatus } from './tasks-api';

type Common = { pending: boolean; error: unknown; onCancel: () => void };
export function TaskForm({ task, pending, error, onCancel, onSubmit }: Common & { task?: Task; onSubmit: (input: TaskInput) => void }) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [agreedLinkId, setLink] = useState(task?.agreedLinkId ?? '');
  const [invalid, setInvalid] = useState(false);
  const links = useLinkStatus();
  const active = links.data?.links ?? [];
  const apiError = error ? getApiError(error) : null;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setInvalid(true);
    if (!description.trim() || description.trim().length > 5000 || title.trim().length > 120) return;
    onSubmit({ title: title.trim() || null, description: description.trim(), agreedLinkId: agreedLinkId || null });
  }
  return <DialogForm onSubmit={submit} error={apiError?.message ?? null}>
    <TextField label="Título" hint="Opcional, até 120 caracteres." value={title} onChange={(e) => setTitle(e.target.value)} error={invalid && title.trim().length > 120 ? 'Use até 120 caracteres.' : apiError?.fields?.title} />
    <TextAreaField label="O que ficou combinado?" value={description} onChange={(e) => setDescription(e.target.value)} limit={5000} rows={5} error={invalid && (!description.trim() || description.trim().length > 5000) ? 'Escreva de 1 a 5.000 caracteres.' : apiError?.fields?.description} />
    <label className="flex flex-col gap-1.5 font-medium">Combinada com
      <select className={`min-h-11 ${fieldClasses}`} value={agreedLinkId} onChange={(e) => setLink(e.target.value)}>
        <option value="">Não informar</option>
        {agreedLinkId && !active.some((link) => link.id === agreedLinkId) && <option value={agreedLinkId}>Vínculo anterior</option>}
        {active.map((link) => <option key={link.id} value={link.id}>{link.therapist.name}</option>)}
      </select>
      <span className="text-sm font-normal text-muted">Opcional. Essa escolha não altera o compartilhamento da área Tarefas.</span>
    </label>
    {links.isError && <Alert tone="attention">Não conseguimos carregar as profissionais vinculadas. Você pode salvar sem informar.</Alert>}
    <DialogActions submitLabel="Salvar tarefa" pending={pending} onCancel={onCancel} />
  </DialogForm>;
}
export function TaskResponseForm({ task, pending, error, onCancel, onSubmit }: Common & { task: Task; onSubmit: (input: TaskResponseInput) => void }) {
  const [status, setStatus] = useState<TaskResponseStatus>(task.responseStatus ?? 'RESPONDIDA');
  const [text, setText] = useState(task.responseText ?? '');
  const [invalid, setInvalid] = useState(false);
  const apiError = error ? getApiError(error) : null;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setInvalid(true);
    if ((status === 'RESPONDIDA' && !text.trim()) || text.trim().length > 10000) return;
    onSubmit({ responseStatus: status, responseText: text.trim() || null });
  }
  return <DialogForm onSubmit={submit} error={apiError?.message ?? null}>
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-medium">Como você quer responder?</legend>
      {(Object.keys(RESPONSE_LABELS) as TaskResponseStatus[]).map((value) => <label key={value} className={`flex min-h-11 items-center gap-3 p-3 ${choiceCardClasses}`}>
        <input type="radio" name="task-response" value={value} checked={status === value} onChange={() => setStatus(value)} />
        <span>{value === 'RESPONDIDA' ? 'Responder' : RESPONSE_LABELS[value]}</span>
      </label>)}
    </fieldset>
    <TextAreaField label={status === 'RESPONDIDA' ? 'Quer escrever sobre a tarefa?' : status === 'NAO_CONSEGUI' ? 'Quer contar o que aconteceu?' : 'Quer comentar?'} hint={status === 'RESPONDIDA' ? undefined : 'Opcional.'} value={text} onChange={(e) => setText(e.target.value)} rows={8} limit={10000} error={invalid && ((status === 'RESPONDIDA' && !text.trim()) || text.trim().length > 10000) ? 'Escreva sua resposta em até 10.000 caracteres.' : apiError?.fields?.responseText} />
    <p className="text-sm text-muted">Você pode editar a resposta até a próxima consulta. Sem consulta marcada, não há prazo.</p>
    <DialogActions submitLabel="Salvar resposta" pending={pending} onCancel={onCancel} />
  </DialogForm>;
}
