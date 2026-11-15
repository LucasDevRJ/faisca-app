import { useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Alert } from '../components/ui/alert';
import { Dialog, DialogForm, DialogActions } from '../components/ui/dialog';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { getApiError } from '../features/auth/auth-api';
import { needsPrivacyConsent } from '../features/thought-records/use-thought-records';
import { TaskCard } from '../features/tasks/task-card';
import { TaskForm, TaskResponseForm } from '../features/tasks/task-form';
import type { Task } from '../features/tasks/tasks-api';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask, useRespondTask } from '../features/tasks/use-tasks';
type Action = { kind: 'edit' | 'respond' | 'delete'; task: Task } | { kind: 'create' };
export function TasksPage() {
  const user = useSession();
  const consented = Boolean(user.data?.privacyAreas.tasks);
  const tasks = useTasks(consented);
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const create = useCreateTask(); const update = useUpdateTask(); const remove = useDeleteTask(); const respond = useRespondTask();
  function open(next: Action) { create.reset(); update.reset(); remove.reset(); respond.reset(); setAction(next); }
  function done(message: string) { setAction(null); setNotice(message); requestAnimationFrame(() => heading.current?.focus()); }
  const blocked = !consented || (tasks.isError && needsPrivacyConsent(tasks.error));
  return <>
    <section className="flex flex-col gap-2">
      <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold focus:outline-none sm:text-4xl">Tarefas</h1>
      <p className="text-muted sm:text-lg">Anote o que você combinou na consulta e responda no seu tempo.</p>
    </section>
    {blocked ? <PrivacyConsentGate area="tasks" /> : tasks.isError && getApiError(tasks.error).status === 403 ? <Alert tone="attention">Você não tem acesso a estas tarefas.</Alert> : <>
      <Button className="self-start" onClick={() => open({ kind: 'create' })}>Nova tarefa</Button>
      <p role="status" className="text-muted">{notice}</p>
      {tasks.isPending && <p aria-busy="true" className="text-muted">Carregando as tarefas…</p>}
      {tasks.isError && <Alert tone="attention">{getApiError(tasks.error).message}<Button variant="secondary" onClick={() => tasks.refetch()}>Tentar de novo</Button></Alert>}
      {tasks.isSuccess && tasks.data.length === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-muted">Você pode anotar aqui uma tarefa combinada na consulta.</p>}
      <div className="flex flex-col gap-4">{(tasks.data ?? []).map((task) => <TaskCard key={task.id} task={task}>
        {!task.respondedAt ? <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button onClick={() => open({ kind: 'respond', task })}>Responder<span className="sr-only"> {task.title ?? 'tarefa'}</span></Button>
          <Button variant="secondary" onClick={() => open({ kind: 'edit', task })}>Editar tarefa<span className="sr-only"> {task.title ?? ''}</span></Button>
          <Button variant="ghost" onClick={() => open({ kind: 'delete', task })}>Apagar tarefa<span className="sr-only"> {task.title ?? ''}</span></Button>
        </div> : task.responseEditable ? <Button variant="secondary" className="self-start" onClick={() => open({ kind: 'respond', task })}>Editar resposta<span className="sr-only"> {task.title ?? ''}</span></Button> : <p className="text-sm text-muted">Resposta final, guardada para o seu histórico.</p>}
      </TaskCard>)}</div>
    </>}
    {action && !blocked && <Dialog title={action.kind === 'create' ? 'Nova tarefa' : action.kind === 'edit' ? 'Editar tarefa' : action.kind === 'delete' ? 'Apagar esta tarefa?' : 'Responder à tarefa'} onClose={() => setAction(null)}>
      {action.kind === 'create' ? <TaskForm pending={create.isPending} error={create.error} onCancel={() => setAction(null)} onSubmit={(input) => create.mutate(input, { onSuccess: () => done('Tarefa salva.') })} />
        : action.kind === 'edit' ? <TaskForm task={action.task} pending={update.isPending} error={update.error} onCancel={() => setAction(null)} onSubmit={(input) => update.mutate({ id: action.task.id, input }, { onSuccess: () => done('Tarefa salva.') })} />
        : action.kind === 'respond' ? <TaskResponseForm task={action.task} pending={respond.isPending} error={respond.error} onCancel={() => setAction(null)} onSubmit={(input) => respond.mutate({ id: action.task.id, input }, { onSuccess: () => done('Resposta salva.') })} />
        : <DialogForm error={remove.error ? getApiError(remove.error).message : null} onSubmit={(e) => { e.preventDefault(); remove.mutate(action.task.id, { onSuccess: () => done('Tarefa apagada.') }); }}>
          <p>Esta tarefa ainda não tem resposta. Não dá para desfazer.</p>
          <DialogActions submitLabel="Apagar" pending={remove.isPending} onCancel={() => setAction(null)} />
        </DialogForm>}
    </Dialog>}
  </>;
}
