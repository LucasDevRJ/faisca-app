import { ScoreField } from '../../components/ui/score-field';
import { TextAreaField } from '../../components/ui/text-field';
import type { AlternativeState } from './alternative-state';
import { FIELD_TEXT, INTENSITY_TEXT, TEXT_MAX } from './thought-record-labels';
import type { Emotion } from './thought-records-api';

// Explicação alternativa e "como me sinto agora" (DEC-054, DEC-055). Usado no formulário do
// registro (no dia) e na página de adicionar depois. A reavaliação só aparece com a alternativa
// escrita e, se a pessoa quiser, cobre todas as emoções (a API exige todas ou nenhuma).

type AlternativeFieldsProps = {
  state: AlternativeState;
  onChange: (state: AlternativeState) => void;
  // As emoções do registro, com o nome e a intensidade de antes, para comparar.
  emotions: { emotion: Emotion; name: string; before: number | null }[];
  error: (key: string) => string | undefined;
  // No formulário do registro, a alternativa é opcional; na página de adicionar depois, é o que se
  // está adicionando, e a dica não diz "Opcional".
  optional?: boolean;
};

export function AlternativeFields({ state, onChange, emotions, error, optional = true }: AlternativeFieldsProps) {
  const written = state.text.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      <TextAreaField
        label={FIELD_TEXT.alternativeExplanation.label}
        hint={optional ? `Opcional. ${FIELD_TEXT.alternativeExplanation.hint}` : FIELD_TEXT.alternativeExplanation.hint}
        value={state.text}
        limit={TEXT_MAX}
        onChange={(e) => onChange({ ...state, text: e.target.value })}
        error={error('alternativeExplanation')}
      />

      {written && emotions.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-medium">{FIELD_TEXT.feelNow.label}</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={state.feelNow}
              onChange={(e) => onChange({ ...state, feelNow: e.target.checked })}
            />
            {FIELD_TEXT.feelNow.toggle}
          </label>
          {state.feelNow && (
            <>
              <p className="text-sm text-muted">{FIELD_TEXT.feelNow.hint}</p>
              {emotions.map(({ emotion, name, before }) => (
                <div key={emotion} className="rounded-md border border-border p-3">
                  <ScoreField
                    label={`${name}: agora`}
                    hint={before === null ? undefined : `Antes: ${before}`}
                    minLabel={INTENSITY_TEXT.min}
                    maxLabel={INTENSITY_TEXT.max}
                    value={state.after[emotion] ?? null}
                    onChange={(value) => onChange({ ...state, after: { ...state.after, [emotion]: value } })}
                    error={error(`after.${emotion}`)}
                  />
                </div>
              ))}
            </>
          )}
        </fieldset>
      )}
    </div>
  );
}
