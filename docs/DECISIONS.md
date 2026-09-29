# Registro de decisões

Formato: decisão → motivo. Uma decisão só muda com uma nova entrada que substitui a antiga.

## DEC-001 — Hospedagem
- **Decisão:** backend no Railway (plano Hobby); frontend na Vercel.
- **Motivo:** já uso o Railway; o processo fica sempre ligado, o que permite o agendador dentro da API.

## DEC-002 — Instância Postgres própria
- **Decisão:** o Faísca tem uma instância Postgres própria, separada do FinTrack.
- **Motivo:** isolamento físico de dados de saúde (LGPD) e backups independentes.

## DEC-003 — Dois usuários de banco
- **Decisão:**
  - `faisca_migrator` altera a estrutura (DDL) e é usado só no `prisma migrate`.
  - `faisca_app` só lê e grava dados (DML) e é usado pela API em runtime.
- **Motivo:** menor privilégio; mesmo que a API seja comprometida, ela não altera a estrutura do banco. O superusuário da instância nunca é usado pela aplicação.

## DEC-004 — Canais de lembrete
- **Decisão:** Web Push (PWA) e e-mail (Resend); o paciente escolhe o canal por tipo de lembrete.
- **Motivo:** o push é imediato no Android; o e-mail serve de alternativa.

## DEC-005 — Conteúdo neutro nas notificações
- **Decisão:** notificações e e-mails de lembrete nunca contêm nome de atividade, notas ou observações.
- **Motivo:** aparecem na tela de bloqueio e na caixa de entrada.

## DEC-006 — Agendador
- **Decisão:**
  - `node-cron` dentro da API, a cada 5 minutos.
  - Idempotência pela tabela `NotificationLog`, com chave única (usuário, tipo, data).
  - Horários em intervalos de 15 minutos.
- **Motivo:** simples com o processo sempre ligado; restarts não geram envio duplicado.

## DEC-007 — Fuso e datas
- **Decisão:** fuso fixo America/Sao_Paulo; timestamps em UTC; `activityDate` como DATE.
- **Motivo:** o "dia" fica consistente para lembretes, semana e destaque.

## DEC-008 — TypeScript
- **Decisão:** TypeScript no backend e no frontend; Zod para validar a entrada.
- **Motivo:** tipos ajudam a manutenção, dão contexto para agentes de IA e valorizam o portfólio.

## DEC-009 — Repositório único
- **Decisão:** um repositório com `backend/` e `frontend/`, cada um com seu próprio `package.json` (sem workspaces).
- **Motivo:** simplicidade de setup e de deploy separado.

## DEC-010 — Autenticação
- **Decisão:**
  - login com e-mail e senha;
  - JWT em cookie httpOnly + Secure + SameSite (nunca em localStorage);
  - senhas com bcrypt;
  - rate limit nas rotas de autenticação.
- **Motivo:** fluxo conhecido e seguro; o cookie httpOnly reduz o risco de roubo de token por XSS.

## DEC-011 — Autorização por contexto
- **Decisão:**
  - no contexto de terapeuta, só GET e apenas de pacientes com vínculo ativo;
  - no contexto de paciente, só os próprios dados;
  - o resto retorna 403, verificado em middleware no backend.
- **Motivo:** é a regra central de privacidade e o foco dos testes de autorização.

## DEC-012 — Registros finais imutáveis
- **Decisão:** atividades CONCLUIDA e NAO_REALIZADA não podem ser editadas nem excluídas; a tentativa retorna **409** (conflito de estado, diferente de 403, que é falta de permissão).
- **Motivo:** integridade do histórico que a terapeuta analisa.

## DEC-013 — Uma conta, dois perfis
- **Decisão:** a conta pode ter o perfil de paciente, o de terapeuta ou os dois. Eles são escolhidos no cadastro e podem ser ativados depois.
- **Motivo:** psicólogas também fazem terapia; evita duas contas para a mesma pessoa.

