// Confere que nenhum identificador "numerado à mão" se repete (AGENTS.md, "Mais de um agente").
// Com dois agentes trabalhando ao mesmo tempo, os dois podem escolher o mesmo próximo número; o
// conflito de merge só aparece se escreverem no mesmo trecho do arquivo. Este script pega o resto:
// - DEC repetida no docs/DECISIONS.md;
// - versão repetida do aviso de privacidade (PRIVACY_VERSIONS);
// - novidade repetida (ANNOUNCEMENTS).
// Uso: node scripts/check-unique-ids.mjs   (sai com 1 se achar repetição)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);

// Devolve os valores que aparecem mais de uma vez, na ordem em que aparecem.
export function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

export function decNumbers(markdown) {
  return [...markdown.matchAll(/^## (DEC-\d+)\b/gm)].map((match) => match[1]);
}

// Os itens entre aspas simples de `export const NOME = [ ... ]`.
export function listItems(source, name) {
  const start = source.indexOf(`export const ${name} = [`);
  if (start === -1) throw new Error(`Não achei a lista ${name}.`);
  const end = source.indexOf(']', start);
  return [...source.slice(start, end).matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

export function check(read) {
  const problems = [];
  const report = (what, values) => {
    for (const value of duplicates(values)) problems.push(`${what} repetida: ${value}`);
  };
  report('DEC', decNumbers(read('docs/DECISIONS.md')));
  report('Versão do aviso de privacidade', listItems(read('backend/src/modules/auth/privacy.ts'), 'PRIVACY_VERSIONS'));
  report('Novidade', listItems(read('backend/src/modules/auth/announcements.ts'), 'ANNOUNCEMENTS'));
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = check((path) => readFileSync(new URL(path, root), 'utf8'));
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    console.error('Outro PR (talvez de outro agente) usou o mesmo número. Junte a main e escolha o próximo livre.');
    process.exit(1);
  }
  console.log('Nenhum número repetido (DEC, versão do aviso, novidade).');
}
