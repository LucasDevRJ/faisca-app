import { useId, useState } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { choiceCardClasses } from '../../components/ui/field-styles';
import { getApiError } from '../auth/auth-api';
import { PrivacyConsentGate } from '../auth/privacy-consent';
import { useSession } from '../auth/use-session';
import type { PatientLink, PatientReadReceipts } from '../links/links-api';
import { firstName } from '../links/professional-labels';
import { useSetReadReceiptsRequested } from '../links/use-links';

// "Quero ver quando [nome] ler os meus registros" em Conta, no cartão de cada profissional (DEC-118).
// O pedido é por profissional e só vale quando ela também ativa. O paciente nunca vê a recusa: sem a
// resposta dela, ou com "Agora não", a tela diz o mesmo "Pedido enviado".
function hint(state: PatientReadReceipts, name: string): string {
  if (state === 'ON') return `Ativo. Nos seus registros, aparece a data em que ${name} leu cada um.`;
  if (state === 'REQUESTED') return `Pedido enviado. Quando ${name} ativar, você passa a ver.`;
  return `Se ${name} também ativar, você vê nos seus registros a data em que cada um foi lido. Nunca aparece o que falta ler.`;
}

export function ReadReceiptsSetting({ link }: { link: PatientLink }) {
  const { data: user } = useSession();
  const update = useSetReadReceiptsRequested();
  const [consentOpen, setConsentOpen] = useState(false);
  const hintId = useId();
  const name = firstName(link.therapist.name);
  const consented = Boolean(user?.privacyAreas.readReceipts);

  if (!consented) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          Agora você pode pedir para ver quando {name} ler os seus registros. Para isso, leia e aceite o aviso de
          privacidade atualizado.
        </p>
        <div>
          <Button variant="secondary" onClick={() => setConsentOpen(true)}>
            Ler e aceitar<span className="sr-only"> (ver quando {name} ler)</span>
          </Button>
        </div>
        {consentOpen && (
          <Dialog title="Ver quando a profissional lê" onClose={() => setConsentOpen(false)}>
            <PrivacyConsentGate
              area="readReceipts"
              onCancel={() => setConsentOpen(false)}
              onAccepted={() => setConsentOpen(false)}
            />
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        className={`flex min-h-11 items-start gap-3 p-3 has-focus-visible:outline-2 has-focus-visible:outline-primary ${choiceCardClasses}`}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          checked={link.readReceipts !== 'OFF'}
          disabled={update.isPending}
          aria-describedby={hintId}
          onChange={(event) => update.mutate({ linkId: link.id, requested: event.target.checked })}
        />
        <span className="font-medium">Quero ver quando {name} ler os meus registros</span>
      </label>
      {/* Fora do label, para não entrar no nome da caixa; região viva: depois de ligar ou desligar, o
          leitor de tela ouve a situação nova. */}
      <p id={hintId} role="status" className="text-sm text-muted">
        {hint(link.readReceipts, name)}
      </p>
      {update.isError && <Alert tone="attention">{getApiError(update.error).message}</Alert>}
    </div>
  );
}