## DEC-014 — Cadastro mínimo e aberto
- **Decisão:**
  - cadastro aberto com nome, e-mail e senha, e confirmação de e-mail;
  - nenhum documento pessoal é pedido;
  - a terapeuta pode se cadastrar pela interface.
- **Motivo:** menos atrito e mínimo de dados coletados (LGPD).

## DEC-015 — Vínculo por convite ou por código
- **Decisão:**
  - **Convite por e-mail:** não expira, vale uma vez, token guardado como hash.
  - **Código de 8 caracteres:** vale 24h e uma vez, guardado como hash, com limite de 5 tentativas erradas em 15 minutos.
  - Um paciente tem uma única terapeuta ativa.
- **Motivo:** o convite vai para um destinatário escolhido pelo paciente. O código é curto e pode ser copiado ou adivinhado, por isso expira e tem limite de tentativas. O hash evita que um vazamento do banco exponha convites ou códigos válidos.

## DEC-016 — Sem verificação de CRP (adiado)
- **Decisão:** o perfil de terapeuta não pede CRP.
- **Motivo:**
  - o CRP é público, então digitá-lo não prova identidade;
  - não existe API pública oficial do Cadastro Nacional do CFP;
  - quem protege os dados é o consentimento do paciente (convite ou código), que conhece a terapeuta e vê nome e e-mail de quem se vinculou.
- **Reavaliar se:** o Faísca virar produto para profissionais (cobrança, diretório ou selo de verificado), com um processo real de verificação.

## DEC-017 — Consultas registradas pelo paciente
- **Decisão:** o paciente registra as datas das consultas; elas servem para o filtro "desde a última consulta" e para o destaque dos 7 dias antes da próxima.
- **Motivo:** mantém a terapeuta 100% somente leitura.

## DEC-018 — PWA sem uso offline
- **Decisão:** o app é instalável e guarda a interface em cache, mas gravar exige conexão.
- **Motivo:** sincronização offline é complexa demais para o MVP.

## DEC-019 — Convenções do repositório
- **Decisão:**
  - documentação, commits e comentários em pt-BR;
  - Conventional Commits;
  - uma branch e um PR por etapa;
  - fim de linha LF, garantido por `.gitattributes`.
- **Motivo:** histórico legível e scripts que funcionam no CI e no deploy, que rodam em Linux.

## DEC-020 — Postgres local com Docker Compose
- **Decisão:**
  - em desenvolvimento, Postgres 17 via `docker compose` em `backend/`;
  - o `docker/init-db.sh` cria `faisca_migrator` e `faisca_app`, e o CI usa o mesmo script;
  - no Railway, os usuários são criados à mão, uma vez, com o passo a passo do `backend/README.md`.
- **Motivo:** ambiente igual para todos, sem instalar Postgres na máquina, e os dois usuários
  (DEC-003) já existem desde o primeiro dia, inclusive no CI.

## DEC-021 — Testes do backend com Vitest + Supertest
- **Decisão:** testes de unidade e de integração HTTP do backend com Vitest + Supertest, sobre o
  `createApp()` e sem abrir porta. O Playwright em `tests/` fica para API ponta a ponta e E2E.
- **Motivo:** o Vitest roda TypeScript/ESM sem configuração extra e é rápido. O Supertest testa as
  rotas e os middlewares (incluindo a autorização) dentro do próprio projeto.

## DEC-022 — Logs com pino
- **Decisão:** logs em JSON com pino, com `redact` de campos sensíveis (senha, token, código de
  vínculo, nome, notas, observação, cookie). O ESLint proíbe `console`.
- **Motivo:** o JSON é fácil de filtrar no Railway, e o `redact` é uma rede de segurança para a
  regra de logs sem dados sensíveis. Ele não dispensa o cuidado de não logar esses dados.

