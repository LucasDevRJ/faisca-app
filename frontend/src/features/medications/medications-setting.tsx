import { useState } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { choiceCardClasses } from '../../components/ui/field-styles';
import { getApiError } from '../auth/auth-api';
import { PrivacyConsentGate } from '../auth/privacy-consent';
import { useSession } from '../auth/use-session';
import { needsPrivacyConsent } from '../thought-records/use-thought-records';
import { useMedications, useMedicationsSettings } from './use-medications';

// "Anotar meus remédios e o que sinto" em Conta → Sono e humor (DEC-115). Desligar só esconde a seção:
// o que já foi anotado continua guardado. Quem vê é decidido na caixa de cada profissional.
export function MedicationsSetting() {
  const { data: user } = useSession();
  const consented = Boolean(user?.privacyAreas.medications);
  const query = useMedications(consented);
  const update = useMedicationsSettings();
  const [notice, setNotice] = useState('');
  const [consentOpen, setConsentOpen] = useState(false);

  if (!consented || (query.isError && needsPrivacyConsent(query.error))) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted">
          Para anotar seus remédios e o que tem sentido, leia e aceite o aviso de privacidade atualizado.
        </p>
        <div>
          <Button variant="secondary" onClick={() => setConsentOpen(true)}>
            Ler e aceitar
          </Button>
        </div>
        {consentOpen && (
          <Dialog title="Remédios e o que sinto" onClose={() => setConsentOpen(false)}>
            <PrivacyConsentGate
              area="medications"
              onCancel={() => setConsentOpen(false)}
              onAccepted={() => setConsentOpen(false)}
            />
          </Dialog>
        )}
      </div>
    );
  }
  if (query.isPending) {
    return (
      <p className="text-muted" aria-busy="true">
        Carregando…
      </p>
    );
  }
  if (query.isError) return <Alert tone="attention">{getApiError(query.error).message}</Alert>;

  return (
    <div className="flex flex-col gap-3">
      <label
        className={`flex min-h-11 items-start gap-3 p-3 has-focus-visible:outline-2 has-focus-visible:outline-primary ${choiceCardClasses}`}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          checked={query.data.listsMedications}
          disabled={update.isPending}
          aria-describedby="medications-setting-hint"
          onChange={(event) => {
            const next = event.target.checked;
            setNotice('');
            update.mutate(next, {
              onSuccess: () =>
                setNotice(
                  next
                    ? 'Os seus remédios e o que você sente vão aparecer na aba Sono e humor.'
                    : 'Os remédios e o que você sente saíram da aba Sono e humor. O que já foi anotado continua guardado.',
                ),
            });
          }}
        />
        <span className="flex flex-col gap-1">
          <span className="font-medium">Anotar meus remédios e o que sinto</span>
          <span id="medications-setting-hint" className="text-sm text-muted">
            Mostra, na aba Sono e humor, os seus remédios, as mudanças com data e o que você tem sentido. Desligar só
            esconde: o que você já anotou continua guardado. Você escolhe quem vê, na área “Remédios e o que sinto”
            de cada profissional, mais abaixo.
          </span>
        </span>
      </label>
      {update.isError && <Alert tone="attention">{getApiError(update.error).message}</Alert>}
      <p role="status" className="text-sm text-muted">
        {notice}
      </p>
    </div>
  );
}
