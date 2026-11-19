import { useEffect, useRef, useState } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { getApiError } from '../auth/auth-api';
import { useSession } from '../auth/use-session';
import { needsPrivacyConsent } from '../thought-records/use-thought-records';
import {
  ChangeDialog,
  EndSymptomDialog,
  MedicationDialog,
  SymptomCheckDialog,
  SymptomDialog,
} from './medication-dialogs';
import type { Medication, MedicationChange, Symptom } from './medications-api';
import { MedicationList, SymptomList } from './medications-lists';
import { useMedications } from './use-medications';

type Open =
  | { kind: 'medication'; medication?: Medication }
  | { kind: 'change'; medication: Medication; change?: MedicationChange }
  | { kind: 'symptom'; symptom?: Symptom }
  | { kind: 'check'; symptom: Symptom }
  | { kind: 'end'; symptom: Symptom };

const emptyClass = 'rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted';

// "Meus remédios" e "O que tenho sentido" na aba Sono e humor (DEC-115). Só aparece para quem ligou
// "Anotar meus remédios e o que sinto" em Conta e aceitou a versão do aviso que cita os remédios.
export function MedicationsSection() {
  const { data: user } = useSession();
  const consented = Boolean(user?.privacyAreas.medications);
  const query = useMedications(consented);
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState('');
  const noticeRef = useRef<HTMLParagraphElement>(null);

  // Depois de salvar ou apagar, a janela fecha e o botão que a abriu pode sumir: o foco vai para o
  // aviso, que entra na tela, para quem está no celular ver a confirmação (revisor-telas).
  useEffect(() => {
    if (!notice || !noticeRef.current) return;
    noticeRef.current.focus();
    noticeRef.current.scrollIntoView?.({ block: 'nearest' });
  }, [notice]);

  if (!consented || (query.isError && needsPrivacyConsent(query.error))) return null;
  if (query.isPending) return null;
  if (query.isError) {
    return (
      <Alert tone="attention">
        <div className="flex flex-col gap-3">
          <p>{getApiError(query.error).message}</p>
          <div>
            <Button variant="secondary" onClick={() => query.refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      </Alert>
    );
  }
  if (!query.data.listsMedications) return null;

  const { medications, symptoms } = query.data;
  const done = (message: string) => {
    setOpen(null);
    setNotice(message);
  };
  const start = (next: Open) => {
    setNotice('');
    setOpen(next);
  };

  return (
    <>
      <p ref={noticeRef} tabIndex={-1} role="status" className="text-muted empty:hidden focus:outline-none">
        {notice}
      </p>

      <section aria-labelledby="my-medications-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="my-medications-title" className="text-2xl font-semibold">
            Meus remédios
          </h2>
          {medications.length > 0 && (
            <Button variant="secondary" onClick={() => start({ kind: 'medication' })}>
              Anotar remédio
            </Button>
          )}
        </div>
        {medications.length === 0 ? (
          <div className={`flex flex-col items-center gap-3 ${emptyClass}`}>
            <p>Anote os remédios que você toma, com a dose e o horário, para levar à consulta.</p>
            <Button onClick={() => start({ kind: 'medication' })}>Anotar remédio</Button>
          </div>
        ) : (
          <MedicationList
            medications={medications}
            audience="patient"
            actions={{
              onChange: (medication) => start({ kind: 'change', medication }),
              onEdit: (medication) => start({ kind: 'medication', medication }),
              onEditChange: (medication, change) => start({ kind: 'change', medication, change }),
            }}
          />
        )}
      </section>

      <section aria-labelledby="my-symptoms-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="my-symptoms-title" className="text-2xl font-semibold">
            O que tenho sentido
          </h2>
          {symptoms.length > 0 && (
            <Button variant="secondary" onClick={() => start({ kind: 'symptom' })}>
              Anotar o que estou sentindo
            </Button>
          )}
        </div>
        {symptoms.length === 0 ? (
          <div className={`flex flex-col items-center gap-3 ${emptyClass}`}>
            <p>Percebeu algo diferente no corpo ou no humor? Anote aqui, com a data, para conversar na consulta.</p>
            <Button onClick={() => start({ kind: 'symptom' })}>Anotar o que estou sentindo</Button>
          </div>
        ) : (
          <SymptomList
            audience="patient"
            symptoms={symptoms}
            medications={medications}
            actions={{
              onCheck: (symptom) => start({ kind: 'check', symptom }),
              onEnd: (symptom) => start({ kind: 'end', symptom }),
              onEdit: (symptom) => start({ kind: 'symptom', symptom }),
            }}
          />
        )}
      </section>

      {open?.kind === 'medication' && (
        <MedicationDialog medication={open.medication} onClose={() => setOpen(null)} onDone={done} />
      )}
      {open?.kind === 'change' && (
        <ChangeDialog medication={open.medication} change={open.change} onClose={() => setOpen(null)} onDone={done} />
      )}
      {open?.kind === 'symptom' && (
        <SymptomDialog symptom={open.symptom} medications={medications} onClose={() => setOpen(null)} onDone={done} />
      )}
      {open?.kind === 'check' && <SymptomCheckDialog symptom={open.symptom} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'end' && <EndSymptomDialog symptom={open.symptom} onClose={() => setOpen(null)} onDone={done} />}
    </>
  );
}