## DEC-023 — API no mesmo domínio do front, via proxy
- **Decisão:**
  - o front chama sempre `/api/...` no próprio domínio;
  - em produção, o `vercel.json` repassa `/api/*` para a API no Railway;
  - em dev, o proxy do Vite faz o mesmo para `localhost:3333`;
  - o cookie de sessão será `SameSite=Lax`.
- **Motivo:** Vercel e Railway ficam em sites diferentes, e o cookie da API seria de terceiros,
  bloqueado pelo Safari e restrito no Chrome, o que quebraria o login da DEC-010. Com o proxy o
  cookie é first-party, sem depender do domínio próprio (ainda em aberto).
- **Consequência:** há mais um proxy na frente da API; o `trust proxy` do Express precisa ser
  ajustado na etapa de rate limit para ler o IP real do usuário.

## DEC-024 — Frontend: dados do servidor, testes e fontes
- **Decisão:**
  - TanStack Query para buscar e fazer cache dos dados da API em memória;
  - Vitest + Testing Library + jsdom nos testes, com a API simulada pelo MSW;
  - fontes Nunito e Inter hospedadas no próprio app (Fontsource), sem Google Fonts;
  - service worker próprio (`injectManifest`) com precache só do shell.
- **Motivo:** o Query cuida de carregamento, erro e recarga sem código repetido; os testes seguem
  o mesmo ferramental do backend (DEC-021); sem requisições a terceiros (LGPD) e com as fontes no
  cache do PWA; o service worker próprio deixa explícito que a API nunca entra em cache e já
  recebe o Web Push depois.

## DEC-025 — Sessão, links por e-mail e respostas neutras
- **Decisão:**
  - sessão de **30 dias**, renovada (cookie novo) no máximo uma vez por dia de uso;
  - o JWT leva um `sessionVersion`; redefinir a senha incrementa o valor e derruba todas as
    sessões abertas;
  - links de confirmação de e-mail valem **24 horas**; de redefinição de senha, **1 hora**. Valem
    uma vez, pedir outro invalida o anterior e o banco guarda só o hash (SHA-256);
  - o link abre uma tela do front, que confirma por POST (antivírus de e-mail abrem links sozinhos,
    e um GET consumiria o token). Depois de confirmar, a pessoa vê "e-mail confirmado" e entra
    pelo botão Entrar; o link não cria sessão;
  - cadastro, reenvio de confirmação e "esqueci a senha" respondem igual exista ou não a conta.
    Cadastro com e-mail já confirmado só envia um aviso ao dono do e-mail;
  - login com e-mail inexistente compara a senha com um hash fictício, para levar o mesmo tempo;
  - senha com mínimo de 8 caracteres e máximo de 72 bytes (limite do bcrypt), sem regras de
    composição; bcrypt (`bcryptjs`) com custo 12; JWT com `jose` (HS256);
  - rate limit em memória, com respostas 429: cadastro 5/h por IP; login 10 falhas a cada 15 min por
    IP + e-mail; reenvio e "esqueci a senha" 3/h por e-mail e 10/h por IP. Confirmar e redefinir
    não têm limite: o token tem 256 bits e não há o que adivinhar;
  - `trust proxy` configurável por `TRUST_PROXY_HOPS`, com valor de produção confirmado no deploy.
- **Motivo:** o app é de uso diário no celular, e pedir login toda semana gera atrito; o
  `sessionVersion` compensa a falta de revogação do JWT no caso que mais importa (senha vazada);
  as respostas neutras evitam descobrir quem usa o Faísca, o que já é um dado de saúde.
- **Limitação conhecida:** sair da conta apaga o cookie, mas o JWT copiado antes continua válido
  até expirar ou até a senha ser redefinida. O contador em memória zera a cada deploy e não serve
  para mais de uma instância.

