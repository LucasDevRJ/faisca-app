// Testes do scripts/check-commit-trailers.mjs. Rodar: node --test scripts/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBot, missing, problems, trailers } from './check-commit-trailers.mjs';

const full = 'feat: algo\n\nCorpo.\n\nModelo: Opus 5.5\nNivel: não informado\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';

test('lê os trailers do último parágrafo', () => {
  assert.deepEqual(trailers(full), {
    modelo: 'Opus 5.5',
    nivel: 'não informado',
    'co-authored-by': 'Claude Opus 5.5 <noreply@anthropic.com>',
  });
});

test('com modelo e nível, nada falta', () => {
  assert.deepEqual(missing(full), []);
});

test('sem nível, acusa só o nível', () => {
  assert.deepEqual(missing('fix: x\n\nModelo: GPT-5'), ['Nivel']);
});

test('"Modelo:" no meio do corpo não conta: só o último parágrafo', () => {
  assert.deepEqual(missing('docs: x\n\nModelo: Opus 5.5\nNivel: alto\n\nCloses #1'), ['Modelo', 'Nivel']);
});

test('valor vazio conta como ausente', () => {
  assert.deepEqual(missing('chore: x\n\nModelo:\nNivel: alto'), ['Modelo']);
});

test('commit só com o título acusa os dois', () => {
  assert.deepEqual(missing('chore: x'), ['Modelo', 'Nivel']);
});

test('commits de robô ficam de fora', () => {
  assert.equal(isBot('dependabot[bot]'), true);
  assert.equal(isBot('Lucas'), false);
  const found = problems([
    { sha: 'a'.repeat(40), author: 'dependabot[bot]', subject: 'chore(deps): x', message: 'chore(deps): x' },
    { sha: 'b'.repeat(40), author: 'Lucas', subject: 'feat: y', message: 'feat: y' },
    { sha: 'c'.repeat(40), author: 'Lucas', subject: 'feat: z', message: full },
  ]);
  assert.deepEqual(found, [{ sha: 'b'.repeat(40), subject: 'feat: y', missing: ['Modelo', 'Nivel'] }]);
});
