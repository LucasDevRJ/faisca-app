// Testes do scripts/check-unique-ids.mjs. Rodar: node --test scripts/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { check, decNumbers, duplicates, listItems } from './check-unique-ids.mjs';

const privacy = (items) => `export const PRIVACY_VERSIONS = [\n${items.map((i) => `  '${i}',`).join('\n')}\n] as const;`;
const announcements = (items) => `export const ANNOUNCEMENTS = [\n${items.map((i) => `  '${i}',`).join('\n')}\n] as const;`;

function files({ decisions, versions = ['2026-10'], news = ['2026-10-lido'] }) {
  const map = {
    'docs/DECISIONS.md': decisions,
    'backend/src/modules/auth/privacy.ts': privacy(versions),
    'backend/src/modules/auth/announcements.ts': announcements(news),
  };
  return (path) => map[path];
}

test('duplicates devolve só o que repete, uma vez cada', () => {
  assert.deepEqual(duplicates(['a', 'b', 'a', 'c', 'a', 'b']), ['a', 'b']);
  assert.deepEqual(duplicates(['a', 'b']), []);
});

test('decNumbers lê só os títulos de DEC', () => {
  const md = '## DEC-086 — Telas\ntexto que cita a DEC-085\n## DEC-087 — Outra\n## Adiado';
  assert.deepEqual(decNumbers(md), ['DEC-086', 'DEC-087']);
});

test('listItems lê os itens da lista certa', () => {
  const source = `${privacy(['2026-10', '2026-11'])}\nexport const PRIVACY_VERSION = '2026-11';`;
  assert.deepEqual(listItems(source, 'PRIVACY_VERSIONS'), ['2026-10', '2026-11']);
});

test('sem repetição, nenhum problema', () => {
  assert.deepEqual(check(files({ decisions: '## DEC-086 — A\n## DEC-087 — B' })), []);
});

test('duas DEC-087 (dois agentes no mesmo número): acusa', () => {
  const problems = check(files({ decisions: '## DEC-087 — Acessibilidade\n## DEC-087 — Sessão terminada' }));
  assert.deepEqual(problems, ['DEC repetida: DEC-087']);
});

test('versão do aviso e novidade repetidas: acusa as duas', () => {
  const problems = check(
    files({ decisions: '## DEC-001 — A', versions: ['2026-11', '2026-11'], news: ['2026-11-x', '2026-11-x'] }),
  );
  assert.deepEqual(problems, ['Versão do aviso de privacidade repetida: 2026-11', 'Novidade repetida: 2026-11-x']);
});