## DEC-026 — Testes com banco e pasta `tests/`
- **Decisão:**
  - o Vitest do backend roda contra um Postgres de verdade, no banco `faisca_test`, criado e
    migrado sozinho antes dos testes. Os arquivos rodam em sequência e os dados são apagados
    antes de cada teste;
  - os e-mails passam por uma interface `Mailer`; nos testes, um mailer em memória guarda as
    mensagens para os testes lerem os links;
  - `tests/` (Playwright, `package.json` próprio) sobe a API em uma porta própria (3334), pelo
    `backend/scripts/e2e-server.ts`: banco `faisca_test` recriado, usuários fictícios já
    confirmados e uma caixa de entrada de teste (`/__test__/emails/latest`) que só existe nesse
    servidor. Dois projetos: `api` (só HTTP) e `e2e` (Chromium), que também sobe o front na
    porta 5174 com o `/api` repassado para a API de testes;
  - o CI tem um workflow próprio para `tests/`.
- **Motivo:** as regras de autorização e de estado dependem do banco (vínculo ativo, unicidade,
  transações), e simular o Prisma esconderia justamente esses erros. O servidor de testes fica
  fora de `src/`, então nada dele entra no build de produção.

## DEC-027 — Telas de conta no front
- **Decisão:**
  - a sessão vem de `GET /auth/me` (TanStack Query, chave `session`); 401 vira "sem sessão", não
    erro. Guardas de rota: `RequireAuth` (manda para `/entrar?next=...`) e `GuestOnly`;
  - o `?next=` só aceita caminhos internos (começando com `/`, sem `//`);
  - as telas abertas por link de e-mail leem o `?token=` e em seguida o tiram da barra de
    endereço; a confirmação de e-mail é enviada sozinha ao abrir a tela, uma única vez;
  - depois do cadastro, o e-mail vai para a tela seguinte no state da navegação, não na URL;
  - no cadastro, nenhum perfil vem marcado: a pessoa escolhe (SPEC, "Contas e perfis");
  - sair e redefinir a senha limpam os dados em memória do TanStack Query.
- **Motivo:** o token e o e-mail na URL ficariam no histórico e em capturas de tela; o `next`
  sem validação deixaria usar o link do Faísca para mandar a pessoa a outro site. Os guardas
  só evitam telas vazias: quem protege os dados é o backend.

## DEC-028 — API de atividades
- **Decisão:**
  - rotas do contexto de paciente em `/activities`, sempre com o id da sessão. Cada transição da
    SPEC tem uma rota própria (`/start`, `/complete`, `/not-done`), com schema próprio, em vez de
    um `PATCH` que aceite `status`. O `PATCH` edita só nome, data e, na PENDENTE, a vontade;
  - schemas Zod estritos: campo que não pertence ao estado (ex.: prazer numa PLANEJADA) dá 400;
  - respostas: 401 sem sessão; 403 para conta sem perfil de paciente ou atividade de outra
    pessoa; 404 para id inexistente; 409 `ACTIVITY_FINALIZED` em registro final (DEC-012),
    `INVALID_TRANSITION` em transição fora da SPEC e `DATE_IN_FUTURE` ao concluir ou marcar
    "não aconteceu" um dia que ainda não chegou (400 com o mesmo código ao criar já concluída);
  - imutabilidade à prova de corrida: update e delete condicionais (`updateMany`/`deleteMany`
    com o status e a data lidos). Se outra requisição mudou o registro no meio, nada é gravado
    e a resposta é 409;
  - CHECKs no banco como segunda linha de defesa: notas inteiras de 0 a 10, campos exigidos
    por estado, observação só nos estados finais, nome de 1 a 100 e observação até 1000
    caracteres;
  - sem trigger no banco para a imutabilidade: ele também bloquearia a exclusão da conta em
    cascata (LGPD);
  - a lista pede `from` e `to` (`AAAA-MM-DD`), com até 42 dias, e ordena por dia e depois por
    `createdAt`;
  - vontade, prazer e realização entram no `redact` do logger (DEC-022).
