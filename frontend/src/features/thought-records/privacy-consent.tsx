import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { getApiError } from '../auth/auth-api';
import { useAcceptPrivacy, useSession } from '../auth/use-session';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

// Novo aceite do aviso de privacidade (DEC-039), no lugar do Registro de Pensamentos.
// Mesmo consentimento do cadastro: caixa desmarcada e explícita (DEC-036).
export function PrivacyConsentGate() {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = useAcceptPrivacy();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checked) {
      setError('Para continuar, marque que você leu e concorda com o aviso.');
      return;
    }
    setError(null);
    accept.mutate(undefined, { onError: (e) => setError(getApiError(e).message) });
  }

  return (
    <section
      aria-labelledby="privacy-consent-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6"
    >
      <h2 id="privacy-consent-title" className="text-xl font-semibold">
        Antes de começar
      </h2>
      <p>
        Atualizamos o aviso de privacidade para incluir o Registro de Pensamentos. Para usar esta parte, leia o
        que mudou e confirme. O resto do Faísca continua igual.
      </p>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {error && <Alert tone="attention">{error}</Alert>}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 size-4 accent-primary"
          />
          <span>
            Li e concordo com o{' '}
            {/* Outra aba: a pessoa lê o aviso sem sair daqui. */}
            <Link to="/privacidade" target="_blank" rel="noopener" className={linkClass}>
              aviso de privacidade
            </Link>
            , inclusive com o uso dos meus pensamentos e emoções como dados de saúde.
          </span>
        </label>
        <div>
          <Button type="submit" disabled={accept.isPending}>
            {accept.isPending ? 'Salvando…' : 'Aceitar e continuar'}
          </Button>
        </div>
      </form>
    </section>
  );
}

// Faixa discreta para quem ainda não aceitou: avisa no app que o aviso mudou (DEC-039).
// Não bloqueia nada; o aceite fica no Registro de Pensamentos.
export function PrivacyUpdateBanner() {
  const { data: user } = useSession();
  if (!user || user.privacyUpToDate) return null;

  return (
    <Alert>
      Atualizamos o aviso de privacidade para incluir o Registro de Pensamentos. Você só precisa aceitar a nova
      versão para usar essa parte.{' '}
      <Link to="/privacidade" className={linkClass}>
        Ver o que mudou
      </Link>
    </Alert>
  );
}
