// Confere se cada commit de um PR diz qual IA fez o código e com que nível (DEC-144).
// Só avisa (::warning do GitHub Actions) e nunca falha: commit sem as linhas não barra o PR.
// Uso: node scripts/check-commit-trailers.mjs <base> <head>
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const REQUIRED = ['Modelo', 'Nivel'];

// Lê as linhas "Chave: valor" do último parágrafo da mensagem (os trailers do Git).
export function trailers(message) {
  const paragraphs = message.trim().split(/\n\s*\n/);
  const last = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : '';
  const found = {};
  for (const line of last.split('\n')) {
    const match = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(line.trim());
    if (match) found[match[1].toLowerCase()] = match[2];
  }
  return found;
}

export function missing(message) {
  const found = trailers(message);
  return REQUIRED.filter((key) => !found[key.toLowerCase()]?.trim());
}

// Commits de robô (Dependabot, GitHub) ficam de fora: não foram escritos por um agente.
export function isBot(author) {
  return /\[bot\]$/.test(author);
}

export function problems(commits) {
  return commits
    .filter(({ author }) => !isBot(author))
    .map(({ sha, subject, message }) => ({ sha, subject, missing: missing(message) }))
    .filter(({ missing: absent }) => absent.length > 0);
}

function readCommits(base, head) {
  const raw = execFileSync('git', ['log', '--no-merges', '--format=%H%x1f%an%x1f%s%x1f%B%x1e', `${base}..${head}`], {
    encoding: 'utf8',
  });
  return raw
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, author, subject, message] = entry.split('\x1f');
      return { sha, author, subject, message };
    });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.log('Uso: node scripts/check-commit-trailers.mjs <base> <head>');
    process.exit(0);
  }
  const found = problems(readCommits(base, head));
  // O título do commit vai para um comando do Actions: escapa o que o Actions interpretaria.
  const escape = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  for (const { sha, subject, missing: absent } of found) {
    console.log(`::warning title=Commit sem ${absent.join(' e ')}::${sha.slice(0, 7)} ${escape(subject)} (DEC-144: termine com "Modelo: ..." e "Nivel: ...")`);
  }
  console.log(found.length === 0 ? 'Todos os commits dizem o modelo e o nível.' : `${found.length} commit(s) sem modelo ou nível (só aviso).`);
}
