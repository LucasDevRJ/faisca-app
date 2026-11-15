import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PrivacyConsentGate } from '../auth/privacy-consent';
import { getApiError } from '../auth/auth-api';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { ReadControl } from '../therapist/read-control';
import type { WithRead } from '../therapist/read-marks-api';
import { THERAPIST_KEY } from '../therapist/use-therapist';
import { TaskCard } from './task-card';
import type { Task } from './tasks-api';
export function PatientTasksTab({ patientId, consented }: { patientId: string; consented: boolean }) {
  const query = useQuery({ queryKey: [...THERAPIST_KEY, patientId, 'tasks'], enabled: consented,
    queryFn: async () => (await api.get<{ tasks: WithRead<Task>[] }>(`/therapist/patients/${patientId}/tasks`)).data.tasks,
    retry: (count, error) => getApiError(error).status !== 403 && count < 1 });
  if (!consented || (query.isError && getApiError(query.error).code === 'PRIVACY_CONSENT_REQUIRED')) return <PrivacyConsentGate area="tasks" audience="therapist" />;
  if (query.isError && getApiError(query.error).status === 403) return <Alert tone="attention">Você não tem mais acesso a estas tarefas.</Alert>;
  return <>
    <p className="text-muted">Tarefas e respostas compartilhadas pelo paciente. Só leitura, de qualquer data.</p>
    {query.isPending && <p aria-busy="true">Carregando as tarefas…</p>}
    {query.isError && <Alert tone="attention">{getApiError(query.error).message}<Button variant="secondary" onClick={() => query.refetch()}>Tentar de novo</Button></Alert>}
    {query.isSuccess && query.data.length === 0 && <p className="text-muted">Ainda não há tarefas.</p>}
    {(query.data ?? []).map((task) => <TaskCard key={task.id} task={task} footer={task.respondedAt ? <ReadControl patientId={patientId} type="TASK" record={task} label={task.title ?? 'Tarefa'} /> : <p className="text-sm text-muted">Ainda sem resposta.</p>} />)}
  </>;
}
