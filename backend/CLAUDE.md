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
  vínculo ativo com `:patientId`. Exceções: `POST .../plans`, em que a psicóloga cria plano com
  vínculo ativo, PLANS liberada e aceites de privacidade de ambos (DEC-102); e `POST
  .../records/search` (Issue #152), que só pesquisa, recebe o termo sensível pelo corpo e não pode
  gravar nem alterar dado. A busca continua exigindo vínculo e filtra cada resultado pelas áreas
  compartilhadas e aceites válidos das duas pessoas. Qualquer outra escrita continua 403 antes de
  tudo. Cada rota com dado de uma área pede também
  `requireSharedArea(...)`: a área precisa estar liberada pelo paciente no vínculo (DEC-097).
- As escritas do lado da terapeuta são limitadas. Duas são os POSTs que criam o vínculo (`/links/redeem-code`
  e `/links/accept-invite`, DEC-031) e as marcas de leitura dela (`PUT`/`DELETE
  /therapist/read-marks/:patientId`, DEC-057), num prefixo próprio, com sessão, perfil e vínculo
  ativo, e que só gravam na tabela `ReadMark`, nunca no registro do paciente. Junto delas, a
  resposta ao pedido do paciente para ver essas marcas (`PUT /therapist/read-receipts/:patientId`,
  DEC-117), com a mesma cadeia e o aceite da área `readReceipts`, que só grava a preferência dela
  nas colunas `readReceipts*` do vínculo. A terceira são os
  avisos do mural dela (`POST`/`PATCH`/`DELETE /therapist/notices`, DEC-079), com sessão e perfil
  de terapeuta: só gravam o próprio aviso (`TherapistNotice`), sem dado de paciente. A exceção em
  `/therapist/patients` só cria um `Plan` sob o paciente e não permite editar planos existentes ou
  criar registros. Além das exceções descritas aqui, nada fora de
  `/therapist/patients/...` devolve dado de paciente além de nome, e-mail, o número de não lidos, o estado do pedido do
  "Lido" (DEC-117) e
  a versão da foto (só se ela existe e quando mudou, DEC-061) dos vinculados (`GET /links/patients`).
  A foto em si fica em `/therapist/patients/:patientId/avatar`.
- Rotas de paciente usam sempre o id do usuário autenticado. Nunca aceite `patientId` vindo do
  body ou da query nessas rotas.
- Comunidade (DEC-113/122) usa prefixos próprios, fora de `/therapist/patients`: a psicóloga só lê ou
  altera conteúdo da comunidade que possui; com 2FA ativo, pode moderar conteúdo escrito por pacientes
  dessa comunidade. Conteúdo escrito pela psicóloga e denúncias correspondentes ficam com a plataforma.
  A pessoa moderadora da plataforma só acessa a fila de conteúdo comunitário com e-mail explicitamente
  autorizado e 2FA ativo. Essas permissões nunca incluem perfil clínico ou registros dos pacientes.
  Todas as rotas exigem o aceite da área `community`.
- Mensagens (DEC-125) usa `/messages` para consulta e envio privado pelos dois participantes do
  vínculo ativo após aceite da área `messages` por ambos. Usa dados da própria conversa e nunca
  acessa ou altera registros clínicos. Configurações de canais e aparelhos são da própria conta.
  O "visto" de cada pessoa (`PUT /messages/:linkId/seen`, DEC-127) grava só a coluna dela no vínculo
  (`patientMessagesSeenAt` ou `therapistMessagesSeenAt`), só avança e nunca aparece para a outra.

## Regras de domínio
- Transições de estado da atividade ficam centralizadas no service de atividades. Nenhum outro
  lugar altera `status`.
- Estado final (CONCLUIDA, NAO_REALIZADA) → 409 em edição ou exclusão.
- Na Ação, apenas o paciente dono pode corrigir uma AVALIADA no mesmo dia de `evaluatedAt`,
  pelo endpoint próprio (DEC-129). A exclusão e as mudanças em NAO_REALIZADA seguem bloqueadas.

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
