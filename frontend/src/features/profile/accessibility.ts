// Ajustes de acessibilidade (DEC-076, issue #87): abertos a todos (paciente e terapeuta),
// desligados por padrão e salvos na conta. Leitura confortável e menos movimento também ficam
// guardados no aparelho (localStorage), só como preferência visual para o theme-init.js aplicar
// antes da primeira pintura, sem piscar.

export type AccessibilitySettings = {
  directLanguage: boolean;
  oneThingAtATime: boolean;
  comfortableReading: boolean;
  noTimePressure: boolean;
  reducedMotion: boolean;
};

export type AccessibilityKey = keyof AccessibilitySettings;

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  directLanguage: false,
  oneThingAtATime: false,
  comfortableReading: false,
  noTimePressure: false,
  reducedMotion: false,
};

// Mantenha iguais às chaves usadas em public/theme-init.js.
export const COMFORTABLE_READING_STORAGE_KEY = 'faisca:comfortable-reading';
export const REDUCED_MOTION_STORAGE_KEY = 'faisca:reduced-motion';

export const ACCESSIBILITY_OPTIONS: {
  key: AccessibilityKey;
  label: string;
  hint: string;
}[] = [
  {
    key: 'directLanguage',
    label: 'Linguagem direta',
    hint: 'Textos mais literais e objetivos, sem expressões figuradas.',
  },
  {
    key: 'oneThingAtATime',
    label: 'Uma coisa por vez',
    hint: 'Divide os formulários longos em passos curtos, com Anterior e Próximo.',
  },
  {
    key: 'comfortableReading',
    label: 'Leitura confortável',
    hint: 'Aumenta a letra e o espaço entre linhas e palavras.',
  },
  {
    key: 'noTimePressure',
    label: 'Sem pressão de tempo',
    hint: 'Esconde contagens de dias para a consulta e prazos nos cartões.',
  },
  {
    key: 'reducedMotion',
    label: 'Menos movimento',
    hint: 'Desliga animações e transições na tela e nos gráficos.',
  },
];

// Aplica no <html> os dois ajustes de CSS (leitura confortável e menos movimento). persist = false
// na prévia da escolha: se a pessoa sair de Conta sem salvar, o aparelho continua com o que estava
// salvo.
export function applyAccessibility(
  settings: Pick<AccessibilitySettings, 'comfortableReading' | 'reducedMotion'>,
  { persist = true } = {},
) {
  const root = document.documentElement;
  if (settings.comfortableReading) root.dataset.comfortableReading = 'true';
  else delete root.dataset.comfortableReading;

  if (settings.reducedMotion) root.dataset.reducedMotion = 'true';
  else delete root.dataset.reducedMotion;

  if (!persist) return;
  try {
    if (settings.comfortableReading) localStorage.setItem(COMFORTABLE_READING_STORAGE_KEY, 'true');
    else localStorage.removeItem(COMFORTABLE_READING_STORAGE_KEY);

    if (settings.reducedMotion) localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, 'true');
    else localStorage.removeItem(REDUCED_MOTION_STORAGE_KEY);
  } catch {
    // Sem localStorage: os ajustes chegam com a sessão, depois de abrir.
  }
}

// Desliga animações nos gráficos quando o sistema ou a conta pede menos movimento.
export function prefersReducedMotion(accountReducedMotion = false): boolean {
  if (accountReducedMotion) return true;
  if (typeof document !== 'undefined' && document.documentElement.dataset.reducedMotion === 'true') return true;
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}
