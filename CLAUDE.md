@AGENTS.md

# Regras para o Claude

## Comunicação
- Responda em pt-BR, de forma didática e prática.
- Ao refatorar, preserve a lógica e explique as mudanças importantes.

## Antes de agir
- No começo de cada etapa, recomende o modelo da conversa: Sonnet 5.5 para texto, documentação
  e ajustes pequenos; Opus 5.5 para código; Fable 5.1 para desenho de segurança ou mudança crítica
  (ex.: 2FA, criptografia no banco). Quem troca é o usuário, no seletor de modelo do app. Os
  revisores têm o modelo fixo no próprio arquivo (`revisor-regras` e `revisor-seguranca` no Opus 5.5,
  `revisor-telas` no Sonnet 5.5).
- Se algo não está definido em `docs/SPEC.md` ou `docs/DECISIONS.md`, pergunte antes de decidir.
- Em etapas grandes, proponha o conteúdo e espere aprovação antes de criar arquivos.
- Nunca leia nem exiba o conteúdo de arquivos `.env`.

## Git
- Mostre a mensagem de commit e peça confirmação antes de push, PR ou merge.
- Nunca use `--no-verify` nem force push na `main`.

## Ao terminar uma mudança
- Siga a skill `finalizar-mudanca` (passo a passo e armadilhas conhecidas).
- Rode lint, typecheck e os testes relevantes e relate o resultado como ele foi, inclusive falhas.
- Se a mudança afetar requisito ou decisão, atualize SPEC/DECISIONS no mesmo PR.
- Antes de abrir PR que toque em `backend/`, rode o subagente `revisor-regras` e relate o veredito.
- Antes de abrir PR que toque em `frontend/src` ou nos textos de e-mail, rode o subagente
  `revisor-telas` e relate o veredito.
- Antes de abrir PR que toque em login, sessão, senha, verificação em duas etapas, passkey,
  vínculo, envio de arquivo, cabeçalhos de segurança (CSP, CORS, cookies), criptografia ou
  dependências (`package.json`), rode o subagente `revisor-seguranca` no modo diff e relate o
  veredito. Achado sério se corrige antes do PR; o resto vira issue, combinado com o usuário.
