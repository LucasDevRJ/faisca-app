import { describe, expect, it } from 'vitest';
import { formatDateTime } from './link-format';

describe('data e hora do vínculo (DEC-120)', () => {
  it('sem o ano quando é deste ano; com o ano quando é de outro', () => {
    expect(formatDateTime('2026-09-29T01:15:00.000Z', '2026-11-20')).toBe('28/09, 22:15');
    expect(formatDateTime('2025-09-29T01:15:00.000Z', '2026-11-20')).toBe('28/09/2025, 22:15');
  });
});
