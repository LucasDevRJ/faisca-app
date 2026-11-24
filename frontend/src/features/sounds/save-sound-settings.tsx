import { useId, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { choiceCardClasses } from '../../components/ui/field-styles';
import {
  canPlaySounds,
  canVibrate,
  playSound,
  readSoundSettings,
  saveSounds,
  saveSoundSettings,
  soundVolumes,
  vibrateOnce,
  type SaveSound,
  type SoundSettings,
  type SoundVolume,
} from './save-sound';

// "Sons e vibração" em Conta › Acessibilidade (DEC-135): desligados por padrão, com prévia de cada
// som antes de ligar, e guardados só neste aparelho.
export function SaveSoundSettings({ userId }: { userId: string }) {
  const [saved, setSaved] = useState<SoundSettings>(() => readSoundSettings(userId));
  const [draft, setDraft] = useState<SoundSettings>(saved);
  const [status, setStatus] = useState('');
  const hintId = useId();
  const sounds = canPlaySounds();
  const vibration = canVibrate();
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  function change(next: Partial<SoundSettings>) {
    setStatus('');
    setDraft((current) => ({ ...current, ...next }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveSoundSettings(userId, draft);
    setSaved(draft);
    setStatus('Sons e vibração salvos neste aparelho.');
  }

  return (
    <section aria-labelledby="save-sound-title" className="flex flex-col gap-3">
      <h2 id="save-sound-title" className="text-2xl font-semibold">Sons e vibração</h2>
      <p id={hintId} className="text-muted">
        Um retorno curto quando um registro é salvo. Começa desligado e vale só neste aparelho.
        No iPhone, o modo silencioso deixa o som mudo.
      </p>
      <form onSubmit={submit} aria-describedby={hintId}
        className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6">
        {sounds ? (
          <>
            <label className={`${choiceCardClasses} flex min-h-11 items-center gap-3 px-4 py-3`}>
              <input type="checkbox" checked={draft.enabled} onChange={(event) => change({ enabled: event.target.checked })} />
              <span className="font-medium">Tocar um som ao salvar</span>
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-medium">Som do registro</legend>
              {(Object.keys(saveSounds) as SaveSound[]).map((sound) => (
                <div key={sound} className="flex flex-wrap items-center gap-2">
                  <label className={`${choiceCardClasses} flex min-h-11 flex-1 items-center gap-3 px-4 py-2`}>
                    <input type="radio" name="save-sound" checked={draft.sound === sound} onChange={() => change({ sound })} />
                    {saveSounds[sound]}
                  </label>
                  <Button variant="secondary" aria-label={`Ouvir ${saveSounds[sound]}`} onClick={() => void playSound(sound, draft.volume)}>
                    <span aria-hidden="true">▶</span> Ouvir
                  </Button>
                </div>
              ))}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-medium">Volume</legend>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(soundVolumes) as SoundVolume[]).map((volume) => (
                  <label key={volume} className={`${choiceCardClasses} flex min-h-11 items-center justify-center gap-2 px-2 py-2`}>
                    <input type="radio" name="save-sound-volume" checked={draft.volume === volume} onChange={() => change({ volume })} />
                    {soundVolumes[volume]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted">Ao concluir uma atividade, o som é outro: duas notas subindo.</p>
              <Button variant="secondary" className="self-start" onClick={() => void playSound('complete', draft.volume)}>
                <span aria-hidden="true">▶</span> Ouvir atividade concluída
              </Button>
            </div>
          </>
        ) : (
          <p className="text-muted">Este navegador não toca os sons do Faísca.</p>
        )}

        {vibration ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className={`${choiceCardClasses} flex min-h-11 flex-1 items-center gap-3 px-4 py-3`}>
              <input type="checkbox" checked={draft.vibration} onChange={(event) => change({ vibration: event.target.checked })} />
              <span className="font-medium">Vibrar de leve ao salvar</span>
            </label>
            <Button variant="secondary" aria-label="Sentir a vibração" onClick={vibrateOnce}>Sentir</Button>
          </div>
        ) : (
          <p className="text-muted">Este aparelho não vibra pelo navegador.</p>
        )}

        {(sounds || vibration) && (
          <Button type="submit" disabled={!changed} className="self-start">Salvar sons e vibração</Button>
        )}
        <p role="status">{status}</p>
      </form>
    </section>
  );
}