- **Motivo:** uma rota por transição torna impossível pular um estado mandando o campo errado,
  e os testes seguem a tabela da SPEC um para um. O update condicional fecha a janela entre ler
  e gravar, que uma checagem só no código deixaria aberta. Os 42 dias cobrem a semana e um mês
  com as semanas das pontas, sem permitir baixar o histórico inteiro de uma vez.

## DEC-029 — Telas de atividades
- **Decisão:**
  - "Meus registros" fica em `/registros`, com a semana na URL (`?semana=AAAA-MM-DD`, qualquer dia
    abre a semana dele). `/` leva a `/registros` para quem é paciente e a `/pacientes` para quem é
    só terapeuta; cada tela exige o seu perfil, e só quem tem os dois vê a alternância;
  - formulários em `<dialog>` nativo, aberto como modal: o navegador cuida do foco, do Esc e de
    deixar o resto da página inerte, sem biblioteca nova;
  - notas em slider grande de 0 a 10, com legendas nos extremos. O slider começa **sem valor
    escolhido** ("—") e o formulário só envia depois que a pessoa mexe nele;
  - "Conta como foi?" numa PLANEJADA pede também a vontade e faz duas chamadas (`start` e
    `complete`); "Não aconteceu" ao criar faz `POST` como PLANEJADA e `not-done`. O backend
    continua seguindo a SPEC. Se só a primeira chamada gravar, o formulário fecha e a tela avisa
    o que ficou salvo, para não reenviar e duplicar;
  - os botões seguem o estado: registro final não tem ações, e "Conta como foi?" e "Não
    aconteceu" só aparecem a partir do dia da atividade;
  - gráfico de barras agrupadas por atividade feita (vontade, prazer, realização), em três
    intensidades da escala de notas, com o valor escrito em cada barra e uma tabela para leitor
    de tela; a partir de 8 atividades, rolagem lateral; sem animação com `prefers-reduced-motion`;
  - datas com `Intl` no fuso de São Paulo, sem biblioteca de datas;
  - pensado primeiro para o celular: topo só com a marca e "Sair" (o tema fica no rodapé),
    "Nova atividade" flutuando no canto de baixo, formulários como painel que sobe de baixo
    com Cancelar/Salvar sempre visíveis, botões do card em grade de duas colunas e slider com
    polegar de 28px. A partir de 640px (`sm`), o layout de desktop.
- **Motivo:** a semana na URL sobrevive a recarregar e ao botão voltar. O slider sem valor inicial
  evita que um 5 "sugerido" vire resposta sem a pessoa pensar nele, o que distorceria o registro.
  Os passos duplos resolvem o caso comum (planejou, fez e só depois abriu o app) sem afrouxar a
  máquina de estados da DEC-028. O uso principal é no celular, com uma mão: as ações ficam ao
  alcance do polegar e nada importante some atrás da rolagem.

## DEC-030 — Consultas
- **Decisão:**
  - model `Appointment` só com o dia (`appointmentDate`, DATE), sem horário, e **uma consulta
    por dia** por paciente, garantida por índice único no banco (a segunda dá 409
    `APPOINTMENT_EXISTS`);
  - rotas do contexto de paciente em `/appointments` (listar, criar, mudar a data, excluir),
    com as mesmas respostas das atividades (401, 403, 404). `GET /appointments` devolve a lista,
    da mais recente para a mais antiga, e já calcula `last` e `next` no fuso de São Paulo;
  - telas: card "Consultas" no topo de `/registros` (próxima e última, com a distância em dias),
    página `/consultas` com "Próximas" e "Anteriores" e um selo "consulta" no dia da semana;
  - `DialogForm` e `DialogActions` passam para `components/ui/dialog.tsx`, usados por
    atividades e consultas.
- **Motivo:** a SPEC fala em datas, e o dia basta para "última", "próxima", o filtro e o destaque
  da terapeuta; o horário pode entrar depois, se os lembretes precisarem. Duas sessões no mesmo
  dia são raras, e a unicidade evita cadastrar a mesma consulta duas vezes. Calcular última e
  próxima na API deixa o "hoje" num lugar só, e a visão da terapeuta vai reaproveitar o cálculo.

