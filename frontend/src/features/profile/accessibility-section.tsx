import { useEffect, useId, useState, type FormEvent } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { choiceCardClasses } from '../../components/ui/field-styles';
import { getApiError } from '../auth/auth-api';
import { useSession } from '../auth/use-session';
import {
  ACCESSIBILITY_OPTIONS,
  applyAccessibility,
  DEFAULT_ACCESSIBILITY,
  type AccessibilityKey,
  type AccessibilitySettings,
} from './accessibility';
import type { Profile } from './profile-api';
import { useProfile, useUpdateProfile } from './use-profile';

// "Acessibilidade", em Conta (DEC-076, DEC-087): 5 ajustes independentes (linguagem direta, uma
// coisa por vez, leitura confortável, sem pressão de tempo e menos movimento), abertos a todos
// (paciente e terapeuta) e desligados por padrão.
export function AccessibilitySection() {
  const profile = useProfile();

  return (
    <section aria-labelledby="accessibility-title" className="flex flex-col gap-3">
      <h2 id="accessibility-title" className="text-2xl font-semibold">
        Acessibilidade
      </h2>
      {profile.isPending && <p className="text-muted">Carregando ajustes de acessibilidade…</p>}
      {profile.isError && <Alert tone="attention">{getApiError(profile.error).message}</Alert>}
      {profile.data && (
        <div className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6">
          <AccessibilityForm profile={profile.data} />
        </div>
      )}
    </section>
  );
}

function AccessibilityForm({ profile }: { profile: Profile }) {
  const { data: user } = useSession();
  const update = useUpdateProfile();
  const savedAccessibility = user?.accessibility ?? profile.accessibility ?? DEFAULT_ACCESSIBILITY;
  const [values, setValues] = useState<AccessibilitySettings>(savedAccessibility);
  const [saved, setSaved] = useState(false);
  const hintId = useId();

  // Prévia: leitura confortável e menos movimento aparecem na hora no aparelho, mas só ficam
  // gravados ao salvar. Ao sair da tela sem salvar, voltam os salvos.
  useEffect(() => {
    applyAccessibility(values, { persist: false });
    return () => applyAccessibility(savedAccessibility);
  }, [values, savedAccessibility]);

  function toggle(key: AccessibilityKey, checked: boolean) {
    setSaved(false);
    setValues((current) => ({ ...current, [key]: checked }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    update.mutate(
      { accessibility: values },
      {
        onSuccess: () => {
          applyAccessibility(values, { persist: true });
          setSaved(true);
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {update.isError && <Alert tone="attention">{getApiError(update.error).message}</Alert>}

      <fieldset aria-describedby={hintId} className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Ajustes de acessibilidade</legend>
        <p id={hintId} className="text-sm text-muted">
          Valem neste aparelho e nos outros em que você entrar. Você pode ligar ou desligar qualquer um quando quiser.
        </p>
        <div className="flex flex-col gap-2">
          {ACCESSIBILITY_OPTIONS.map((option) => (
            <label key={option.key} className={`flex min-h-11 items-start gap-3 p-3 ${choiceCardClasses}`}>
              <input
                type="checkbox"
                checked={values[option.key]}
                onChange={(e) => toggle(option.key, e.target.checked)}
                className="mt-0.5"
              />
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
          {update.isPending ? 'Salvando…' : 'Salvar acessibilidade'}
        </Button>
        <p role="status" className="text-sm text-muted">
          {saved ? 'Pronto, ajustes salvos.' : ''}
        </p>
      </div>
    </form>
  );
}
