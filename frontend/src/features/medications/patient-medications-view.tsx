import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { getApiError } from '../auth/auth-api';
import { PrivacyConsentGate } from '../auth/privacy-consent';
import type { MedicationsData } from './medications-api';
import { MedicationList, SymptomList } from './medications-lists';
import type { UseQueryResult } from '@tanstack/react-query';

// "Remédios e o que sente" na aba Sono e humor da profissional (DEC-115): só leitura, em terceira
// pessoa, com a caixa "Remédios e o que sinto" liberada. O Faísca não avalia nada do que foi anotado.
export function PatientMedicationsView({
  firstName,
  consented,
  query,
}: {
  firstName: string;
  consented: boolean;
  query: UseQueryResult<MedicationsData, unknown>;
}) {
  const title = (
    <div className="flex flex-col gap-1">
      <h3 id="patient-medications-title" className="text-xl font-semibold">
        Remédios e o que sente
      </h3>
      <p className="text-sm text-muted">Anotações de {firstName}, sem avaliação do Faísca.</p>
    </div>
  );

  if (!consented || (query.isError && getApiError(query.error).code === 'PRIVACY_CONSENT_REQUIRED')) {
    return (
      <section aria-labelledby="patient-medications-title" className="flex flex-col gap-3">
        {title}
        <PrivacyConsentGate area="medications" audience="therapist" />
      </section>
    );
  }

  return (
    <section aria-labelledby="patient-medications-title" className="flex flex-col gap-3">
      {title}
      {query.isPending ? (
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      ) : query.isError ? (
        <Alert tone="attention">
          <div className="flex flex-col gap-3">
            <p>Não conseguimos carregar os remédios. Confira sua conexão e tente de novo.</p>
            <div>
              <Button variant="secondary" onClick={() => query.refetch()}>
                Tentar de novo
              </Button>
            </div>
          </div>
        </Alert>
      ) : query.data.medications.length === 0 && query.data.symptoms.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
          {firstName} não anotou remédios nem o que tem sentido.
        </p>
      ) : (
        <>
          {query.data.medications.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="font-semibold">Remédios</h4>
              <MedicationList medications={query.data.medications} audience="therapist" />
            </div>
          )}
          {query.data.symptoms.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="font-semibold">O que tem sentido</h4>
              <SymptomList audience="therapist" symptoms={query.data.symptoms} medications={query.data.medications} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
