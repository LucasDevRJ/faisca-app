import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { TextAreaField } from '../../components/ui/text-field';
import { getApiError } from '../auth/auth-api';
import { PrivacyConsentGate } from '../auth/privacy-consent';
import { useSession } from '../auth/use-session';
import {
  ABOUT_FIELDS,
  ABOUT_TEXT_MAX,
  GOAL_SUGGESTIONS,
  type AboutMe,
  type AboutMeField,
  type SaveAboutMeInput,
} from './about-me-api';
import { useAboutMe, useSaveAboutMe } from './use-about-me';

// "Sobre mim", em Conta, só para quem é paciente (DEC-081, DEC-082). Tudo opcional, sem cobrança:
// nada de "perfil completo". A psicóloga vinculada lê o que a pessoa escrever.
export function AboutMeSection() {
  const { data: user } = useSession();
  const consented = Boolean(user?.privacyAreas.aboutMe);
  const query = useAboutMe(consented);
  const title = useRef<HTMLHeadingElement>(null);
  const { hash } = useLocation();
  const ready = !consented || !query.isPending;

  // "Abrir o Sobre mim" (card de Novidades) chega com #sobre-mim: rola até a seção e põe o foco no
  // título, depois que ela termina de carregar.
  useEffect(() => {
    if (hash === '#sobre-mim' && ready) {
      title.current?.scrollIntoView?.({ block: 'start' });
      title.current?.focus();
    }
  }, [hash, ready]);

  return (
    <section aria-labelledby="about-me-title" className="flex flex-col gap-3">
      <h2 id="about-me-title" ref={title} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
        Sobre mim
      </h2>
      {!consented ? (
        <PrivacyConsentGate area="aboutMe" audience="patient" />
      ) : query.isPending ? (
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      ) : query.isError ? (
        <Alert tone="attention">{getApiError(query.error).message}</Alert>
      ) : (
        <AboutMeForm initial={query.data} />
      )}
    </section>
  );
}

// A sugestão já está no texto como palavra inteira? ("Sono" em "sonolência" não conta.)
function hasSuggestion(text: string, suggestion: string): boolean {
  const escaped = suggestion.toLocaleLowerCase('pt-BR').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s,.;!?])${escaped}($|[\\s,.;!?])`).test(text.toLocaleLowerCase('pt-BR'));
}

// "Ansiedade" num campo vazio; ", Ansiedade" depois de um texto; " Ansiedade" depois de pontuação.
function withSuggestion(text: string, suggestion: string): string {
  const current = text.trimEnd();
  if (!current) return suggestion;
  return `${current}${/[.,;!?]$/.test(current) ? ' ' : ', '}${suggestion}`;
}

function AboutMeForm({ initial }: { initial: AboutMe | null }) {
  const save = useSaveAboutMe();
  const [values, setValues] = useState<Record<AboutMeField, string>>({
    aboutMe: initial?.aboutMe ?? '',
    goals: initial?.goals ?? '',
    habits: initial?.habits ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<AboutMeField, string>>>({});
  const [status, setStatus] = useState('');
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [inserted, setInserted] = useState('');

  function change(key: AboutMeField, value: string) {
    setStatus('');
    setInserted('');
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Partial<Record<AboutMeField, string>> = {};
    for (const { key } of ABOUT_FIELDS) {
      if (values[key].trim().length > ABOUT_TEXT_MAX) next[key] = `Este campo pode ter até ${ABOUT_TEXT_MAX} caracteres.`;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const input = Object.fromEntries(
      ABOUT_FIELDS.map(({ key }) => [key, values[key].trim() || null]),
    ) as SaveAboutMeInput;
    save.mutate(input, {
      onSuccess: (saved) => setStatus(saved ? 'Pronto, salvo.' : 'Pronto, o "Sobre mim" ficou vazio.'),
    });
  }

  const apiError = save.error ? getApiError(save.error) : null;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6"
    >
      <p className="text-muted">
        Se quiser, conte um pouco sobre você. Tudo é opcional, e a sua psicóloga lê o que você escrever aqui.
      </p>
      {apiError && <Alert tone="attention">{apiError.message}</Alert>}

      {ABOUT_FIELDS.map(({ key, label, hint }) => (
        <div key={key} className="flex flex-col gap-2">
          <TextAreaField
            label={label}
            hint={hint}
            rows={4}
            limit={ABOUT_TEXT_MAX}
            value={values[key]}
            onChange={(e) => change(key, e.target.value)}
            error={errors[key] ?? apiError?.fields[key]}
          />
          {key === 'goals' && (
            <div
              ref={suggestionsRef}
              role="group"
              aria-label="Sugestões para o que gostaria de trabalhar"
              className="flex flex-wrap gap-2"
            >
              {GOAL_SUGGESTIONS.filter((suggestion) => !hasSuggestion(values.goals, suggestion)).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  aria-label={`Inserir: ${suggestion}`}
                  onClick={() => {
                    change('goals', withSuggestion(values.goals, suggestion));
                    setInserted(`Inserido: ${suggestion}.`);
                    // O botão tocado some da lista: o foco vai para a próxima sugestão, ou para o campo.
                    requestAnimationFrame(() => {
                      const next = suggestionsRef.current?.querySelector('button');
                      const field = suggestionsRef.current?.parentElement?.querySelector('textarea');
                      (next ?? field)?.focus();
                    });
                  }}
                  className="inline-flex min-h-11 items-center rounded-full border border-field-border bg-surface px-3 text-sm text-text hover:border-primary"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
        {/* Um só aviso para o leitor de tela: "Pronto, salvo." ou a sugestão inserida. */}
        <p role="status" className="text-sm text-muted">
          {status}
          <span className="sr-only">{inserted}</span>
        </p>
      </div>
    </form>
  );
}
