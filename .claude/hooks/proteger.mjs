// Hook PreToolUse do Claude Code (issue #45): transforma regras do CLAUDE.md em bloqueio.
// Recebe no stdin o JSON da ferramenta que o Claude vai usar e, se a ação for proibida,
// responde "deny" com o motivo. Vale só para o Claude, não para quem usa o terminal.
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

// O texto de um heredoc (<<'EOF' ... EOF) ou de uma here-string do PowerShell (@' ... '@) é
// conteúdo, como a mensagem de um commit, e não comando: sai da checagem. Fica só a linha
// que abre o bloco, onde está o comando de verdade.
function withoutHeredocs(command) {
  return command
    .replace(/(<<-?[ \t]*(['"]?)(\w+)\2[^\n]*)\n[\s\S]*?\n[ \t]*\3[ \t]*(?=\n|$)/g, '$1')
    .replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, '@$1$1@');
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }),
  );
  process.exit(0);
}

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  // Entrada inesperada: não bloqueia tudo por um defeito do próprio hook.
  process.exit(0);
}

const tool = input.tool_name;
const args = input.tool_input ?? {};

if (tool === 'Bash' || tool === 'PowerShell') {
  const command = withoutHeredocs(String(args.command ?? ''));
  for (const [pattern, reason] of COMMAND_RULES) {
    if (pattern.test(command)) deny(reason);
  }
} else {
  // Read: file_path · Grep: path e glob (o pattern do Grep é o texto buscado, não um arquivo) · Glob: pattern e path.
  const targets = tool === 'Glob' ? [args.pattern, args.path] : [args.file_path, args.path, args.glob];
  if (targets.some((target) => target && ENV_PATH.test(` ${target}`))) {
    deny('Arquivo .env bloqueado: o CLAUDE.md proíbe ler ou exibir .env. Use o .env.example.');
  }
}

process.exit(0);
