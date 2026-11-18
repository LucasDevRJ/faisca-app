import { afterEach, describe, expect, it, vi } from 'vitest';
import { cycleRefreshInterval, type CycleResponse } from './cycle-api';

describe('agenda da virada do ciclo', () => {
  afterEach(() => vi.useRealTimers());

  it('agenda o refetch para a hora da sessão em São Paulo', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T16:59:00.000Z'));
    const response = {
      today: '2026-10-14',
      cycle: { nextChangeAt: '2026-10-14T17:00:00.000Z' },
    } as CycleResponse;

    expect(cycleRefreshInterval(response, null)).toBe(60_250);
  });

  it('não agenda outra consulta depois da virada nem para um ciclo explícito', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T17:00:00.000Z'));
    const response = {
      today: '2026-10-14',
      cycle: { nextChangeAt: null },
    } as CycleResponse;

    expect(cycleRefreshInterval(response, null)).toBe(false);
    expect(cycleRefreshInterval({ ...response, cycle: { nextChangeAt: '2026-10-15T17:00:00.000Z' } } as CycleResponse, '2026-10-14')).toBe(false);
  });
});
