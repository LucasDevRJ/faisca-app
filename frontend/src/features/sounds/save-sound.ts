// Som e vibração ao salvar (issues #93 e #272, DEC-135). Desligados por padrão e guardados só neste
// aparelho, por conta (como a cor de destaque): a pessoa pode ter som no celular e silêncio no
// computador do trabalho. Os sons são gerados pelo navegador (Web Audio), sem arquivo de áudio.
// O "Menos movimento" não desliga o som: são escolhas diferentes.

export const saveSounds = {
  gota: 'Gota',
  sino: 'Sino suave',
  madeira: 'Madeira',
} as const;
export type SaveSound = keyof typeof saveSounds;

export const soundVolumes = {
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
} as const;
export type SoundVolume = keyof typeof soundVolumes;

export type SoundSettings = {
  enabled: boolean;
  sound: SaveSound;
  volume: SoundVolume;
  vibration: boolean;
};

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: false,
  sound: 'gota',
  volume: 'baixo',
  vibration: false,
};

// "record": todo registro salvo, com o som escolhido. "complete": atividade concluída, sempre as
// duas notas subindo (o único momento um pouco mais caloroso, #93).
export type SaveMoment = 'record' | 'complete';

const storageKey = (userId: string) => `faisca:save-sound:${userId}`;
const offerKey = (userId: string) => `faisca:save-sound-offer:${userId}`;

export function readSoundSettings(userId: string): SoundSettings {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_SOUND_SETTINGS;
    const value = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      enabled: value.enabled === true,
      sound: value.sound && Object.hasOwn(saveSounds, value.sound) ? value.sound : DEFAULT_SOUND_SETTINGS.sound,
      volume: value.volume && Object.hasOwn(soundVolumes, value.volume) ? value.volume : DEFAULT_SOUND_SETTINGS.volume,
      vibration: value.vibration === true,
    };
  } catch {
    // Sem armazenamento (ou valor estragado), fica tudo desligado.
    return DEFAULT_SOUND_SETTINGS;
  }
}

export function saveSoundSettings(userId: string, settings: SoundSettings) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(settings));
  } catch {
    // Navegador sem armazenamento: a escolha vale só até fechar a página.
  }
}

// Convite da primeira vez ("Quer ouvir um som suave ao salvar?"): aparece uma vez por aparelho.
export function wasSoundOffered(userId: string) {
  try {
    return localStorage.getItem(offerKey(userId)) === 'true';
  } catch {
    return true;
  }
}

export function markSoundOffered(userId: string) {
  try {
    localStorage.setItem(offerKey(userId), 'true');
  } catch {
    // Sem armazenamento, o convite pode voltar: é discreto e some com um toque.
  }
}

type AudioContextClass = typeof AudioContext;

function audioContextClass(): AudioContextClass | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
}

export function canPlaySounds() {
  return audioContextClass() !== undefined;
}

// O Chrome do computador também tem navigator.vibrate, mas não vibra: só conta aparelho de toque.
export function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && navigator.maxTouchPoints > 0;
}

let context: AudioContext | null = null;

function getContext() {
  const Context = audioContextClass();
  if (!Context) return null;
  if (!context) {
    // No iPhone, "ambient" faz o som respeitar a chave do modo silencioso.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    context = new Context();
  }
  return context;
}

// Suspenso ou interrompido (no iPhone: chamada, app em segundo plano): retoma antes de agendar,
// senão os tons saem atrasados quando o contexto voltar.
async function runningContext() {
  const audio = getContext();
  if (!audio) return null;
  if (audio.state !== 'running') {
    try {
      await audio.resume();
    } catch {
      return null;
    }
  }
  return audio.state === 'running' ? audio : null;
}

// O navegador só deixa tocar som depois de um gesto. O salvar termina depois da resposta da API,
// então o áudio é destravado nos toques da página, para quem ligou o som. No toque, o Chrome do
// Android e o Safari só contam o gesto no fim (touchend/click), não no pointerdown; os ouvintes só
// saem quando o áudio está de fato rodando.
const UNLOCK_EVENTS = ['click', 'touchend', 'keydown'] as const;

export function unlockAudioOnFirstTouch(userId: string) {
  if (!readSoundSettings(userId).enabled || !canPlaySounds()) return () => undefined;
  const remove = () => {
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock);
  };
  const unlock = () => {
    const audio = getContext();
    if (!audio) return remove();
    if (audio.state === 'running') return remove();
    void audio.resume().then(() => {
      if (audio.state === 'running') remove();
    }, () => undefined);
  };
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock);
  return remove;
}

const GAIN: Record<SoundVolume, number> = { baixo: 0.05, medio: 0.1, alto: 0.18 };

type Tone = { at: number; from: number; to?: number; length: number; type?: OscillatorType; level?: number };

// Cada som tem menos de 1 s e volume baixo.
const TONES: Record<SaveSound | 'complete', Tone[]> = {
  // Senoide curta que desce de ~880 Hz para ~520 Hz (#93).
  gota: [{ at: 0, from: 880, to: 520, length: 0.14 }],
  // Dó agudo com um harmônico fraco, que some devagar.
  sino: [
    { at: 0, from: 1046.5, length: 0.7 },
    { at: 0, from: 2093, length: 0.45, level: 0.25 },
  ],
  // Batida seca de madeira: dois tons curtos sem sustentação.
  madeira: [
    { at: 0, from: 740, length: 0.07, type: 'triangle' },
    { at: 0, from: 1180, length: 0.05, type: 'triangle', level: 0.5 },
  ],
  // Mi (659 Hz) e depois si (988 Hz), ~0,13 s de intervalo (#93).
  complete: [
    { at: 0, from: 659.25, length: 0.16 },
    { at: 0.13, from: 987.77, length: 0.22 },
  ],
};

export async function playSound(sound: SaveSound | 'complete', volume: SoundVolume) {
  const audio = await runningContext();
  if (!audio) return;
  const start = audio.currentTime + 0.01;
  for (const tone of TONES[sound]) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const begin = start + tone.at;
    const end = begin + tone.length;
    oscillator.type = tone.type ?? 'sine';
    oscillator.frequency.setValueAtTime(tone.from, begin);
    if (tone.to) oscillator.frequency.exponentialRampToValueAtTime(tone.to, end);
    // Entrada rápida e saída suave, para não estalar.
    gain.gain.setValueAtTime(0.0001, begin);
    gain.gain.exponentialRampToValueAtTime(GAIN[volume] * (tone.level ?? 1), begin + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(begin);
    oscillator.stop(end + 0.02);
  }
}

// Prepara o áudio dentro de um toque (ex.: "Ligar som"), para o próximo salvar tocar no iPhone.
export function primeAudio() {
  getContext();
}

export function vibrateOnce() {
  if (canVibrate()) navigator.vibrate(30);
}

// Chamado quando um registro foi salvo por inteiro (com o ✓ na tela).
export function playSaveFeedback(userId: string, moment: SaveMoment) {
  const settings = readSoundSettings(userId);
  if (settings.enabled) void playSound(moment === 'complete' ? 'complete' : settings.sound, settings.volume);
  if (settings.vibration) vibrateOnce();
}
