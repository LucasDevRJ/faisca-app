import { describe, expect, it } from 'vitest';
import type { ActivityStatus } from '../../generated/prisma/client.js';
import { assertEditable, assertTransition, isFutureDate, type TransitionName } from './activities.service.js';

// Cada linha é uma transição da SPEC (Atividades > Transições).
const allowed: [ActivityStatus, TransitionName][] = [
  ['PLANEJADA', 'start'],
  ['PENDENTE', 'complete'],
  ['PLANEJADA', 'notDone'],
  ['PENDENTE', 'notDone'],
];

const notAllowed: [ActivityStatus, TransitionName][] = [
  ['PENDENTE', 'start'],
  ['PLANEJADA', 'complete'],
];

const finals: ActivityStatus[] = ['CONCLUIDA', 'NAO_REALIZADA'];

describe('assertTransition', () => {
  it.each(allowed)('%s aceita %s', (status, transition) => {
    expect(() => assertTransition(status, transition)).not.toThrow();
  });

  it.each(notAllowed)('%s recusa %s com INVALID_TRANSITION', (status, transition) => {
    expect(() => assertTransition(status, transition)).toThrow(
      expect.objectContaining({ statusCode: 409, code: 'INVALID_TRANSITION' }),
    );
  });

  it.each(finals)('%s é final: toda transição dá ACTIVITY_FINALIZED', (status) => {
    for (const transition of ['start', 'complete', 'notDone'] as const) {
      expect(() => assertTransition(status, transition)).toThrow(
        expect.objectContaining({ statusCode: 409, code: 'ACTIVITY_FINALIZED' }),
      );
    }
  });
});

describe('assertEditable', () => {
  it.each(['PLANEJADA', 'PENDENTE'] as const)('%s pode ser editada', (status) => {
    expect(() => assertEditable(status)).not.toThrow();
  });

  it.each(finals)('%s não pode ser editada', (status) => {
    expect(() => assertEditable(status)).toThrow(expect.objectContaining({ statusCode: 409 }));
  });
});

describe('isFutureDate', () => {
  it('hoje e ontem não são futuro; amanhã é', () => {
    expect(isFutureDate('2026-09-27', '2026-09-27')).toBe(false);
    expect(isFutureDate('2026-09-26', '2026-09-27')).toBe(false);
    expect(isFutureDate('2026-09-28', '2026-09-27')).toBe(true);
  });
});