## DEC-031 — Vínculo paciente ↔ terapeuta
- **Decisão:**
  - quatro tabelas: `TherapistLink` (o vínculo, com `method`, `revokedAt` e `seenByPatientAt`),
    `LinkInvite`, `LinkCode` e `LinkCodeAttempt`. No banco, índice único parcial para **um vínculo
    ativo por paciente** e **um convite pendente por paciente**, e CHECK para ninguém se vincular
    a si mesmo;
  - a regra "terapeuta só GET" vale para os **dados de paciente**. Os dois POSTs que criam o
    vínculo (`/links/redeem-code` e `/links/accept-invite`) são permitidos: não leem nem alteram
    registros, e o consentimento veio do paciente (código ou convite). Os dados continuarão em
    `/therapist/patients/:patientId/...`, só GET e só com vínculo ativo (etapa 4b);
  - rotas do paciente em `/link` (situação, convite, cancelar convite, código, revogar, marcar o
    aviso como visto), sempre com o id da sessão; da terapeuta em `/links` (resgatar código,
    aceitar convite, listar pacientes). `POST /auth/profiles` ativa o perfil que faltava;
  - código de 8 caracteres do alfabeto `23456789ABCDEFGHJKMNPQRSTVWXYZ` (sem 0/O, 1/I/L, U/V),
    mostrado como `K7M4-P9QX`, gerado com `crypto.randomInt`. Guardado como **HMAC-SHA-256** com
    a chave `LINK_CODE_SECRET`, fora do banco. A terapeuta pode digitar em minúsculas, com ou sem
    traço; formato impossível dá 400 e não conta como tentativa;
  - tentativas erradas ficam no banco (`LinkCodeAttempt`, só terapeuta e horário): 5 em 15 minutos
    dão 429 até com o código certo. A contagem trava a linha da terapeuta (`SELECT ... FOR UPDATE`),
    então tentativas simultâneas não passam do limite;
  - gerar código, convidar e aceitar o convite apagam os códigos não usados do paciente: um
    caminho aberto por vez;
  - o convite pode ser aceito por uma conta com **outro e-mail** que não o convidado; o aceite
    ativa o perfil de terapeuta se faltar. Quem se cadastra pelo link manda o `inviteToken` no
    cadastro e o vínculo nasce quando confirmar o e-mail; se o convite deixou de valer, a conta
    segue normal. Convidar o próprio e-mail, digitar o próprio código ou abrir o próprio convite
    dá 400 `SELF_LINK` e não gasta o código nem o convite;
  - o paciente é avisado **no app** (`seenByPatientAt`) **e por e-mail**, com nome e e-mail de quem
    se vinculou. Os e-mails de vínculo nunca citam atividade, nota ou observação;
  - convites limitados a 5 por hora por paciente (em memória), porque cada um manda e-mail para
    um endereço escolhido.
- **Motivo:** o índice parcial garante as regras da SPEC mesmo com duas requisições ao mesmo
  tempo. O código tem só ~39 bits: um SHA-256 puro seria quebrado por força bruta por quem
  tivesse uma cópia do banco, e o HMAC exige também a chave. O limite no banco sobrevive a
  deploys, o que o contador em memória da DEC-025 não faz. Exigir o mesmo e-mail travaria a
  terapeuta que usa outro endereço, e quem recebeu o link já é quem o paciente escolheu. O aviso
  por e-mail cobre o caso de alguém se vincular sem o paciente perceber no app.
- **Limitação conhecida:** sem domínio próprio, o e-mail de convite não chega a terceiros em dev
  (veja "Em aberto"); o fluxo por código funciona inteiro.

