import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { fieldClasses } from '../../components/ui/field-styles';

const invite = {
  title: 'Conheça o Faísca',
  text: 'Conheça o Faísca ✨ É um app para registrar pensamentos, emoções e atividades entre as consultas e lembrar do que você quer conversar na terapia. Quem compartilhou espera que o Faísca te ajude a aproveitar melhor a terapia, no seu ritmo. O convite não inclui dados da conta de quem enviou.',
  url: 'https://minhafaisca.com.br/como-funciona',
};
const inviteToCopy = `${invite.text}\n\n${invite.url}`;

export function ShareFaiscaSection() {
  const canShare = typeof navigator.share === 'function';
  const [status, setStatus] = useState('');
  const [sharing, setSharing] = useState(false);
  const [showCopyField, setShowCopyField] = useState(false);

  async function share() {
    if (sharing) return;
    setStatus('');
    setSharing(true);
    try {
      await navigator.share(invite);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setStatus('Não foi possível abrir o menu. Você pode copiar o convite.');
      }
    } finally {
      setSharing(false);
    }
  }

  async function copy() {
    setStatus('');
    try {
      await navigator.clipboard.writeText(inviteToCopy);
      setShowCopyField(false);
      setStatus('Convite copiado.');
    } catch {
      setShowCopyField(true);
      setStatus('Selecione e copie o texto no campo abaixo.');
    }
  }

  return (
    <section aria-labelledby="share-faisca-title" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 id="share-faisca-title" className="text-xl font-semibold">Compartilhar o Faísca</h2>
      <p className="text-muted">Convide alguém a conhecer o app. O convite inclui uma mensagem e o link público do Faísca.</p>
      <div>
        <div className="flex flex-wrap gap-2">
          {canShare && (
            <Button variant="secondary" aria-disabled={sharing} onClick={() => void share()}>
              Compartilhar
            </Button>
          )}
          <Button variant="secondary" onClick={() => void copy()}>Copiar convite</Button>
        </div>
        <p role="status" className="text-sm text-muted not-empty:mt-2">{status}</p>
      </div>
      {showCopyField && (
        <label className="flex flex-col gap-2">
          Mensagem do convite
          <textarea
            className={`${fieldClasses} py-2`}
            value={inviteToCopy}
            rows={5}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </section>
  );
}
