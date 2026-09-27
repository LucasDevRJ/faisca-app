import { describe, expect, it } from 'vitest';
import { lastAndNext } from './appointments.service.js';

const at = (appointmentDate: string) => ({ appointmentDate });
const TODAY = '2026-09-27';

describe('lastAndNext (SPEC, Consultas)', () => {
  it('última = a mais recente até hoje; próxima = a mais próxima a partir de amanhã', () => {
    const result = lastAndNext(
      [at('2026-10-11'), at('2026-09-13'), at('2026-10-04'), at('2026-09-20')],
      TODAY,
    );

    expect(result.last).toEqual(at('2026-09-20'));
    expect(result.next).toEqual(at('2026-10-04'));
  });

  it('consulta de hoje é a última, não a próxima', () => {
    const result = lastAndNext([at(TODAY), at('2026-09-28')], TODAY);

    expect(result.last).toEqual(at(TODAY));
    expect(result.next).toEqual(at('2026-09-28'));
  });

  it('sem consultas antes ou depois, o lado vazio é null', () => {
    expect(lastAndNext([], TODAY)).toEqual({ last: null, next: null });
    expect(lastAndNext([at('2026-09-01')], TODAY)).toEqual({ last: at('2026-09-01'), next: null });
    expect(lastAndNext([at('2026-12-01')], TODAY)).toEqual({ last: null, next: at('2026-12-01') });
  });
});
