# Testes de API e E2E — regras específicas

## Como roda
- `npm test` sobe a API de testes na porta **3334** (`backend/scripts/e2e-server.ts`, banco
  `faisca_test` recriado a cada execução, mailer em memória) e o Vite na **5174**, repassando
  `/api` para ela (DEC-026).
- `workers: 1`: os testes compartilham o banco e o servidor e rodam um de cada vez.
- **Nunca rode ao mesmo tempo que o `npm test` do backend**: os dois usam o `faisca_test`.

## Usuários
- Use sempre os usuários **semeados** pelo `e2e-server.ts` e declarados em `fixtures/users.ts`,
  com um grupo próprio por arquivo de teste (ex.: `rpdPatient`, `tensionScreenPatient`), para um
  teste não interferir no outro.
- Não crie contas pelo cadastro: o rate limit de 5 cadastros por hora quebra os testes.
- Precisa de um usuário novo (ex.: área nova com aceite do aviso)? Acrescente-o no
  `e2e-server.ts` e no `fixtures/users.ts`, com um comentário dizendo qual arquivo o usa.

## O que testar
- `api/`: autorização acima de tudo (regra 1): para cada rota com dado de paciente, o caso
  permitido e os negados (sem sessão, outro paciente, terapeuta sem vínculo, terapeuta tentando
  escrever, aviso de privacidade sem aceite). Os detalhes de validação ficam no Vitest do backend.
- `e2e/`: o fluxo principal de cada tela, como a pessoa usaria. Os casos de borda ficam no Vitest
  do front.

## Dados
- Tudo fictício (regra 5): e-mails `@faisca.test`, textos "fictício/fictícia".
- Datas **fixas e passadas** (ex.: `2026-03-10`), para o teste não depender do dia em que roda.

## Instabilidade conhecida
Com a suíte inteira, o login de um E2E às vezes estoura os 5 s (já aconteceu no
`e2e/actions.spec.ts`). Rode o arquivo sozinho (`npx playwright test e2e/<arquivo>.spec.ts`); se
passar, relate como instabilidade, com o nome do teste. Nunca esconda a falha.
