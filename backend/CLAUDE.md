# Backend — regras específicas

## Estrutura modular
`src/modules/<modulo>/` com quatro arquivos:
- `<modulo>.schema.ts`: schemas Zod (entrada) e tipos inferidos deles.
- `<modulo>.service.ts`: regras de negócio e acesso ao Prisma. Sem `req`/`res`.
- `<modulo>.controller.ts`: traduz HTTP ⇄ service. Sem regra de negócio.
- `<modulo>.routes.ts`: rotas e middlewares (auth, perfil, vínculo).

## Autorização
- Rotas de terapeuta ficam sob `/therapist/patients/:patientId/...` e passam por um middleware
  que responde 403 a qualquer método diferente de GET **antes** de tudo, e também quando não há
  vínculo ativo com `:patientId`.
- As únicas escritas do lado da terapeuta são os POSTs que criam o vínculo (`/links/redeem-code`
  e `/links/accept-invite`, DEC-031) e as marcas de leitura dela (`PUT`/`DELETE
  /therapist/read-marks/:patientId`, DEC-057), num prefixo próprio, com sessão, perfil e vínculo
  ativo, e que só gravam na tabela `ReadMark`, nunca no registro do paciente. Nada fora de
  `/therapist/patients/...` devolve dado de paciente além de nome, e-mail e o número de não lidos
  dos vinculados (`GET /links/patients`).
- Rotas de paciente usam sempre o id do usuário autenticado. Nunca aceite `patientId` vindo do
  body ou da query nessas rotas.

## Regras de domínio
- Transições de estado da atividade ficam centralizadas no service de atividades. Nenhum outro
  lugar altera `status`.
- Estado final (CONCLUIDA, NAO_REALIZADA) → 409 em edição ou exclusão.

## Prisma e banco
- Mudança de schema = migration nova via `prisma migrate dev` com `MIGRATION_DATABASE_URL`.
  Nunca `db push` fora do ambiente local.
- Tabela nova precisa de permissão DML para `faisca_app`, garantida pelos default privileges
  definidos na primeira migration.
- Nunca edite uma migration já aplicada: crie outra (o hook e o CI `migrations-ci.yml` barram).
  Passo a passo na skill `nova-migration`.

## Lembretes
- Jobs do `node-cron` são idempotentes via `NotificationLog`; verifique antes de enviar.
- Os textos de lembrete vêm de templates fixos e neutros; nunca interpole dados de atividade.
