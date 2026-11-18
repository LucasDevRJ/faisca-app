import type { ReactNode } from 'react';
import { LongText } from '../../components/ui/long-text';
import { RESPONSE_LABELS } from './task-labels';
import type { Task } from './tasks-api';
import { RecordLinksPanel } from '../record-links/record-links-panel';
export function TaskCard({ task, children, footer, patientId, readOnly = false }: { task: Task; children?: ReactNode; footer?: ReactNode; patientId?: string; readOnly?: boolean }) {
  return <article aria-labelledby={`task-${task.id}`} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft">
    <h2 id={`task-${task.id}`} className="text-lg font-semibold break-words">{task.title ?? 'Tarefa'}</h2>
    <LongText text={task.description} />
    {task.agreedWith && <p className="text-sm text-muted break-words">Combinada com {task.agreedWith.name}</p>}
    {task.responseStatus && <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="font-medium">{RESPONSE_LABELS[task.responseStatus]}</p>
      {task.responseText && <LongText text={task.responseText} />}
    </div>}
    {children}
    {footer}
    {(!readOnly || patientId) && <RecordLinksPanel type="TASK" id={task.id} readOnly={readOnly} patientId={patientId} />}
  </article>;
}
