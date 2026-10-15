import { TEXT_MAX } from './thought-record-labels';
import type { Emotion, ThoughtRecord } from './thought-records-api';

// Estado da explicação alternativa e do "como me sinto agora" (DEC-054, DEC-055), usado pelo
// formulário do registro e pela página de adicionar depois.

export type AlternativeState = {
  text: string;
  feelNow: boolean;
  after: Partial<Record<Emotion, number | null>>;
};

export function initialAlternativeState(record?: ThoughtRecord): AlternativeState {
  const emotions = record?.emotions ?? [];
  return {
    text: record?.alternativeExplanation ?? '',
    feelNow: emotions.some((e) => e.intensityAfter !== null),
    after: Object.fromEntries(emotions.map((e) => [e.emotion, e.intensityAfter])),
  };
}

type Errors = Partial<Record<string, string>>;

export function validateAlternative(state: AlternativeState, emotions: Emotion[]): Errors {
  const errors: Errors = {};
  const text = state.text.trim();
  if (text.length > TEXT_MAX) errors.alternativeExplanation = `Este campo pode ter até ${TEXT_MAX} caracteres.`;
  if (text && state.feelNow) {
    for (const emotion of emotions) {
      if (state.after[emotion] == null) errors[`after.${emotion}`] = 'Escolha como está agora, de 0 a 10.';
    }
  }
  return errors;
}

// A reavaliação que vai para a API: só com a alternativa escrita e a opção marcada.
export function emotionsAfter(state: AlternativeState, emotions: Emotion[]) {
  if (!state.text.trim() || !state.feelNow) return undefined;
  return emotions.map((emotion) => ({ emotion, intensityAfter: state.after[emotion]! }));
}
