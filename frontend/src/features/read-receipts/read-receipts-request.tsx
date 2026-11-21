import { useId, useRef, useState } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { getApiError } from '../auth/auth-api';
import { PrivacyConsentGate } from '../auth/privacy-consent';
import { useSession } from '../auth/use-session';
import type { ListedPatient } from '../links/links-api';
import { firstName } from '../links/professional-labels';
import { useLinkedPatients, useSetReadReceiptsShared } from '../links/use-links';

// O lado da profissional no "Lido" para o paciente (DEC-117, DEC-118). A escolha é por paciente, e
// "Agora não" não chega ao paciente: para ele, o pedido continua enviado.

// Sem "dele" ou "dela": o gênero do paciente não é informado, então o texto usa o nome.
function explain(name: string): string {
  return `Se ativar, aparece nos registros de ${name} a data em que você marcou cada um como lido. ${name} nunca vê o que falta ler e não fica sabendo se você escolher “Agora não”.`;
}

function answered(name: string, shared: boolean): string {
  return shared
    ? `Ativado. ${name} passa a ver a data em que você marca um registro como lido.`
    : `Tudo bem. Para ${name}, o pedido continua como enviado. Dá para ativar depois, na página de ${name}.`;
}

// Sem o aceite da versão do aviso que cita o recurso, a resposta passa antes pelo aceite.
function ConsentFirst({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="text-sm text-muted">Para responder, leia e aceite o aviso de privacidade atualizado.</p>
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Ler e aceitar<span className="sr-only"> (pedido de {name})</span>
        </Button>
      </div>
      {open && (
        <Dialog title="Mostrar quando você lê" onClose={() => setOpen(false)}>
          <PrivacyConsentGate
            area="readReceipts"
            audience="therapist"
            onCancel={() => setOpen(false)}
            onAccepted={() => setOpen(false)}
          />
        </Dialog>
      )}
    </>
  );
}

type RequestProps = {
  patient: Pick<ListedPatient, 'id' | 'name'>;
  // Depois da resposta o cartão some: quem o mostra leva o foco e a confirmação para outro lugar.
  onAnswered: (shared: boolean) => void;
};

// O pedido esperando resposta, em "Meus pacientes" e na página do paciente.
export function ReadReceiptsRequest({ patient, onAnswered }: RequestProps) {
  const { data: user } = useSession();
  const share = useSetReadReceiptsShared(patient.id);
  const titleId = useId();
  const name = firstName(patient.name);
  const consented = Boolean(user?.privacyAreas.readReceipts);
  const answer = (shared: boolean) => share.mutate(shared, { onSuccess: () => onAnswered(shared) });

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6"
    >
      <h2 id={titleId} className="text-lg font-semibold break-words">
        {name} gostaria de ver quando você lê os registros
      </h2>
      <p className="text-muted">{explain(name)}</p>
      {share.isError && <Alert tone="attention">{getApiError(share.error).message}</Alert>}
      {consented ? (
        <div className="grid grid-cols-1 gap-3 sm:flex">
          <Button disabled={share.isPending} onClick={() => answer(true)}>
            Ativar para {name}
          </Button>
          <Button variant="secondary" disabled={share.isPending} onClick={() => answer(false)}>
            Agora não<span className="sr-only"> ({name})</span>
          </Button>
        </div>
      ) : (
        <ConsentFirst name={name} />
      )}
    </section>
  );
}

// Confirmação sempre montada (vazia, fica só para o leitor de tela): uma região viva só é anunciada
// se já existia. Depois da resposta, o foco vem para cá, e não para o começo da página.
function useAnswerStatus() {
  const ref = useRef<HTMLParagraphElement>(null);
  const [message, setMessage] = useState('');
  const show = (text: string) => {
    setMessage(text);
    requestAnimationFrame(() => ref.current?.focus());
  };
  const node = (
    <p ref={ref} role="status" tabIndex={-1} className="text-sm text-muted empty:sr-only focus:outline-none">
      {message}
    </p>
  );
  return { show, node };
}

// Na página do paciente: o pedido, se espera resposta, ou a opção para mudar de ideia depois.
export function PatientReadReceipts({ patientId }: { patientId: string }) {
  const { data: user } = useSession();
  const patients = useLinkedPatients();
  const patient = patients.data?.find((item) => item.id === patientId);
  const share = useSetReadReceiptsShared(patientId);
  const status = useAnswerStatus();
  const consented = Boolean(user?.privacyAreas.readReceipts);

  // Sem pedido, não há resposta a anunciar: nada na tela (nem a região viva vazia).
  if (!patient || patient.readReceipts === 'OFF') return null;
  const name = firstName(patient.name);
  if (patient.readReceipts === 'PENDING') {
    return (
      <>
        {status.node}
        <ReadReceiptsRequest patient={patient} onAnswered={(shared) => status.show(answered(name, shared))} />
      </>
    );
  }

  const on = patient.readReceipts === 'ON';
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-soft">
      <p className="text-sm text-muted">
        {on
          ? `${name} vê a data em que você marca um registro como lido.`
          : `${name} pediu para ver quando você lê os registros. Você escolheu “Agora não”.`}
      </p>
      {status.node}
      {share.isError && <Alert tone="attention">{getApiError(share.error).message}</Alert>}
      {consented ? (
        <div>
          <Button
            variant="secondary"
            disabled={share.isPending}
            onClick={() =>
              share.mutate(!on, {
                onSuccess: () =>
                  status.show(on ? `${name} deixou de ver quando você lê.` : answered(name, true)),
              })
            }
          >
            {on ? `Parar de mostrar para ${name}` : `Ativar para ${name}`}
          </Button>
        </div>
      ) : (
        <ConsentFirst name={name} />
      )}
    </div>
  );
}

// Os pedidos esperando resposta, no topo de "Meus pacientes".
export function PendingReadReceiptsRequests({ patients }: { patients: ListedPatient[] }) {
  const status = useAnswerStatus();
  const [answeredAny, setAnsweredAny] = useState(false);
  const pending = patients.filter((patient) => patient.readReceipts === 'PENDING');
  // Sem pedido nenhum (e sem resposta para anunciar), nada na tela.
  if (pending.length === 0 && !answeredAny) return null;
  return (
    <>
      {status.node}
      {pending.map((patient) => (
        <ReadReceiptsRequest
          key={patient.id}
          patient={patient}
          onAnswered={(shared) => {
            setAnsweredAny(true);
            status.show(answered(firstName(patient.name), shared));
          }}
        />
      ))}
    </>
  );
}
