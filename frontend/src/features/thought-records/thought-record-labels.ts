import type { Emotion, EmotionEntry } from './thought-records-api';

// Textos do Registro de Pensamentos. Termos clínicos suaves (DEC-039) e tom acolhedor.

// Na ordem da SPEC; "Outra" por último.
export const EMOTION_LABEL: Record<Emotion, string> = {
  TRISTEZA: 'Tristeza',
  ANSIEDADE: 'Ansiedade',
  MEDO: 'Medo',
  RAIVA: 'Raiva',
  CULPA: 'Culpa',
  VERGONHA: 'Vergonha',
  FRUSTRACAO: 'Frustração',
  SOLIDAO: 'Solidão',
  ALEGRIA: 'Alegria',
  ALIVIO: 'Alívio',
  OUTRA: 'Outra',
};

export const EMOTIONS = Object.keys(EMOTION_LABEL) as Emotion[];

// "Outra" aparece com o nome que a pessoa escreveu.
export function emotionName(entry: Pick<EmotionEntry, 'emotion' | 'otherLabel'>): string {
  return entry.emotion === 'OUTRA' && entry.otherLabel ? entry.otherLabel : EMOTION_LABEL[entry.emotion];
}

export const FIELD_TEXT = {
  situationDate: { label: 'Dia da situação' },
  situation: { label: 'Situação', hint: 'O que aconteceu? Onde você estava, com quem?' },
  automaticThought: { label: 'Pensamento automático', hint: 'O que passou pela sua cabeça na hora?' },
  beliefLevel: { label: 'O quanto acredito nesse pensamento', min: 'Nada', max: 'Totalmente' },
  emotions: { label: 'Emoções', hint: 'Marque uma ou mais e diga a intensidade de cada uma.' },
  behavior: { label: 'Comportamento', hint: 'O que você fez?' },
  consequence: { label: 'Consequência', hint: 'E depois, o que aconteceu?' },
} as const;

export const INTENSITY_TEXT = { min: 'Fraca', max: 'Muito forte' } as const;

// Limites da DEC-039 (os mesmos da API).
export const TEXT_MAX = 1000;
export const OTHER_LABEL_MAX = 50;
