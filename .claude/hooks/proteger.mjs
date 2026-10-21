// Hook PreToolUse do Claude Code (issue #45): transforma regras do CLAUDE.md em bloqueio.
// Recebe no stdin o JSON da ferramenta que o Claude vai usar e, se a ação for proibida,
// responde "deny" com o motivo (ou "ask", quando quem decide é o usuário). Vale só para o
// Claude, não para quem usa o terminal. Testes: node --test .claude/hooks/proteger.test.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// .env, .env.local, .env.production... mas não .env.example (CLAUDE.md: nunca ler .env).
const ENV_FILE = /(^|[\\/\s"'=:])\.env(?!\.example\b)(\.[\w.-]+)?(?=$|[\s"'`;|&)<>])/;
// Para caminhos e globs (Read, Grep, Glob): o último trecho começa com .env, com ou sem
// curingas (.env*, .env.{local,test}), e não é o .env.example.
const ENV_PATH = /(^|[\\/\s])\.env(?!\.example$)[^\\/\s]*$/;

const COMMAND_RULES = [
  [/\bgit\s+[^\n]*\s--no-verify\b/, 'O CLAUDE.md proíbe --no-verify. Se um hook do Git falhou, corrija a causa.'],
  [
    /\bgit\s+push\b.*(\s--force(-with-lease)?\b|\s-f\b|\s\+\S)/,
    'Force push bloqueado (CLAUDE.md). Se for mesmo necessário, o usuário roda com "!" no terminal.',
  ],
  [/\bprisma\s+db\s+push\b/, 'prisma db push é proibido (backend/CLAUDE.md). Use uma migration nova.'],
  [ENV_FILE, 'Comando que menciona um arquivo .env: o CLAUDE.md proíbe ler ou exibir .env. Use o .env.example.'],
];

// Migration do Prisma (issue #41): uma pasta de prisma/migrations, ou um arquivo dentro dela. O
// "backend/" é opcional, porque os comandos do backend rodam dentro da pasta backend/.
const MIGRATION_FILE = /(?:^|[\\/\s"'`=:(])(?:backend[\\/])?prisma[\\/]migrations[\\/]([^\\/\s"'`;|&)]+)/g;
// Comando que escreve, move ou apaga arquivo. Leitura (cat, grep, sed -n, git diff) passa.
// Comandos que mexem no arquivo que vem depois deles na linha.
const WRITE_COMMANDS = /\bsed\s+(-\w*\s+)*-i|\btee\b|\b(Set|Add)-Content\b|\bOut-File\b|\b(cp|mv|rm)\s|\b(Copy|Move|Remove)-Item\b/;
// O ">" e o open( de um script só contam quando o alvo é o próprio migration.sql: assim um script
// que lê outro arquivo, ou um "2>/dev/null", não viram falso positivo.
const MIGRATION_PATH = String.raw`[^\s"'()]*migrations[\\/][^\s"'()]+[\\/]migration\.sql`;
const WRITE_TARGETS = new RegExp(
  String.raw`(?<![\d&-])>{1,2}\s*["']?${MIGRATION_PATH}|open\(\s*["']${MIGRATION_PATH}["']\s*,\s*["'][wa]`,
);

function writesMigration(command) {
  return WRITE_TARGETS.test(command) || command.split(/\r?\n|;|&&|\|\|/).some(
    (part) => WRITE_COMMANDS.test(part) && migrationFolders(part).length > 0,
  );
}

const APPLIED_MIGRATION =
  'Migration já aplicada em produção (está na main): nunca a edite. Crie uma migration nova com a correção (skill nova-migration).';
const BRANCH_MIGRATION =
  'Esta migration ainda não está na main. Se ela já rodou no faisca_test ou no banco de dev, crie outra em vez de editar: o banco guarda a versão antiga. Editar só é seguro se ela nunca foi aplicada.';

// A pasta da migration existe na main (local ou do remoto)? Então já foi para produção.
function onMain(folder) {
  for (const ref of ['main', 'origin/main']) {
    try {
      execFileSync('git', ['cat-file', '-e', `${ref}:backend/prisma/migrations/${folder}/migration.sql`], {
        cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
        stdio: 'ignore',
      });
      return true;
    } catch {
      // Não está nessa referência (ou o git não respondeu): tenta a próxima.
    }
  }
  return false;
}

function migrationFolders(text) {
  return [...String(text ?? '').matchAll(MIGRATION_FILE)]
    .map((match) => match[1])
    .filter((folder) => folder !== 'migration_lock.toml');
}

// O texto de um heredoc (<<'EOF' ... EOF) ou de uma here-string do PowerShell (@' ... '@) é
// conteúdo, como a mensagem de um commit, e não comando: sai da checagem. Fica só a linha
// que abre o bloco, onde está o comando de verdade.
function withoutHeredocs(command) {
  return command
    .replace(/(<<-?[ \t]*(['"]?)(\w+)\2[^\n]*)\n[\s\S]*?\n[ \t]*\3[ \t]*(?=\n|$)/g, '$1')
    .replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, '@$1$1@');
}

function decide(permissionDecision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason: reason },
    }),
  );
  process.exit(0);
}

const deny = (reason) => decide('deny', reason);
const ask = (reason) => decide('ask', reason);

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  // Entrada inesperada: não bloqueia tudo por um defeito do próprio hook.
  process.exit(0);
}

const tool = input.tool_name;
const args = input.tool_input ?? {};

if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') {
  // Escrever num .env também é proibido (CLAUDE.md), não só ler.
  if (args.file_path && ENV_PATH.test(` ${args.file_path}`)) {
    deny('Arquivo .env bloqueado: o CLAUDE.md proíbe mexer no .env. Use o .env.example.');
  }
  for (const folder of migrationFolders(args.file_path)) {
    if (onMain(folder)) deny(APPLIED_MIGRATION);
    ask(BRANCH_MIGRATION);
  }
} else if (tool === 'Bash' || tool === 'PowerShell') {
  const full = String(args.command ?? '');
  const command = withoutHeredocs(full);
  for (const [pattern, reason] of COMMAND_RULES) {
    if (pattern.test(command)) deny(reason);
  }
  // Aqui vale o comando inteiro, com o heredoc: um script Python dentro dele também escreve.
  if (writesMigration(full)) {
    const folders = migrationFolders(full);
    if (folders.some(onMain)) deny(APPLIED_MIGRATION);
    if (folders.length > 0) ask(BRANCH_MIGRATION);
  }
} else {
  // Read: file_path · Grep: path e glob (o pattern do Grep é o texto buscado, não um arquivo) · Glob: pattern e path.
  const targets = tool === 'Glob' ? [args.pattern, args.path] : [args.file_path, args.path, args.glob];
  if (targets.some((target) => target && ENV_PATH.test(` ${target}`))) {
    deny('Arquivo .env bloqueado: o CLAUDE.md proíbe ler ou exibir .env. Use o .env.example.');
  }
}

process.exit(0);
