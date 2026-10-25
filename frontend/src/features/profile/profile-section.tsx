import { useEffect, useId, useState, type FormEvent } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { choiceCardClasses } from '../../components/ui/field-styles';
import { TextField } from '../../components/ui/text-field';
import { getApiError } from '../auth/auth-api';
import { useSession } from '../auth/use-session';
import { applyPalette, PALETTE_OPTIONS, type Palette } from './palettes';
import { FULL_NAME_MAX, type Profile } from './profile-api';
import { useProfile, useUpdateProfile } from './use-profile';

// "Seu perfil", em Conta (DEC-061, DEC-063, DEC-068): nome completo e paleta de cores, tudo opcional.
export function ProfileSection() {
  const profile = useProfile();

  return (
    <section aria-labelledby="profile-title" className="flex flex-col gap-3">
      <h2 id="profile-title" className="text-2xl font-semibold">
        Seu perfil
      </h2>
      {profile.isPending && <p className="text-muted">Carregando seu perfil…</p>}
      {profile.isError && <Alert tone="attention">{getApiError(profile.error).message}</Alert>}
      {profile.data && <ProfileForm profile={profile.data} />}
    </section>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const { data: user } = useSession();
  const update = useUpdateProfile();
  const [fullName, setFullName] = useState(profile.fullName ?? '');
  const [palette, setPalette] = useState<Palette>(profile.palette);
  const [saved, setSaved] = useState(false);
  const savedPalette = user?.palette ?? profile.palette;
  const paletteHintId = useId();

  // Prévia: a paleta escolhida aparece na hora, mas só fica no aparelho e na conta ao salvar. Ao
  // sair da tela sem salvar, volta a salva.
  useEffect(() => {
    applyPalette(palette, { persist: false });
    return () => applyPalette(savedPalette);
  }, [palette, savedPalette]);

  const nameError = getApiError(update.error).fields.fullName;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    update.mutate({ fullName: fullName.trim() || null, palette }, { onSuccess: () => setSaved(true) });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6">
      {update.isError && !nameError && <Alert tone="attention">{getApiError(update.error).message}</Alert>}

      <TextField
        label="Nome completo (opcional)"
        hint="Só aparece para você. No app, continuamos te chamando pelo nome do cadastro."
        value={fullName}
        maxLength={FULL_NAME_MAX}
        autoComplete="name"
        error={nameError}
        onChange={(e) => {
          setSaved(false);
          setFullName(e.target.value);
        }}
      />

      <fieldset aria-describedby={paletteHintId} className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Paleta de cores</legend>
        <p id={paletteHintId} className="text-sm text-muted">
          Muda as cores do app neste aparelho e nos outros em que você entrar. O tema claro ou escuro continua no rodapé.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PALETTE_OPTIONS.map((option) => (
            <label key={option.value} className={`flex min-h-11 items-center gap-3 p-3 ${choiceCardClasses}`}>
              <input
                type="radio"
                name="palette"
                value={option.value}
                checked={palette === option.value}
                onChange={() => {
                  setSaved(false);
                  setPalette(option.value);
                }}
              />
              <span aria-hidden="true" className={`size-6 shrink-0 rounded-full border border-border ${option.swatch}`} />
              <span className="flex flex-col">
                <span className="font-medium">{option.label}</span>
                <span className="text-sm text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Salvando…' : 'Salvar perfil'}
        </Button>
        <p role="status" className="text-sm text-muted">
          {saved ? 'Pronto, perfil salvo.' : ''}
        </p>
      </div>
    </form>
  );
}
