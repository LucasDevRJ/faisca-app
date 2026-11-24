import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { useSession } from '../auth/use-session';
import { useAccessibility } from '../profile/use-profile';
import {
  canPlaySounds,
  markSoundOffered,
  playSound,
  primeAudio,
  readSoundSettings,
  saveSoundSettings,
  wasSoundOffered,
} from './save-sound';

function focusOnMount(element: HTMLElement | null) {
  element?.focus();
}

// Convite da primeira vez (DEC-135), embaixo do cartão que acabou de ganhar o ✓. Aparece uma vez
// por aparelho, só para quem ainda não ligou o som, e não rouba o foco.
export function SaveSoundOffer() {
  const { data: user } = useSession();
  const { directLanguage } = useAccessibility();
  const id = user?.id;
  const [state, setState] = useState<'ask' | 'on' | 'off' | null>(() =>
    id && canPlaySounds() && !readSoundSettings(id).enabled && !wasSoundOffered(id) ? 'ask' : null,
  );

  // Conta como oferecido só quando a pessoa responde: se o cartão perder o ✓ antes, o convite
  // volta no próximo registro salvo.
  useEffect(() => {
    if (id && (state === 'on' || state === 'off')) markSoundOffered(id);
  }, [id, state]);

  if (!id || !state) return null;

  function turnOn() {
    if (!id) return;
    primeAudio();
    saveSoundSettings(id, { ...readSoundSettings(id), enabled: true });
    setState('on');
  }

  const settingsLink = (
    <Link to="/conta/acessibilidade" className="font-medium text-primary-text underline underline-offset-4">
      Conta › Acessibilidade
    </Link>
  );

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-surface p-3 text-sm" aria-label="Som ao salvar" role="group">
      {state === 'ask' && (
        <>
          <p>Quer ouvir um som suave ao salvar?</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void playSound(readSoundSettings(id).sound, readSoundSettings(id).volume)}>
              <span aria-hidden="true">▶</span> Ouvir
            </Button>
            <Button variant="secondary" onClick={turnOn}>Ligar som</Button>
            <Button variant="ghost" onClick={() => setState('off')}>Agora não</Button>
          </div>
        </>
      )}
      {/* O botão tocado some: o foco vai para a resposta, que o leitor de tela lê. */}
      {state === 'on' && <p ref={focusOnMount} tabIndex={-1}>Som ligado neste aparelho. Dá para mudar em {settingsLink}.</p>}
      {state === 'off' && <p ref={focusOnMount} tabIndex={-1}>{directLanguage ? <>Som desligado. Para ligar depois, abra {settingsLink}.</> : <>Tudo bem. Se mudar de ideia, está em {settingsLink}.</>}</p>}
    </div>
  );
}
