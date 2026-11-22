import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { PrivacyConsentGate } from '../auth/privacy-consent';
import { useSession } from '../auth/use-session';
import { checkInSummary } from './check-in-labels';
import { CheckInDialog } from './check-in-dialog';
import { needsPrivacyConsent } from '../thought-records/use-thought-records';
import { useCheckIns } from './use-daily-check-ins';
import { SymptomDialog } from '../medications/medication-dialogs';
import { useMedications } from '../medications/use-medications';

// "Sono e humor de hoje" em Meus registros (DEC-108): o caminho rápido do dia a dia. Os outros dias
// e o gráfico ficam na aba Sono e humor. Sem cobrança: nada de "você não registrou ontem".
export function TodayCheckInCard({ today }: { today: string }) {
  const { data: user } = useSession();
  const consented = Boolean(user?.privacyAreas.sleepMood);
  const query = useCheckIns({ from: today, to: today }, consented);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  // "Anotar o que estou sentindo" (DEC-115), para quem ligou os remédios em Conta.
  const medications = useMedications(Boolean(user?.privacyAreas.medications));
  const [symptomOpen, setSymptomOpen] = useState(false);
  const checkIn = query.data?.checkIns.find((item) => item.date === today) ?? null;

  return (
    <section
      aria-labelledby="today-check-in-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id="today-check-in-title" className="font-semibold">
          Sono e humor de hoje
        </h2>
        <p className="break-words text-muted">
          {checkIn ? checkInSummary(checkIn) : 'Quer registrar como dormiu e como está o dia? Leva menos de um minuto.'}
        </p>
        <p role="status" className="text-sm text-muted">
          {notice}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {query.isError && !needsPrivacyConsent(query.error) ? (
          <Button variant="secondary" onClick={() => query.refetch()}>
            Tentar de novo
          </Button>
        ) : (
        <Button
          variant={checkIn ? 'secondary' : 'primary'}
          // Enquanto carrega, a janela ainda não tem o que mostrar (revisor-telas).
          disabled={consented && !query.isSuccess}
          onClick={() => {
            setNotice('');
            setOpen(true);
          }}
        >
          {checkIn ? 'Editar' : 'Registrar'}
          <span className="sr-only"> o sono e o humor de hoje</span>
        </Button>
        )}
        <Link
          to="/sono-humor"
          className="inline-flex min-h-11 items-center font-medium text-primary-text underline underline-offset-4"
        >
          Ver os outros dias
        </Link>
        {medications.data?.listsMedications && (
          <Button
            variant="ghost"
            className="px-0 underline"
            onClick={() => {
              setNotice('');
              setSymptomOpen(true);
            }}
          >
            Anotar o que estou sentindo
          </Button>
        )}
      </div>

      {open && !consented && (
        <Dialog title="Sono e humor" onClose={() => setOpen(false)}>
          <PrivacyConsentGate area="sleepMood" onCancel={() => setOpen(false)} onAccepted={() => undefined} />
        </Dialog>
      )}
      {open && consented && query.isSuccess && (
        <CheckInDialog
          date={today}
          checkIn={checkIn}
          tracksMedication={query.data.tracksMedication}
          onClose={() => setOpen(false)}
          onDone={(message) => {
            setOpen(false);
            setNotice(message);
          }}
        />
      )}
      {symptomOpen && medications.data && (
        <SymptomDialog
          medications={medications.data.medications}
          onClose={() => setSymptomOpen(false)}
          onDone={(message) => {
            setSymptomOpen(false);
            setNotice(message);
          }}
        />
      )}
    </section>
  );
}
