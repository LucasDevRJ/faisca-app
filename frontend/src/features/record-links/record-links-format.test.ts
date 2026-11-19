import { describe, expect, it } from 'vitest';
import { formatRecordDate, recordTitlePreview } from './record-links-format';

describe('formatação das ligações entre registros', () => {
  it('mostra a data no padrão brasileiro sem reinterpretar um valor inesperado', () => {
    expect(formatRecordDate('2026-09-23')).toBe('23/09/2026');
    expect(formatRecordDate('data inesperada')).toBe('data inesperada');
  });

  it('normaliza espaços e prefere a primeira frase curta', () => {
    expect(recordTitlePreview('  Uma   primeira frase.  A segunda frase.  ', 30)).toBe('Uma primeira frase.');
  });

  it('encurta uma frase longa sem cortar uma palavra quando possível', () => {
    expect(recordTitlePreview('Uma situação longa que descreve em detalhes o contexto do registro', 36)).toBe(
      'Uma situação longa que descreve em…',
    );
  });

  it('não divide caracteres Unicode ao encurtar um título', () => {
    expect(recordTitlePreview('🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂', 20)).toBe('🙂'.repeat(20) + '…');
  });
});
