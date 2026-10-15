import { formatShortDay, todayInAppZone } from '../activities/week';
import type { AlternativeDeadline, Emotion, EmotionEntry, ThoughtRecord } from './thought-records-api';

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
  // Reestruturação (DEC-054, DEC-055): opcional.
  alternativeExplanation: {
    label: 'Explicação alternativa',
    hint: 'Existe outro jeito de olhar para essa situação? O que você diria a uma pessoa querida que tivesse esse pensamento?',
  },
  feelNow: {
    label: 'Como me sinto agora',
    toggle: 'Quero dizer como me sinto agora',
    hint: 'Depois de pensar na alternativa, quanto pesa cada emoção agora?',
  },
} as const;

// "até sex, 17/10, às 10:00": prazo para adicionar a explicação alternativa depois (DEC-055). Sem
// hora (consulta antiga), vale até o dia anterior.
export function formatAlternativeDeadline(deadline: AlternativeDeadline): string {
  return deadline.time
    ? `até ${formatShortDay(deadline.date)}, às ${deadline.time}`
    : `antes de ${formatShortDay(deadline.date)}`;
}

// A alternativa entrou num dia depois do registro? Então o cartão mostra quando (DEC-054).
export function alternativeAddedLater(record: Pick<ThoughtRecord, 'createdAt' | 'alternativeAddedAt'>): string | null {
  if (!record.alternativeAddedAt) return null;
  const added = todayInAppZone(new Date(record.alternativeAddedAt));
  return added === todayInAppZone(new Date(record.createdAt)) ? null : added;
}

export const INTENSITY_TEXT = { min: 'Fraca', max: 'Muito forte' } as const;

// Limites da DEC-039, com o texto em 5000 pela DEC-053 (os mesmos da API).
export const TEXT_MAX = 5000;
export const OTHER_LABEL_MAX = 50;
