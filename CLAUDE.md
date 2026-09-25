@AGENTS.md

# Regras para o Claude

## Comunicação
- Responda em pt-BR, de forma didática e prática.
- Ao refatorar, preserve a lógica e explique as mudanças importantes.

## Antes de agir
- Se algo não está definido em `docs/SPEC.md` ou `docs/DECISIONS.md`, pergunte antes de decidir.
- Em etapas grandes, proponha o conteúdo e espere aprovação antes de criar arquivos.
- Nunca leia nem exiba o conteúdo de arquivos `.env`.

## Git
- Mostre a mensagem de commit e peça confirmação antes de push, PR ou merge.
- Nunca use `--no-verify` nem force push na `main`.

## Ao terminar uma mudança
- Rode lint, typecheck e os testes relevantes e relate o resultado como ele foi, inclusive falhas.
- Se a mudança afetar requisito ou decisão, atualize SPEC/DECISIONS no mesmo PR.
