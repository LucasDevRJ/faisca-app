import { Alert } from '../components/ui/alert';
import { getApiError } from '../features/auth/auth-api';
import { formatDate } from '../features/links/link-format';
import { RedeemCodeForm } from '../features/links/redeem-code-form';
import { useLinkedPatients } from '../features/links/use-links';

// "Meus pacientes" (SPEC, "Visão da terapeuta"): o campo de código e a lista de quem tem
// vínculo ativo. Os registros de cada paciente chegam na etapa 4b.
export function PatientsPage() {
  const patients = useLinkedPatients();

  return (
    <>
      <h1 className="text-4xl font-bold">Meus pacientes</h1>

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
              <li
                key={patient.id}
                className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 shadow-soft"
              >
                <span className="text-lg font-semibold">{patient.name}</span>
                <span className="break-all text-muted">{patient.email}</span>
                <span className="text-sm text-muted">Vinculado desde {formatDate(patient.linkedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
