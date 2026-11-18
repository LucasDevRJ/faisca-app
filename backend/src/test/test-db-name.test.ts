import { describe, expect, it } from 'vitest';
import { DEFAULT_TEST_DATABASE, testDatabaseName } from '../../scripts/test-db.js';

// Banco de testes por agente (DEC-110): só nomes que começam com faisca_test e são seguros no
// CREATE DATABASE.
describe('nome do banco de testes', () => {
  it('sem a variável, o faisca_test de sempre', () => {
    expect(testDatabaseName('')).toBe(DEFAULT_TEST_DATABASE);
    expect(DEFAULT_TEST_DATABASE).toBe('faisca_test');
  });

  it('aceita o banco de cada agente', () => {
    expect(testDatabaseName('faisca_test_claude')).toBe('faisca_test_claude');
    expect(testDatabaseName('faisca_test_codex_2')).toBe('faisca_test_codex_2');
  });

  it('recusa o banco de dev, outros nomes e qualquer coisa que vire SQL', () => {
    for (const name of [
      'faisca',
      'postgres',
      'faisca_testes',
      'outro_faisca_test',
      'faisca_test_Claude',
      'faisca_test; DROP DATABASE faisca',
      'faisca_test-claude',
      `faisca_test_${'a'.repeat(60)}`,
    ]) {
      expect(() => testDatabaseName(name), name).toThrow();
    }
  });
});
