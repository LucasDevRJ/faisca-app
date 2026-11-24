import { vi } from 'vitest';

// O jsdom não tem Web Audio nem vibração: este falso conta os tons e as vibrações (DEC-135). A
// lista é do módulo porque o app reaproveita o mesmo AudioContext entre os testes.
const tones: number[] = [];

export function installFakeAudio({ vibrate = true } = {}) {
  tones.length = 0;
  const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = vi.fn(() => Promise.resolve());
    createGain() {
      return { gain: param(), connect: (node: unknown) => node };
    }
    createOscillator() {
      const frequency = {
        ...param(),
        setValueAtTime: vi.fn((value: number) => tones.push(value)),
      };
      return { type: 'sine', frequency, connect: (node: unknown) => node, start: vi.fn(), stop: vi.fn() };
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  const vibrations = vi.fn(() => true);
  if (vibrate) {
    Object.defineProperty(navigator, 'vibrate', { value: vibrations, configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
  }
  return {
    tones,
    vibrations,
    restore() {
      vi.unstubAllGlobals();
      if (vibrate) {
        delete (navigator as { vibrate?: unknown }).vibrate;
        delete (navigator as { maxTouchPoints?: unknown }).maxTouchPoints;
      }
    },
  };
}