## DEC-032 — Telas do vínculo
- **Decisão:**
  - link **Conta** no topo, ao lado de Sair. A tela `/conta` tem "Minha terapeuta" (só para quem
    é paciente) e "Perfis" (ativa o perfil que falta, via `POST /auth/profiles`);
  - "Minha terapeuta" segue a situação da API: sem vínculo, **Gerar código** e **Convidar por
    e-mail** (painel com o e-mail); convite pendente, o e-mail e **Cancelar convite**; vínculo
    ativo, nome, e-mail, "desde" e **Desfazer vínculo**, com confirmação;
  - o código aparece **uma vez só**, na resposta de quando é gerado, com **Copiar** e, quando o
    navegador oferece, **Compartilhar** (Web Share). Se a pessoa sair da tela, a API diz que há um
    código válido e a tela oferece gerar outro, que invalida o anterior;
  - aviso de novo vínculo no topo de `/registros`, com nome e e-mail, até tocar em **Entendi**
    (`POST /link/seen`);
  - `/pacientes`: campo de código (aceita minúsculas e com ou sem traço, confere o formato antes
    de enviar) e a lista de vinculados. Abrir os registros fica para a 4b;
  - `/convite` funciona com ou sem sessão. Sem sessão, **Entrar** ou **Criar conta** levam o token
    no state da navegação e voltam para `/convite`; o cadastro já vem com "Acompanhar pacientes"
    marcado e envia o `inviteToken`. O guarda `GuestOnly` repassa esse state quando redireciona
    logo depois do login;
  - textos sem presumir o gênero de quem atende ("quem acompanha sua terapia");
  - `npm run db:seed-dev` (backend) cria ou restaura `terapeuta.dev@faisca.test`, já confirmada,
    com senha fictícia documentada no README do backend. Só roda com `NODE_ENV=development` e
    não loga e-mail nem senha.
- **Motivo:** o código só existe em texto na hora em que nasce, porque o banco guarda o HMAC
  (DEC-031); mostrar de novo exigiria guardá-lo. O state da navegação sobrevive a recarregar a
  página e não vai para histórico, favoritos nem capturas de tela, como já fazemos com o token
  dos e-mails (DEC-027). Sem domínio próprio, o convite não chega a uma segunda pessoa em dev, e
  a terapeuta fictícia permite testar os dois lados no navegador.

## DEC-033 — API da visão da terapeuta
- **Decisão:**
  - rotas só de leitura sob `/therapist/patients/:patientId`: o resumo (nome, e-mail, desde quando,
    última e próxima consulta, o "hoje" e o período de destaque), `/activities?from&to` e
    `/appointments`. As respostas têm o mesmo formato das rotas do paciente, com notas,
    observações, `activityDate` e `createdAt`, e sem o `userId`;
  - uma cadeia única no prefixo: `onlyReads` (método que não seja GET/HEAD é **403 antes de tudo**,
    até do login e em caminhos que não existem) → sessão → perfil de terapeuta → **vínculo
    ativo**, conferido a cada requisição. Sem vínculo, vínculo revogado, paciente de outra
    terapeuta, id inexistente ou inválido: o mesmo 403 `FORBIDDEN`;
  - os services de atividades e consultas do paciente são reaproveitados, com o id do paciente
    vindo da URL só depois do vínculo conferido;
  - destaque calculado na API: da próxima consulta −7 até a véspera (sem o dia da consulta); sem
    próxima consulta, de hoje −6 até hoje;
  - a terapeuta pede até **92 dias** de atividades por vez (o paciente segue com 42). O filtro
    "desde a última consulta" vai do dia da última consulta até hoje; se passar de 92 dias, a
    tela mostra os 92 mais recentes e avisa. Sem consulta passada, o filtro fica desabilitado;
  - `db:seed-dev` ganha a `paciente.dev@faisca.test`, vinculada à terapeuta dev, com atividades e
    consultas fictícias em volta de hoje.
