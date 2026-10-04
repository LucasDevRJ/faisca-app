import { Link } from 'react-router';
import { Alert } from '../components/ui/alert';
import { getApiError } from '../features/auth/auth-api';
import { formatDate } from '../features/links/link-format';
import { RedeemCodeForm } from '../features/links/redeem-code-form';
import { useLinkedPatients } from '../features/links/use-links';
import { PrivacyUpdateBanner } from '../features/auth/privacy-consent';
import { statusBadge } from '../features/appointments/agenda-format';
import type { LinkedPatient } from '../features/links/links-api';
import { usePatientSummary } from '../features/therapist/use-therapist';

// Selo da agenda (DEC-045): "em pausa", "encerrada" ou "sem agenda". Vem do resumo de cada
// paciente, que já passa pela checagem de vínculo; se não carregar, o item só fica sem selo.
function AgendaBadge({ patientId }: { patientId: string }) {
  const { data } = usePatientSummary(patientId);
  const badge = data ? statusBadge(data.agendaStatus, data.pause, data.today) : null;
  if (!badge) return null;
  return <span className="self-start rounded-full border border-border px-2 py-0.5 text-sm text-muted">{badge}</span>;
}

function PatientItem({ patient }: { patient: LinkedPatient }) {
  return (
    <li>
      <Link
        to={`/pacientes/${patient.id}`}
        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft transition hover:border-primary"
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-lg font-semibold text-primary-text">{patient.name}</span>
          <span className="break-all text-muted">{patient.email}</span>
          <span className="text-sm text-muted">Vinculado desde {formatDate(patient.linkedAt)}</span>
          <AgendaBadge patientId={patient.id} />
        </span>
        <span aria-hidden="true" className="text-2xl text-muted">
          ›
        </span>
      </Link>
    </li>
  );
}

// "Meus pacientes" (SPEC, "Visão da terapeuta"): o campo de código e a lista de quem tem
// vínculo ativo. Cada item leva aos registros do paciente (/pacientes/:id, DEC-033).
export function PatientsPage() {
  const patients = useLinkedPatients();

  return (
    <>
      <h1 className="text-4xl font-bold">Meus pacientes</h1>
      <PrivacyUpdateBanner />

      <RedeemCodeForm />

      <section aria-labelledby="patients-title" className="flex flex-col gap-3">
        <h2 id="patients-title" className="text-2xl font-semibold">
          Vinculados
        </h2>
        {patients.isPending && <p className="text-muted">Carregando…</p>}
        {patients.isError && <Alert tone="attention">{getApiError(patients.error).message}</Alert>}
        {patients.data?.length === 0 && (
          <p className="text-muted">
            Ninguém por aqui ainda. Quando um paciente compartilhar os registros com você, ele aparece nesta lista.
          </p>
        )}
        {patients.data && patients.data.length > 0 && (
          <ul className="flex flex-col gap-3">
            {patients.data.map((patient) => (
              <PatientItem key={patient.id} patient={patient} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
