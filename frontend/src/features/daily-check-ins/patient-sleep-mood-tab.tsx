import { skipToken, useQuery } from '@tanstack/react-query';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { formatDayHeading } from '../activities/week';
import type { DateRange } from '../appointments/appointments-api';
import { getApiError } from '../auth/auth-api';
import { PrivacyConsentGate } from '../auth/privacy-consent';
import { changeMarkers } from '../medications/medication-labels';
import { PatientMedicationsView } from '../medications/patient-medications-view';
import { usePatientMedications } from '../medications/use-medications';
import { checkInSummary } from './check-in-labels';
import { fetchPatientCheckIns } from './daily-check-ins-api';
import { SleepMoodChart } from './sleep-mood-chart';

// Aba "Sono e humor" na visão da profissional (DEC-108, DEC-115): só leitura, sem "Lido". Mostra o
// sono, o humor e o remédio do dia com as caixas Sono e humor ou Remédio, e os remédios e o que o
// paciente sente com a caixa "Remédios e o que sinto". A API já tira o que a caixa fechada mostraria.
export function PatientSleepMoodTab({
  patientId,
  firstName,
  consented,
  medicationsConsented,
  showCheckIns,
  showMedications,
  range,
  ready,
}: {
  patientId: string;
  firstName: string;
  consented: boolean;
  medicationsConsented: boolean;
  showCheckIns: boolean;
  showMedications: boolean;
  range: DateRange;
  ready: boolean;
}) {
  const medications = usePatientMedications(patientId, showMedications && medicationsConsented);
  // As linhas das mudanças no gráfico só com as duas caixas: o sono e humor e os remédios.
  const markers = showCheckIns && medications.isSuccess ? changeMarkers(medications.data.medications, range) : [];

  return (
    <div className="flex flex-col gap-6">
      {showCheckIns && (
        <CheckIns
          patientId={patientId}
          firstName={firstName}
          consented={consented}
          range={range}
          ready={ready}
          markers={markers}
        />
      )}
      {showMedications && (
        <PatientMedicationsView firstName={firstName} consented={medicationsConsented} query={medications} />
      )}
    </div>
  );
}

function CheckIns({
  patientId,
  firstName,
  consented,
  range,
  ready,
  markers,
}: {
  patientId: string;
  firstName: string;
  consented: boolean;
  range: DateRange;
  ready: boolean;
  markers: { date: string; label: string }[];
}) {
  const query = useQuery({
    queryKey: ['therapist', patientId, 'daily-check-ins', range.from, range.to],
    queryFn: consented && ready ? () => fetchPatientCheckIns(patientId, range) : skipToken,
    retry: (count, error) => getApiError(error).status !== 403 && count < 1,
  });

  if (!consented || (query.isError && getApiError(query.error).code === 'PRIVACY_CONSENT_REQUIRED')) {
    return <PrivacyConsentGate area="sleepMood" audience="therapist" />;
  }
  if (query.isPending) {
    return (
      <p className="text-muted" aria-busy="true">
        Carregando…
      </p>
    );
  }
  if (query.isError) {
    return (
      <Alert tone="attention">
        <div className="flex flex-col gap-3">
          <p>Não conseguimos carregar este período. Confira sua conexão e tente de novo.</p>
          <div>
            <Button variant="secondary" onClick={() => query.refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      </Alert>
    );
  }

  const checkIns = query.data;
  if (checkIns.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
        {firstName} não registrou sono, humor nem remédio neste período.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface p-4 shadow-soft">
        <SleepMoodChart points={checkIns} markers={markers} />
      </div>
      <ol className="flex flex-col gap-3">
        {[...checkIns].reverse().map((checkIn) => (
          <li key={checkIn.date} className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface p-4 shadow-soft">
            <h3 className="font-semibold first-letter:uppercase">{formatDayHeading(checkIn.date)}</h3>
            <p className="break-words text-muted">{checkInSummary(checkIn, 'therapist')}</p>
            {checkIn.moodWord && <p className="break-words">“{checkIn.moodWord}”</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
