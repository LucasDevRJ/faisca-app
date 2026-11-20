import { describe, expect, it } from 'vitest';
import { dayRecordAnchorId, formatRecordDate, recordAnchorId, recordLinkHref, recordTitlePreview } from './record-links-format';

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

  it('abre o registro do paciente na área e semana corretas', () => {
    const id = '00000000-0000-4000-9000-000000000099';
    expect(recordLinkHref({ type: 'THOUGHT_RECORD', id, date: '2026-09-23', title: 'Pensamento fictício' }))
      .toBe(`/pensamentos?semana=2026-09-21#${recordAnchorId(id)}`);
  });

  it('abre um registro da profissional na aba e período adequados', () => {
    const id = '00000000-0000-4000-9000-000000000099';
    const href = recordLinkHref({ type: 'ACTION', id, date: '2026-09-23', title: 'Ação fictícia' }, 'patient-id');
    const url = new URL(href, 'https://faisca.test');
    expect(url.pathname).toBe('/pacientes/patient-id');
    expect(url.searchParams.get('aba')).toBe('acao');
    expect(url.searchParams.get('semana')).toBe('2026-09-21');
    expect(url.searchParams.get('ate')).toBe('2026-09-23');
    expect(url.hash).toBe(`#${recordAnchorId(id)}`);
  });

  it('abre um registro de plano dentro do plano ao qual pertence', () => {
    const entryId = '00000000-0000-4000-9000-000000000099';
    const planId = '00000000-0000-4000-9000-000000000098';
    expect(recordLinkHref({ type: 'PLAN_ENTRY', id: entryId, parentId: planId, date: '2026-09-23', title: 'Registro' }))
      .toBe(`/planos/${planId}?semana=2026-09-21#${recordAnchorId(entryId)}`);
  });

  it('usa o dia como destino para registros de sono, humor e remédio', () => {
    expect(recordLinkHref({ type: 'MEDICATION', id: 'id', date: '2026-09-23', title: 'Remédio do dia' }))
      .toBe(`/sono-humor?semana=2026-09-21#${dayRecordAnchorId('2026-09-23')}`);
  });
});
