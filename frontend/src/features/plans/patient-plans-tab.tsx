import { useState } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { getApiError } from '../auth/auth-api';
import { formatDayHeading } from '../activities/week';
import { PrivacyConsentGate } from '../auth/privacy-consent';
import { daysInRange, type DateRange } from '../therapist/period';
import { MarkAllRead, ReadControl } from '../therapist/read-control';
import { isPending } from '../therapist/read-marks-api';
import { useCreatePatientPlan, usePatientPlanEntries, usePatientPlans } from '../therapist/use-therapist';
import { inPeriod, type PeriodScope } from '../therapist/months-period';
import { PlanForm } from './plan-form';
import type { PlanInput } from './plans-api';
import { PlanEntryCard } from './plan-entry-card';

type PatientPlansTabProps = {
  patientId: string;
  firstName: string;
  consented: boolean;
  plans: ReturnType<typeof usePatientPlans>;
  // O plano escolhido fica na URL (?plano=...); sem ele, o primeiro ativo.
  selectedId: string | null;
  onSelect: (planId: string) => void;
  range: DateRange;
  ready: boolean;
  scope: PeriodScope;
  today: string;
  canCreate: boolean;
};

// Meus Planos do paciente (DEC-095, DEC-102): a psicóloga pode criar um plano; a terapeuta lê os
// planos existentes e os registros do período, com o "Lido" (DEC-057). A gestão fica com o paciente.
export function PatientPlansTab({
  patientId,
  firstName,
  consented,
  plans,
  selectedId,
  onSelect,
  range,
  ready,
  scope,
  today,
  canCreate,
}: PatientPlansTabProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const create = useCreatePatientPlan(patientId);
  const list = plans.data ?? [];
  const selected = list.find((plan) => plan.id === selectedId) ?? list.find((plan) => !plan.archived) ?? list[0];
  const entries = usePatientPlanEntries(patientId, consented && ready ? (selected?.id ?? null) : null, range);

  if (!consented) return <PrivacyConsentGate area="plans" audience="therapist" />;

  if (plans.isPending) {
    return (
      <p className="text-muted" aria-busy="true">
        Carregando os planos…
      </p>
    );
  }

  if (plans.isError) {
    return (
      <Alert tone="attention">
        <div className="flex flex-col gap-3">
          <p>Não conseguimos carregar os planos. Confira sua conexão e tente de novo.</p>
          <div>
            <Button variant="secondary" onClick={() => plans.refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      </Alert>
    );
  }

  if (!selected) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
          {firstName} ainda não criou nenhum plano.
        </p>
        {canCreate && (
          <CreatePlanAction
            firstName={firstName}
            open={createOpen}
            pending={create.isPending}
            error={create.error}
            notice={notice}
            onOpen={() => { create.reset(); setCreateOpen(true); }}
            onClose={() => { setCreateOpen(false); create.reset(); }}
            onSubmit={(input) => create.mutate(input, {
              onSuccess: () => { setCreateOpen(false); setNotice('Plano criado.'); },
            })}
          />
        )}
      </div>
    );
  }

  const records = entries.data ?? [];
  const recorded = new Set(records.map((entry) => entry.entryDate));
  const days = daysInRange(range).filter((day) => recorded.has(day));

  return (
    <>
      <p className="text-muted">
        {canCreate
          ? `Os planos de ação de ${firstName} e o que foi registrado em cada um. Você pode criar um plano; os existentes ficam só para leitura.`
          : `Os planos de ação de ${firstName} e o que foi registrado em cada um. Só leitura.`}
      </p>
      {canCreate && (
        <CreatePlanAction
          firstName={firstName}
          open={createOpen}
          pending={create.isPending}
          error={create.error}
          notice={notice}
          onOpen={() => { create.reset(); setCreateOpen(true); }}
          onClose={() => { setCreateOpen(false); create.reset(); }}
          onSubmit={(input) => create.mutate(input, {
            onSuccess: () => { setCreateOpen(false); setNotice('Plano criado.'); },
          })}
        />
      )}

      {list.length > 1 && (
        <div role="group" aria-label="Plano" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {list.map((plan) => (
            <Button
              key={plan.id}
              variant={plan.id === selected.id ? 'primary' : 'secondary'}
              aria-pressed={plan.id === selected.id}
              className="justify-start text-left break-words"
              onClick={() => onSelect(plan.id)}
            >
              {plan.title}
              {plan.archived && <span className="text-sm font-normal"> (encerrado)</span>}
            </Button>
          ))}
        </div>
      )}

      <section
        aria-labelledby="plan-title"
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-soft"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="plan-title" className="text-lg font-semibold break-words">
            {selected.title}
          </h3>
          {selected.archived && (
            <span className="rounded-full border border-border px-2 py-0.5 text-sm text-muted">Encerrado</span>
          )}
        </div>
        <details>
          <summary className="min-h-11 cursor-pointer content-center font-medium text-primary-text">
            Perguntas do plano
          </summary>
          <ol className="mt-1 flex list-decimal flex-col gap-1 pl-6">
            {selected.questions.map((question, index) => (
              <li key={index} className="break-words">
                {question}
              </li>
            ))}
          </ol>
        </details>
      </section>

      {entries.isPending && ready && (
        <p className="text-muted" aria-busy="true">
          Carregando os registros…
        </p>
      )}

      {entries.isError && (
        <Alert tone="attention">
          <div className="flex flex-col gap-3">
            <p>Não conseguimos carregar este período. Confira sua conexão e tente de novo.</p>
            <div>
              <Button variant="secondary" onClick={() => entries.refetch()}>
                Tentar de novo
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {entries.isSuccess && records.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
          Nenhum registro neste plano {inPeriod(scope)}.
        </p>
      )}

      {entries.isSuccess && records.length > 0 && (
        <>
          <MarkAllRead
            patientId={patientId}
            items={records.filter(isPending).map((entry) => ({ type: 'PLAN_ENTRY' as const, id: entry.id }))}
          />
          <ol className="flex flex-col gap-4 sm:gap-6">
            {days.map((day) => (
              <li key={day} className="flex flex-col gap-2 sm:gap-3">
                <h3 className="font-semibold first-letter:uppercase sm:text-lg">
                  {formatDayHeading(day)}
                  {day === today && (
                    <span className="ml-2 rounded-sm bg-primary px-2 py-0.5 text-sm font-medium text-on-primary">
                      hoje
                    </span>
                  )}
                </h3>
                <div className="flex flex-col gap-3">
                  {records
                    .filter((entry) => entry.entryDate === day)
                    .map((entry) => (
                      <PlanEntryCard
                        key={entry.id}
                        entry={entry}
                        readOnly
                        footer={
                          <ReadControl patientId={patientId} type="PLAN_ENTRY" record={entry} label={entry.planTitle} />
                        }
                      />
                    ))}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

function CreatePlanAction({
  firstName,
  open,
  pending,
  error,
  notice,
  onOpen,
  onClose,
  onSubmit,
}: {
  firstName: string;
  open: boolean;
  pending: boolean;
  error: unknown;
  notice: string | null;
  onOpen: () => void;
  onClose: () => void;
  onSubmit: (input: PlanInput) => void;
}) {
  const apiError = error ? getApiError(error) : null;
  return (
    <>
      <Button variant="secondary" className="self-start" onClick={onOpen}>
        Criar plano para {firstName}
      </Button>
      {notice && <p role="status" className="text-muted">{notice}</p>}
      {open && (
        <Dialog
          title={`Criar plano para ${firstName}`}
          description="O plano ficará nos registros do paciente. Ele poderá editar, encerrar ou apagar o plano."
          onClose={onClose}
          size="wide"
        >
          <PlanForm
            submitLabel="Criar plano"
            pending={pending}
            apiError={apiError}
            onCancel={onClose}
            onSubmit={onSubmit}
          />
        </Dialog>
      )}
    </>
  );
}
