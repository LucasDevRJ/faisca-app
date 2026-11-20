import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { choiceCardClasses } from '../../components/ui/field-styles';
import { todayInAppZone } from '../activities/week';
import { getApiError } from '../auth/auth-api';
import { useSession } from '../auth/use-session';
import { useCheckIns, useCheckInSettings } from './use-daily-check-ins';
import { MedicationsSetting } from '../medications/medications-setting';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

// "Sono e humor" em Conta, só para quem é paciente (DEC-107, DEC-108): liga a pergunta "Tomou o
// remédio como combinado?". Desligar só esconde a pergunta; quem vê o remédio é decidido pela caixa
// Remédio de cada vínculo.
export function MedicationSettingSection() {
  const { data: user } = useSession();
  const consented = Boolean(user?.privacyAreas.sleepMood);
  const today = todayInAppZone();
  const query = useCheckIns({ from: today, to: today }, consented);
  const update = useCheckInSettings();
  const [notice, setNotice] = useState('');

  return (
    <section aria-labelledby="sleep-mood-settings-title" className="flex flex-col gap-3">
      <h2 id="sleep-mood-settings-title" className="text-2xl font-semibold">
        Sono e humor
      </h2>
      {!consented ? (
        <p className="text-muted">
          Para usar o Sono e humor, abra a aba{' '}
          <Link to="/sono-humor" className={linkClass}>
            Sono e humor
          </Link>{' '}
          e aceite o aviso de privacidade atualizado.
        </p>
      ) : query.isPending ? (
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      ) : query.isError ? (
        <Alert tone="attention">{getApiError(query.error).message}</Alert>
      ) : (
        <>
          <label
            className={`flex min-h-11 items-start gap-3 p-3 has-focus-visible:outline-2 has-focus-visible:outline-primary ${choiceCardClasses}`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={query.data.tracksMedication}
              disabled={update.isPending}
              aria-describedby="medication-setting-hint"
              onChange={(event) => {
                const next = event.target.checked;
                setNotice('');
                update.mutate(next, {
                  onSuccess: () =>
                    setNotice(next ? 'A pergunta do remédio vai aparecer no registro do dia.' : 'A pergunta do remédio saiu do registro do dia.'),
                });
              }}
            />
            <span className="flex flex-col gap-1">
              <span className="font-medium">Registrar se tomei o remédio</span>
              <span id="medication-setting-hint" className="text-sm text-muted">
                Acrescenta “Tomou o remédio como combinado?” no registro do dia. Essa pergunta guarda só se você tomou, sem nome nem dose; para anotar os remédios, use “Anotar meus remédios e o que sinto”, logo abaixo.
                Desligar só esconde a pergunta: o que você já respondeu continua guardado. Quem vê o remédio é você
                quem decide, na área Remédio de cada profissional, mais abaixo.
              </span>
            </span>
          </label>
          {update.isError && <Alert tone="attention">{getApiError(update.error).message}</Alert>}
          <p role="status" className="text-sm text-muted">
            {notice}
          </p>
          <MedicationsSetting />
        </>
      )}
    </section>
  );
}
