import { useEffect } from 'react';
import { useSession } from '../auth/use-session';
import { unlockAudioOnFirstTouch } from './save-sound';

// Destrava o áudio no primeiro toque da página, para quem ligou o som (ver save-sound.ts).
export function useSaveSoundUnlock() {
  const { data: user } = useSession();
  const id = user?.id;
  useEffect(() => (id ? unlockAudioOnFirstTouch(id) : undefined), [id]);
}