- **Motivo:** o 403 antes do login deixa impossível qualquer escrita pela porta da terapeuta, sem
  depender de cada rota lembrar da regra. A resposta igual para todos os casos negados não revela
  se alguém usa o Faísca. Calcular o destaque na API mantém o "hoje" num lugar só (como na
  DEC-030). Os 92 dias cobrem o intervalo comum entre consultas sem baixar o histórico inteiro.

## DEC-034 — Telas da visão da terapeuta
- **Decisão:**
  - cada item de `/pacientes` leva a `/pacientes/:id`: nome, e-mail, "vinculado desde", as
    consultas (próxima e última) e uma faixa que diz qual período está **em destaque** e por quê;
  - o período fica na URL, como em `/registros` (DEC-029): `?semana=AAAA-MM-DD` ou
    `?periodo=desde-a-ultima-consulta`. Na semana aparecem os 7 dias; no filtro "desde a última
    consulta" aparecem **só os dias com registro**. Sem consulta passada, o filtro fica
    desabilitado, com a explicação;
  - dias do destaque com borda e selo âmbar (destaque pontual, frontend/CLAUDE.md), além dos selos
    "hoje" e "consulta";
  - o `ActivityCard` ganha o modo `readOnly`: sem botões e com "Registrado em" (`createdAt`), já
    que a SPEC mostra as duas datas. O gráfico da semana é o mesmo;
  - 403 em qualquer chamada (vínculo desfeito, inclusive com a tela aberta): "Registros
    indisponíveis", com texto acolhedor e volta para a lista, que é recarregada. Não tenta de novo
    em 403.
- **Motivo:** com até 92 dias, listar todos os dias encheria a tela de dias vazios; na semana, os
  dias vazios mostram o ritmo. A URL guarda o período ao recarregar e voltar. Esconder os botões é
  só conforto: quem barra a escrita é o 403 da API (DEC-033).

## DEC-035 — Excluir a própria conta
- **Decisão:**
  - `POST /auth/delete-account` com `{ password }`, atrás do `requireAuth` e com limite de 10
    senhas erradas em 15 minutos por conta. A conta apagada é sempre a da sessão. Com a senha
    errada, a resposta é 400 `INVALID_PASSWORD` e nada é apagado;
  - exclusão definitiva (hard delete) do usuário. Atividades, consultas, vínculos (inclusive os
    revogados), convites, códigos e tokens saem em cascata no banco; só o `signupUser` de um
    convite de outra pessoa vira `null`. Não há migration nova;
  - as sessões abertas caem na hora, porque o `requireAuth` busca o usuário a cada requisição. O
    cookie da sessão atual é limpo na resposta;
  - depois de apagar, um e-mail neutro avisa que a conta foi excluída, sem link. Se o envio falhar,
    nada é desfeito. O log leva só o id;
  - o outro lado do vínculo não é avisado: a terapeuta deixa de ver a pessoa na lista, e a
    paciente fica sem vínculo em **Conta**;
  - no front, a seção **Excluir conta** fica no fim de `/conta`. O dialog diz o que some e pede a
    senha, e depois a pessoa vai para `/entrar` com o aviso de conta excluída;
  - excluir só um dos perfis fica fora do escopo por ora.
- **Motivo:** a SPEC pede que a exclusão apague todos os dados e vínculos (LGPD). A senha protege
  contra quem pega o celular desbloqueado, e o limite impede testar senhas por essa rota. O
  e-mail avisa a dona da conta se não foi ela quem excluiu.

## Adiado
- **Exportação CSV/PDF:** os dados são consultados direto no app.
- **Modo demo:** quando existir, terá deploy e banco próprios, só com dados fictícios.

## Em aberto
- **Domínio do app e do remetente de e-mail:** ainda não comprado. Até lá, o e-mail
  só funciona em desenvolvimento (remetente de teste do Resend, enviando apenas
  para o dono da conta). Pré-requisito para convites e cadastros de terceiros.
