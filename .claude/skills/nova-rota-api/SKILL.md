---
name: nova-rota-api
description: Guia para criar ou alterar rotas da API do Faísca (backend/src/modules) respeitando a autorização por contexto (paciente e terapeuta), os registros finais imutáveis, os logs sem dado sensível e os testes obrigatórios de caso permitido e negado. Use sempre que for adicionar um endpoint ou um módulo novo, mudar os middlewares de uma rota ou expor dado de paciente, mesmo que o pedido não diga "rota" — por exemplo "cria um endpoint para…", "a terapeuta precisa ver…", "adiciona um PATCH em…", "a API tem que devolver…".
---

# Nova rota da API

Siga os passos em ordem. As regras vêm do AGENTS.md (regras invioláveis) e do backend/CLAUDE.md;
em caso de dúvida, eles prevalecem sobre esta skill.

## 1. Antes de codar
- Leia a seção da `docs/SPEC.md` e as DECs ligadas ao assunto. Comportamento não definido → pergunte.
- Classifique a rota em um dos contextos:
  - **A. Paciente**: só os próprios dados.
  - **B. Terapeuta sobre um paciente**: só GET e só com vínculo ativo.
  - **C. Sem dado de paciente**: conta, vínculo, health. Justifique por que não há dado de paciente.
- Terapeuta escrevendo dado de paciente **não existe**. As únicas exceções são os POSTs que criam
  o vínculo (DEC-031). Se o pedido exigir isso, pare e explique antes de continuar.

## 2. Estrutura
`src/modules/<modulo>/` com `schema`, `service`, `controller` e `routes` (backend/CLAUDE.md).
Registre o router em `src/app.ts`, antes do `notFound`. Modelos a seguir:
- Contexto A: `src/modules/appointments/`
- Contexto B: `src/modules/therapist/`

## 3. Autorização por contexto
**A. Paciente**
- Middlewares `requireAuth, requirePatient`.
- O id do usuário sai sempre de `getAuthUser(req).id`, nunca do corpo, da query ou da URL.
- O dono é conferido no service, como no `findOwned` de appointments: não existe → 404; é de
  outra pessoa → 403 `FORBIDDEN`.

**B. Terapeuta**
- A rota fica sob `/therapist/patients/:patientId/...`, **dentro** do `therapist.routes.ts`,
  que já aplica `onlyReads → requireAuth → requireTherapist → requireActiveLink` no prefixo.
  Adicione só o `router.get`. Não crie outro router com esse prefixo nem outra cadeia.
- O 403 é sempre o mesmo, para não revelar se o paciente existe ou se já teve vínculo.
- O `patientId` da URL só é usado depois do `requireActiveLink`.

**Todas**
- A resposta passa por um `toPublicX`: nunca `userId`, `passwordHash`, hashes ou tokens.

## 4. Validação e domínio
- Zod no `schema.ts`: `z.strictObject` para o corpo (campo a mais é 400), `z.uuid` para ids,
  `z.iso.date` para datas. O `parse` fica no controller.
- Erros esperados: `new AppError(status, 'CODIGO_ESTAVEL', 'Mensagem em pt-BR')`.
- Atividade: transições de estado só no `activities.service`. CONCLUIDA ou NAO_REALIZADA →
  **409** `ACTIVITY_FINALIZED` ao editar ou excluir (DEC-012). É 409, e não 403.
- Datas: `activityDate` como DATE, com `lib/dates.ts` (`todayInAppZone`, `dateOnlyToDate`),
  no fuso America/Sao_Paulo.

## 5. Logs e segredos
- Não logue senha, token, código de vínculo, e-mail, nome de atividade, notas ou observações.
- Campo sensível novo → acrescente em `SENSITIVE_KEYS` (`src/lib/logger.ts`).
- Segredo de vínculo só como hash (`lib/secure-token.ts`, `lib/link-code.ts`).
- Mensagens de erro não repetem dado do paciente.

## 6. Testes obrigatórios (regra 1)
No `<modulo>.test.ts` (Vitest + Supertest), dentro de `describe('autorização (regra 1)')`,
só com dados fictícios (`@faisca.test`). Model novo → inclua no `resetDatabase` (`src/test/db.ts`).

**Contexto A**
- [ ] sem sessão → 401 em todas as rotas
- [ ] conta só de terapeuta → 403 `PATIENT_PROFILE_REQUIRED`, nada gravado
- [ ] a lista traz só os registros da própria pessoa
- [ ] registro de outra pessoa → 403 `FORBIDDEN` e o banco continua igual
- [ ] `userId` ou `patientId` no corpo → 400
- [ ] caso permitido → 2xx, resposta sem `userId`
- [ ] atividade finalizada → 409 (se a rota edita ou exclui atividade)

**Contexto B**
- [ ] vínculo ativo → 200 (caso permitido)
- [ ] sem vínculo, vínculo revogado ou vínculo com outro paciente → 403
- [ ] conta sem perfil de terapeuta → 403
- [ ] POST, PATCH ou DELETE no caminho → 403, mesmo com vínculo ativo
- [ ] sem sessão: GET → 401 e escrita → 403
- [ ] `patientId` que não é UUID → 403

Fluxos que atravessam vários módulos também ganham um teste em `tests/api/` (Playwright),
com os usuários de `tests/fixtures/users.ts`, como em `tests/api/therapist.spec.ts`.

## 7. Ao terminar
- Em `backend/`: `npm run lint`, `npm run typecheck` e `npm test` (com o Postgres ligado).
- Se mexeu em `tests/`: `npm run test:api`.
- Relate os resultados como foram, inclusive falhas.
- Rota nova ou comportamento novo → atualize a SPEC; decisão nova → DEC no DECISIONS.
