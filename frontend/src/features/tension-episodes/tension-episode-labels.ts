// Textos dos Episódios de tensão (DEC-042, DEC-043). Tom acolhedor, sem aparência clínica.

export const FIELD_TEXT = {
  episodeDate: { label: 'Dia' },
  episodeTime: { label: 'Hora (opcional)', hint: 'Pode deixar em branco se não lembrar.' },
  situation: { label: 'O que estava acontecendo?', hint: 'Onde você estava, com quem, o que estava fazendo?' },
  tensionLevel: { label: 'Tensão', min: 'Nenhuma', max: 'Muito forte' },
  // Cobre o tique vocal ou de ansiedade, e não só a voz (DEC-042).
  vocalizeUrge: {
    label: 'Vontade de vocalizar',
    hint: 'Falar, gritar, se movimentar…',
    min: 'Nenhuma',
    max: 'Muito forte',
  },
  behavior: { label: 'O que você fez?' },
  consequence: { label: 'O que aconteceu depois?' },
} as const;

// Limite da DEC-042 (o mesmo da API).
export const TEXT_MAX = 1000;

// "às 14:30" ou "sem horário".
export function formatEpisodeTime(time: string | null): string {
  return time ? `às ${time}` : 'sem horário';
}
