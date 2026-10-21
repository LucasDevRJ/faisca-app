// Testes do hook proteger.mjs. Rodar na raiz do repositório: node --test .claude/hooks/proteger.test.mjs
// Precisam do histórico do git (a main), porque a regra das migrations olha o que já está nela.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const HOOK = fileURLToPath(new URL('./proteger.mjs', import.meta.url));

// Uma migration que já está na main (foi para produção em 15/10/2026) e uma que não existe nela.
const APPLIED = 'backend/prisma/migrations/20261015120000_thought_record_alternative/migration.sql';
const NEW = 'backend/prisma/migrations/29991231000000_nova_ficticia/migration.sql';

function run(tool_name, tool_input) {
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify({ tool_name, tool_input }),
    encoding: 'utf8',
  });
  return out ? JSON.parse(out).hookSpecificOutput.permissionDecision : 'allow';
}

describe('regras que já existiam', () => {
  it('bloqueia .env, --no-verify, force push e prisma db push', () => {
    assert.equal(run('Read', { file_path: 'backend/.env' }), 'deny');
    assert.equal(run('Bash', { command: 'git commit --no-verify -m "x"' }), 'deny');
    assert.equal(run('Bash', { command: 'git push --force origin main' }), 'deny');
    assert.equal(run('Bash', { command: 'npx prisma db push' }), 'deny');
  });

  it('libera o .env.example e o texto de um heredoc', () => {
    assert.equal(run('Read', { file_path: 'backend/.env.example' }), 'allow');
    assert.equal(run('Bash', { command: "git commit -F - <<'EOF'\nnão usar --no-verify\nEOF" }), 'allow');
  });
});

describe('migrations (issue #41)', () => {
  it('editar ou sobrescrever migration que está na main: bloqueia', () => {
    assert.equal(run('Edit', { file_path: APPLIED, old_string: 'a', new_string: 'b' }), 'deny');
    assert.equal(run('Write', { file_path: `C:\\workspace\\faisca-app\\${APPLIED.replaceAll('/', '\\')}`, content: '' }), 'deny');
  });

  it('migration só da branch: pergunta, porque pode já ter rodado no banco local', () => {
    assert.equal(run('Edit', { file_path: NEW, old_string: 'a', new_string: 'b' }), 'ask');
    assert.equal(run('Write', { file_path: NEW, content: '-- nova' }), 'ask');
  });

  it('Write ou Edit num .env: bloqueia', () => {
    assert.equal(run('Write', { file_path: 'backend/.env', content: 'X=1' }), 'deny');
    assert.equal(run('Edit', { file_path: 'C:\\workspace\\faisca-app\\backend\\.env', old_string: 'a', new_string: 'b' }), 'deny');
    assert.equal(run('Write', { file_path: 'backend/.env.example', content: 'X=CHANGE_ME' }), 'allow');
  });

  it('caminho relativo (dentro de backend/) e pasta inteira também contam', () => {
    const folder = APPLIED.replace('backend/', '').replace('/migration.sql', '');
    assert.equal(run('Bash', { command: `cd backend && sed -i 's/1000/5000/' ${folder}/migration.sql` }), 'deny');
    assert.equal(run('Bash', { command: `rm -rf ${APPLIED.replace('/migration.sql', '')}` }), 'deny');
    assert.equal(run('Edit', { file_path: `${folder}/migration.sql`, old_string: 'a', new_string: 'b' }), 'deny');
  });

  it('comando que escreve numa migration só da branch: pergunta', () => {
    assert.equal(run('Bash', { command: `echo "-- x" >> ${NEW}` }), 'ask');
    assert.equal(run('Bash', { command: `cat ${NEW}` }), 'allow');
  });

  it('comando que escreve numa migration da main: bloqueia', () => {
    assert.equal(run('Bash', { command: `sed -i 's/1000/5000/' ${APPLIED}` }), 'deny');
    assert.equal(run('Bash', { command: `echo "-- x" >> ${APPLIED}` }), 'deny');
    assert.equal(run('Bash', { command: `rm ${APPLIED}` }), 'deny');
    assert.equal(run('PowerShell', { command: `Set-Content ${APPLIED} ''` }), 'deny');
    // Script Python num heredoc também escreve.
    assert.equal(
      run('Bash', { command: `python - <<'EOF'\nopen('${APPLIED}', 'w').write('')\nEOF` }),
      'deny',
    );
  });

  it('ler uma migration da main é livre', () => {
    assert.equal(run('Read', { file_path: APPLIED }), 'allow');
    assert.equal(run('Bash', { command: `cat ${APPLIED}` }), 'allow');
    assert.equal(run('Bash', { command: `grep -n CHECK ${APPLIED} 2>/dev/null` }), 'allow');
    assert.equal(run('Bash', { command: `git diff main -- ${APPLIED}` }), 'allow');
    // Falso positivo de 20/10: um script que lê outro arquivo, na mesma linha que cita a migration.
    assert.equal(
      run('Bash', { command: `[ -f ${APPLIED} ] && echo ok; python -c "open('a.yml').read()"` }),
      'allow',
    );
  });

  it('outros arquivos seguem livres', () => {
    assert.equal(run('Edit', { file_path: 'backend/prisma/schema.prisma', old_string: 'a', new_string: 'b' }), 'allow');
    assert.equal(run('Write', { file_path: 'frontend/src/app.tsx', content: '' }), 'allow');
  });
});
