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

## DEC-036 — Aviso de privacidade, consentimento e domínio
- **Decisão:**
  - o app passa a ter uso real (o autor e a psicóloga dele), com dados de saúde reais. Antes disso,
    entra um aviso de privacidade público em `/privacidade`, com o responsável (Lucas Pereira de
    Lima), o contato, o que é guardado (inclusive o IP só em memória, no rate limit), a finalidade,
    quem vê, os serviços e o país (Railway, Vercel e Resend, nos EUA), a proteção, a retenção, os
    direitos na LGPD, o aviso de que não é prontuário e o CVV (188);
  - no cadastro, uma caixa de marcar **obrigatória e desmarcada**. A API recusa `acceptPrivacy`
    diferente de `true` (400) e grava `privacyAcceptedAt` e `privacyVersion` no usuário (migration
    `privacy_consent`). Refazer o cadastro de uma conta ainda não confirmada atualiza o aceite;
  - a versão é `2026-10`, em `PRIVACY_VERSION` (backend) e no texto da página (front). Mudar o
    texto exige mudar as duas e avisar no app;
  - o link do aviso no cadastro abre em outra aba, para não perder o formulário;
  - domínio comprado: **`minhafaisca.com.br`** (Registro.br). É configurado no deploy, tanto para o
    app quanto para o remetente do Resend.
- **Motivo:** dado de saúde é sensível na LGPD e pede consentimento específico e destacado (art. 11,
  I), e cabe ao responsável provar o consentimento (art. 8º, § 2º), por isso a data e a versão.
  Sem domínio próprio, o Resend não entrega e-mail para uma segunda pessoa (a psicóloga).
- **Pendente no deploy:** confirmar o prazo das cópias de segurança do Railway e, se for o caso,
  deixar o texto de retenção mais preciso.

## DEC-037 — Deploy: Railway, Vercel e o domínio
- **Decisão:**
  - o app fica em `minhafaisca.com.br` (Vercel), e a API em **`api.minhafaisca.com.br`** (domínio
    próprio apontado para o Railway). O `vercel.json` já nasce com o destino certo e não depende da
    URL gerada pelo Railway, e trocar de hospedagem não mexe no front. O cookie continua first-party
    pelo proxy `/api` (DEC-023);
  - Railway e Resend na região **US East**, a mais próxima do Brasil entre as do Railway e a mesma
    que o aviso de privacidade cita;
  - `backend/railway.json` versionado: build, start, **pre-deploy com `npm run db:deploy`** (as
    migrations rodam antes de a versão entrar; se falharem, a anterior continua), healthcheck em
    `/health` e deploy só quando algo muda em `backend/`. O `prisma` foi para `dependencies`, porque
    a CLI roda em produção;
  - deploy automático da `main`, com **Wait for CI** no Railway. Na Vercel, o `ignoreCommand` só
    deixa a `main` gerar build: um preview de PR usaria a API e o banco de produção;
  - cabeçalhos de segurança no front (`HSTS`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`
    e `Permissions-Policy`). A **CSP fica para depois**, porque precisa ser testada com o service
    worker e as fontes;
  - `TRUST_PROXY_HOPS` confirmado no deploy com um log de nível `debug` que conta as entradas do
    `X-Forwarded-For`, sem registrar os IPs (regra 7);
  - backups automáticos do Postgres ligados no Railway, com a retenção informada no aviso de
    privacidade;
  - o passo a passo dos painéis fica em `docs/DEPLOY.md`, e os READMEs apontam para ele.
- **Motivo:** o uso real (o autor e a psicóloga dele) pede e-mail entregue a terceiros, HTTPS e
  PWA instalável no celular. Versionar a configuração evita depender de cliques nos painéis. O
  pre-deploy e o Wait for CI evitam subir uma versão quebrada ou com migration pela metade.

## DEC-038 — Ajustes depois do primeiro deploy
O Faísca entrou no ar em `minhafaisca.com.br` em 30/09/2026. O que o deploy real mostrou:
- **Decisão:**
  - **sem backup do banco:** o plano Hobby do Railway não tem backups (só o Pro, cerca de US$ 20
    por mês). Com dois usuários, o custo não se justifica. O volume do Postgres persiste
    normalmente; o que falta é uma cópia para um acidente raro. Um backup manual no computador do
    autor criaria uma cópia de dados de saúde fora do controle do app. O aviso de privacidade diz
    "Não guardamos cópias de segurança", e a exclusão de conta não deixa rastro. Revisar se o uso
    crescer. Substitui o item de backups da DEC-037;
  - **Resend em São Paulo:** o Resend escolheu a região sozinho (`sa-east-1`). O aviso diz que os
    e-mails saem de servidores em São Paulo; o Railway e a Vercel seguem nos EUA. A versão do aviso
    continua `2026-10`, porque ninguém tinha se cadastrado em produção antes da correção;
  - **`PORT=3333` obrigatória** no Railway, igual à porta do domínio `api.`. Sem ela, a API sobe na
    8080, o healthcheck passa e o domínio responde 502;
  - **`TRUST_PROXY_HOPS=2`**, confirmado pelo log de debug: pela Vercel chegam 2 entradas no
    `X-Forwarded-For`;
  - **limite de login por e-mail**, além do de IP + e-mail (DEC-025): 20 senhas erradas em 15
    minutos no mesmo e-mail bloqueiam, venham de qualquer IP. Quem chama `api.minhafaisca.com.br`
    direto, sem a Vercel, pode forjar o `X-Forwarded-For` e trocar de "IP" a cada tentativa. Os
    outros limites já não dependem só do IP: a exclusão de conta conta por usuário, o código de
    vínculo por terapeuta, no banco, e a recuperação de senha por e-mail;
  - start em produção com `node dist/server.js` (no `railway.json`). O `npm start` fica para uso
    local, com o `.env`, e o log de produção deixa de mostrar ".env not found";
  - `overrides` no `backend/package.json` para `deepmerge-ts` (^8.0.2) e `mysql2` (^3.24.5). As 4
    vulnerabilidades altas vinham de versões fixadas pela CLI do Prisma 7.10, e o conserto sugerido
    pelo npm era voltar para o Prisma 6. Nenhuma era alcançável pelo app (o `mysql2` só serve para
    MySQL, e o `deepmerge-ts` só lê o `prisma.config.ts`). Validar, gerar o client e aplicar as
    migrations continuam funcionando. Remover os `overrides` quando o Prisma atualizar as duas;
  - o `docs/DEPLOY.md` registra os tropeços do primeiro deploy: o TCP Proxy para o `psql` (e
    removê-lo depois), as referências `${{...}}` do Railway, a espera de ~2 h do DNS no Registro.br,
    o sentido do redirecionamento do `www` na Vercel e a espera do certificado.
- **Motivo:** deixar o aviso de privacidade fiel ao que acontece de fato antes do primeiro cadastro
  real, fechar o drible do rate limit e fazer o próximo deploy não tropeçar nos mesmos pontos.

## DEC-039 — API do Registro de Pensamentos (RPD) e novo aceite do aviso
- **Decisão:**
  - o Registro de Pensamentos da TCC entra como registro **independente** das atividades (issue
    #48): dia da situação, situação, pensamento automático, o quanto acredita nele (0–10), uma ou
    mais emoções com intensidade (0–10), comportamento e consequência. **Todos obrigatórios**;
    textos de 1 a 1000 caracteres;
  - emoções de uma **lista fechada** (enum `Emotion`): tristeza, ansiedade, medo, raiva, culpa,
    vergonha, frustração, solidão, alegria, alívio e **outra**, que leva um nome livre de 1 a 50
    caracteres. Cada emoção aparece uma vez por registro. Ficam em `ThoughtRecordEmotion`, uma linha
    por emoção, e saem na ordem da lista;
  - termos clínicos suaves na interface: "Registro de Pensamentos (RPD)" e "pensamento automático",
    e não "pensamentos disfuncionais". É vocabulário técnico correto e não julga o que a pessoa
    escreveu. É a exceção ao "sem aparência clínica" da SPEC;
  - o dia da situação é DATE, **só até hoje** (400 `DATE_IN_FUTURE`), separado do `createdAt`;
  - **editar e excluir só no dia em que o registro foi feito** (São Paulo, pelo `createdAt`).
    Depois, 409 `THOUGHT_RECORD_LOCKED`, como a atividade finalizada (DEC-012). A escrita é
    condicional (`createdAt` ≥ início de hoje, como na DEC-028), e a resposta traz `editable`, para
    o "hoje" ficar só na API. Na edição, a lista de emoções que vier substitui a anterior inteira;
  - rotas do paciente em `/thought-records` (`GET ?from&to` com até 42 dias, `POST`, `PATCH /:id`,
    `DELETE /:id`), ordenadas por dia da situação e depois por `createdAt`. A terapeuta lê em
    `GET /therapist/patients/:patientId/thought-records`, com até 92 dias, atrás da mesma cadeia da
    DEC-033. Tudo sai em cascata ao excluir a conta;
  - **nova versão do aviso de privacidade, `2026-10.2`**, que cita o RPD. Quem aceitou a versão
    anterior aceita de novo por `POST /auth/accept-privacy` (`{ acceptPrivacy: true }`, com data e
    versão gravadas, como no cadastro). O `/auth/me` devolve `privacyUpToDate`. Sem o aceite, só a
    área de RPD responde 403 `PRIVACY_CONSENT_REQUIRED`, **para paciente e para terapeuta**; o resto
    do app segue igual;
  - os textos, a crença, as emoções e as intensidades entram no `redact` do logger (regra 7). Os
    lembretes não mudam (regra 3);
  - fora do escopo por ora: as colunas de reestruturação ("pensamento alternativo" e "como me sinto
    agora").
- **Motivo:** pensamentos e emoções são dados de saúde ainda mais sensíveis que as notas, e o
  consentimento na LGPD é para finalidades determinadas (art. 8º, § 4º, e art. 11, I). Por isso o
  aceite é renovado antes do uso, sem tirar o acesso ao que a pessoa já usava. Exigir todos os
  campos mantém o registro completo para a sessão, e o prazo de um dia deixa corrigir um erro de
  digitação sem reescrever o que a terapeuta já pode ter lido.

## DEC-040 — Telas do Registro de Pensamentos
- **Decisão:**
  - as telas principais do paciente ganham **abas**: **Atividades** (`/registros`) e **Pensamentos**
    (`/pensamentos`). Quem tem os dois perfis continua com "Meus registros / Meus pacientes" acima,
    e "Meus registros" fica marcado também em Pensamentos e Consultas;
  - `/pensamentos` navega por semana, como `/registros` (`?semana=AAAA-MM-DD`), mas mostra **só os
    dias com registro**, porque o RPD não é diário. O cartão mostra todos os campos, a crença e as
    emoções com a intensidade numa cor só, que varia o preenchimento (sem vermelho/verde);
  - o formulário fica em **página própria** (`/pensamentos/novo?dia=AAAA-MM-DD` e
    `/pensamentos/:id/editar`), e não num dialog: são sete campos, e as emoções abrem um slider
    cada. Para editar, a API ganha `GET /thought-records/:id` (mesma cadeia e mesma conferência de
    dono das outras rotas do paciente). Ao salvar, a pessoa volta para a semana do dia da situação
    com o aviso "Registro salvo.";
  - editar e excluir aparecem só com `editable`. Fora do prazo, o cartão mostra "Registrado em", e a
    página de edição explica que o registro ficou como está. O 409 da API leva à mesma mensagem;
  - visão da terapeuta: os botões **Atividades | Registro de Pensamentos** em `/pacientes/:id`, com a
    aba na URL (`?aba=pensamentos`) junto do período. O seletor de período e o destaque valem para as
    duas abas, e cada aba só pergunta à API quando está aberta. Os cartões são os mesmos, só leitura;
  - novo aceite do aviso (DEC-039): sem ele, `/pensamentos`, as páginas do formulário e a aba da
    terapeuta mostram o pedido de aceite no lugar do conteúdo (caixa desmarcada e link para
    `/privacidade` em outra aba) e nem chamam a API. O mesmo pedido aparece se a API responder 403
    `PRIVACY_CONSENT_REQUIRED`. Depois do aceite, a sessão é atualizada e as telas recarregam;
  - uma **faixa discreta** em Atividades e em Meus pacientes avisa que o aviso mudou, com "Ver o que
    mudou", enquanto o aceite não for feito. Não bloqueia nada;
  - textos: a exclusão de conta lista o Registro de Pensamentos, e o vínculo em Conta diz que a
    terapeuta lê "atividades, Registro de Pensamentos e consultas";
  - `db:seed-dev` grava a versão atual do aviso nas contas dev, cria 5 RPDs fictícios para a
    `paciente.dev` e a conta `aviso-antigo.dev@faisca.test`, com a versão anterior.
- **Motivo:** abas deixam o RPD a um toque, sem esconder as atividades. Uma página própria aguenta
  um formulário longo no celular melhor que um dialog, e guarda o lugar ao recarregar. A faixa
  cumpre o "avisamos no app antes" do aviso de privacidade sem obrigar ninguém a aceitar para
  continuar usando o resto.

## DEC-041 — Versão nova do app com "Atualizar" e aceite do aviso com o texto da terapeuta
- **Decisão:**
  - o service worker passa de `autoUpdate` para **`prompt`**. A versão nova é baixada e fica
    esperando. No topo de qualquer tela, uma faixa avisa "Tem uma versão nova do Faísca" com
    **Atualizar** (a versão nova assume e a página recarrega) e **Agora não** (ela assume sozinha
    quando todas as abas do app forem fechadas). O app aberto procura versão nova **de hora em
    hora** e **sempre que volta para a frente** (`visibilitychange`). O registro sai do
    `registerSW.js` injetado e vai para o `src/app/update-prompt.tsx` (`virtual:pwa-register/react`);
  - a faixa não recarrega sozinha: atualizar no meio de um formulário apagaria o que a pessoa
    estava escrevendo;
  - transição: as telas abertas na versão antiga não têm a faixa. A primeira versão com ela só
    assume depois que o app for fechado de vez uma vez; dali em diante, a faixa aparece;
  - o pedido de aceite do aviso (DEC-039 e DEC-040) ganha o **texto de quem aceita**. Na aba da
    terapeuta: "Para ver o Registro de Pensamentos dos seus pacientes…" e "inclusive com o acesso
    aos pensamentos e emoções dos meus pacientes como dados de saúde". O paciente segue com "o uso
    dos meus pensamentos e emoções". A API e o aceite gravado não mudam.
- **Motivo:** com `skipWaiting` imediato, a versão nova assumia em segundo plano, mas a tela aberta
  continuava com o código antigo até recarregar. O PWA instalado fica dias assim, e a psicóloga não
  via a aba de Pensamentos depois do deploy. O texto do paciente ("meus pensamentos") dava a
  entender à terapeuta que o aceite não era com ela.

## DEC-042 — API dos Episódios de tensão e aceite do aviso por área
- **Decisão:**
  - os **Episódios de tensão** entram como registro independente das atividades e do RPD (issue
    #52): dia, hora opcional, situação, tensão (0–10), vontade de vocalizar (0–10), o que fez e o que
    aconteceu depois. Tudo obrigatório, **menos a hora**; textos de 1 a 1000 caracteres. Na tela, as
    duas notas vão de "nenhuma" a "muito forte", e a vontade de vocalizar leva a dica "falar, gritar,
    se movimentar…", porque cobre o tique vocal ou de ansiedade, e não só a voz;
  - tabela `TensionEpisode`: `episodeDate` (DATE, **só até hoje**, 400 `DATE_IN_FUTURE`) e
    `episodeTime` (TIME sem segundos, **opcional**, no relógio de São Paulo, como `'HH:MM'` na API).
    Se o dia for hoje, a hora não pode ser depois de agora (400 `TIME_IN_FUTURE`); a edição confere
    o dia e a hora juntos, com o que já estava gravado. Notas e tamanhos também têm CHECK no banco;
  - **editar e excluir só no dia em que o registro foi feito**, como o RPD: depois, 409
    `TENSION_EPISODE_LOCKED`, com escrita condicional e `editable` na resposta. `episodeTime: null`
    apaga a hora;
  - ordem: dia, depois hora, com os **sem hora no fim** do dia, na ordem em que foram registrados;
  - rotas do paciente em `/tension-episodes` (`GET ?from&to` com até 42 dias, `GET /:id`, `POST`,
    `PATCH /:id`, `DELETE /:id`). A terapeuta lê em `GET /therapist/patients/:patientId/tension-episodes`,
    com até 92 dias, atrás da mesma cadeia da DEC-033. Tudo sai em cascata ao excluir a conta;
  - nova versão do aviso de privacidade, **`2026-10.3`**, que cita os episódios. O aceite passa a ser
    **por área**: cada área exige a versão que passou a citá-la (RPD a partir da `2026-10.2`,
    episódios a partir da `2026-10.3`), comparando pela posição numa lista ordenada de versões
    (`PRIVACY_VERSIONS`), e não como texto. O middleware vira `requirePrivacy(area)`. O `/auth/me`
    mantém `privacyUpToDate` (para a faixa "o aviso mudou") e ganha `privacyAreas`; os bloqueios do
    RPD no front passam a usar `privacyAreas.thoughtRecords`;
  - as duas notas entram no `redact` do logger (regra 7); os textos já estavam. Os lembretes não
    mudam (regra 3);
  - deploy: esta etapa vai para produção junto com a das telas, porque a faixa e o pedido de aceite
    do app ainda falam só do RPD.
- **Motivo:** o tique e a tensão são dados de saúde novos, e o consentimento na LGPD é para
  finalidades determinadas: por isso um novo aceite antes do uso. Exigir só "a versão atual" faria
  cada versão nova bloquear de novo o RPD de quem acabou de aceitá-lo; com a versão mínima por área,
  o novo aceite só é pedido para o que é novo. A hora ajuda a ver padrões, mas é o campo mais fácil
  de esquecer: obrigá-la levaria a horários inventados.

## DEC-043 — Telas dos Episódios de tensão
- **Decisão:**
  - as telas do paciente ganham a terceira aba: **Atividades | Pensamentos | Tensão** (`/tensao`).
    Num celular de 360px, as três abas usam texto menor e menos espaço interno; no computador, nada
    muda. "Meus registros" fica marcado também em `/tensao`;
  - `/tensao` navega por semana (`?semana=AAAA-MM-DD`) e mostra **só os dias com episódio**, como
    `/pensamentos`. O cartão mostra a hora ("às 14:30" ou **"sem horário"**), as duas notas em barras
    numa cor só e os três textos. Editar e excluir só com `editable`; depois, "Registrado em";
  - formulário em **página própria** (`/tensao/novo?dia=AAAA-MM-DD` e `/tensao/:id/editar`): dia,
    hora (opcional, "Pode deixar em branco se não lembrar"), o que estava acontecendo, tensão e
    vontade de vocalizar ("nenhuma" a "muito forte", com a dica "Falar, gritar, se movimentar…"), o
    que fez e o que aconteceu depois. A tela avisa antes de enviar uma hora de hoje que ainda não
    chegou. Ao salvar, volta para a semana do episódio com "Registro salvo.". O `ScoreField` ganha
    uma dica opcional embaixo do rótulo;
  - visão da terapeuta: os botões passam a ter **nomes curtos, iguais às abas do paciente**
    (**Atividades | Pensamentos | Tensão**), no lugar de "Registro de Pensamentos" da DEC-040, que
    não cabia com três botões no celular. A aba `?aba=tensao` usa o mesmo período e o mesmo destaque,
    com os cartões só leitura;
  - **gráfico da tensão** para a terapeuta (acima dos cartões) e **também para o paciente** (no fim
    da semana). Eixo do tempo contínuo: cada episódio é um ponto, posicionado pelo dia e pela hora
    (sem hora, no meio do dia), ligado ao seguinte na ordem do tempo. Um eixo só, de 0 a 10. Os
    **dias de consulta** aparecem como uma faixa "consulta". Toque ou mouse no ponto mostra o dia, a
    hora e as duas notas, e uma tabela com os mesmos dados fica para leitor de tela;
  - cores do gráfico: sálvia em dois tons (`--color-score-10` para a tensão, `--color-score-6` para a
    vontade de vocalizar). Passam no validador de paleta da skill de visualização (separação para
    daltonismo e visão normal, contraste ≥ 3:1, nos dois temas). As checagens de croma e faixa de
    luminosidade, pensadas para paletas de matizes diferentes, não se aplicam à regra de cor única do
    `frontend/CLAUDE.md`, e a leitura não depende só da cor: linha contínua × tracejada, círculo ×
    quadrado, legenda e tabela;
  - aviso de privacidade: o pedido de aceite recebe a **área** e quem aceita (textos próprios para o
    paciente e a terapeuta em cada área) e passa para `features/auth/`. A faixa "o aviso mudou" cita
    **só as áreas que faltam liberar** e sai da tela em que o pedido da área já aparece;
  - textos: a exclusão de conta lista os Episódios de tensão, e o vínculo em Conta diz que a
    terapeuta lê "atividades, Registro de Pensamentos, Episódios de tensão e consultas";
  - `db:seed-dev` cria 6 episódios fictícios para a `paciente.dev` (alguns sem hora, um no dia da
    última consulta) e a conta `aviso-rpd.dev@faisca.test`, só com a versão do aviso do RPD.
- **Motivo:** repetir o desenho do RPD deixa a parte nova familiar para quem já usa o app. O eixo de
  tempo contínuo mostra quando os episódios se concentram sem inventar uma nota para os dias sem
  episódio, e a faixa de consulta ajuda a terapeuta a ligar a tensão às sessões. O paciente também vê
  o gráfico, como já vê o das atividades: perceber o próprio padrão antes da sessão faz parte do
  acompanhamento.

## DEC-044 — Gráfico das atividades com barras horizontais
- **Decisão:**
  - o gráfico "Como foram as atividades feitas" (paciente e terapeuta) troca as colunas verticais
    do Recharts por **barras horizontais** em HTML. Cada atividade ocupa um bloco: o **nome
    inteiro** numa linha, com o **dia ao lado** ("Academia · seg, 28/09"), e embaixo as três
    barras (vontade antes, prazer e realização), na mesma ordem e nos mesmos tons de sálvia, sobre
    uma trilha que marca até onde vai o 10, com o valor escrito no fim;
  - a legenda fica acima das barras. Sai a rolagem lateral para mais de 8 atividades: o gráfico
    cresce para baixo;
  - a tabela para leitor de tela continua, com o dia junto do nome da atividade;
  - o Recharts segue no projeto, usado pelo gráfico da tensão (DEC-043).
- **Motivo:** num celular de 360px, cinco atividades deixavam uns 9 caracteres para cada nome
  no eixo, e os nomes se sobrepunham (visto em produção). Abreviar mais deixaria nomes iguais
  ("Consulta c…") e pioraria com mais atividades. Na horizontal, nenhum nome precisa ser cortado,
  e rolar para baixo é o gesto natural no celular. O dia liga a barra ao dia da lista logo abaixo e
  separa duas atividades com o mesmo nome na semana (ou no período da terapeuta).

## DEC-045 — Agenda de consultas recorrentes (API)
- **Decisão:**
  - as consultas passam a ter uma **agenda** (issue #30): `AppointmentSchedule` guarda a primeira
    sessão (`startDate`), a hora (`time`, TIME sem segundos, no relógio de São Paulo) e a frequência
    (`SEMANAL | QUINZENAL`). As sessões são **calculadas** (`sessions.ts`, funções puras), sem uma
    linha por sessão. Mudar a agenda fecha a regra em vigor (`endDate` na véspera da nova, `endReason`
    `MUDANCA`) e cria outra; encerrar a terapia fecha com `ENCERRAMENTO`. Índice único parcial: uma
    regra em vigor por paciente;
  - `AppointmentException` muda uma sessão específica, identificada pelo dia em que cairia pela
    regra: `DESMARCADA` ou `REMARCADA` (novo dia e hora), sempre com **motivo de 1 a 500
    caracteres**. Dá para desfazer. Desmarcar vale para sessão passada (falta); remarcar, só para
    sessão que ainda não começou e para um horário que ainda não chegou;
  - `TherapyPause`: início (hoje ou depois) e volta opcional. Sem sessões de `startDate` até a véspera
    do `returnDate`; "Retomar agora" encerra a pausa hoje (ou desfaz a que ainda não começou). Uma
    pausa por vez, e só com agenda em vigor;
  - a consulta **avulsa** (`Appointment`) continua, agora com `appointmentTime` obrigatório nas novas.
    As de antes da agenda ficam sem hora e contam o dia todo para "última" e "próxima";
  - **um horário por dia**: avulsa, remarcação, desfazer uma remarcação e agenda nova não podem cair
    num dia com sessão agendada (409 `APPOINTMENT_EXISTS` ou `SCHEDULE_CONFLICT`), conferido no
    service; a desmarcada libera o dia;
  - última e próxima passam a considerar a hora: a sessão de hoje às 14:00 é a próxima até 14:00;
  - datas: a primeira agenda pode começar até 365 dias atrás; mudanças, pausas e remarcações vão de
    hoje até 365 dias à frente. Encerrar apaga as sessões que ainda não começaram, inclusive avulsas
    e remarcações, e termina a pausa;
  - rotas do paciente: `GET /appointments?from&to` (até 400 dias; sem período, de 91 dias atrás a 91
    à frente) devolve `status` (`SEM_AGENDA | ATIVA | PAUSADA | ENCERRADA`), `schedule`, `pause`,
    `sessions`, `upcoming` (as próximas 6, inclusive desmarcadas), `last` e `next`. Escrita em
    `PUT /appointments/schedule`, `POST /appointments/schedule/end`, `POST /appointments/pause`,
    `POST /appointments/pause/resume`, `POST /appointments/sessions/:date/cancel`,
    `POST /appointments/sessions/:date/reschedule` e `DELETE /appointments/sessions/:date/change`;
    as avulsas seguem em `POST`, `PATCH` e `DELETE /appointments/:id`;
  - `GET /appointments/calendar.ics`: as sessões dos próximos 12 meses, um evento por sessão (e não
    RRULE, para pausas e exceções saírem certas), duração de 1 hora, texto neutro "Consulta" e a
    desmarcada como `CANCELLED`. O motivo nunca vai para o arquivo;
  - terapeuta: `GET /therapist/patients/:patientId/appointments` devolve a mesma agenda, com os
    motivos. O resumo do paciente ganha `agendaStatus` e `pause` (sem motivos), para o selo "em pausa"
    ou "encerrada" na tela dela. A lista de pacientes não muda: o selo usa o resumo de cada um, sem
    expor dado de paciente fora de `/therapist/patients/...`;
  - aviso de privacidade **`2026-10.4`**, com a área `appointmentSchedule`. Sem ela, o paciente lê a
    agenda, mas não grava hora, motivo nem pausa; excluir, encerrar e retomar seguem liberados. A
    terapeuta precisa dela para ler a agenda com os motivos (o resumo segue aberto);
  - `reason` entra no `redact` do logger (regra 7). O destaque da terapeuta não muda nesta etapa
    (vem com o ciclo da consulta, issue #29), só passa a usar o dia da próxima sessão calculada.
- **Motivo:** a terapia é semanal ou quinzenal, e cadastrar cada data à mão não reflete o uso real.
  Calcular as sessões a partir da regra evita gerar linhas sem fim e deixa mudar a agenda, pausar e
  encerrar sem apagar o histórico. O motivo obrigatório dá contexto à terapeuta sobre faltas e
  remarcações, e o arquivo `.ics` leva a agenda ao calendário do celular sem expor dado de saúde.

## DEC-046 — Telas da agenda de consultas
- **Decisão:**
  - `/consultas` vira a página da agenda: o bloco **"Sua agenda"** com a regra por extenso ("Toda
    quinta-feira, às 14:00" ou "A cada duas semanas, na quinta-feira, às 14:00"), a pausa, os botões
    **Mudar**, **Pausar** (ou **Retomar agora**) e **Encerrar**, e o link **"Adicionar à agenda do
    celular"** (`.ics`). Sem agenda, **Configurar agenda**; depois de encerrar, **Agendar de novo**;
  - **Próximas** (as 6 da API) e **Anteriores** (as do período que já começaram, da mais recente para
    a mais antiga). Cada sessão mostra dia, hora e distância, um selo (desmarcada, remarcada de dd/mm,
    avulsa) e o motivo. Ações: **Remarcar** e **Desmarcar** nas próximas, **Registrar falta** nas
    anteriores, **Desfazer** nas que mudaram, **Mudar** e **Excluir** nas avulsas. Desmarcar e
    remarcar pedem o motivo (até 500 caracteres) no próprio diálogo;
  - **Nova consulta avulsa** (dia e hora) no topo da página, no lugar de "Nova consulta";
  - o card "Consultas" de `/registros` mostra a próxima e a última com a hora, "Configure sua
    agenda" sem agenda, a pausa e o encerramento. O selo "consulta" da semana (Atividades e Tensão)
    pede a agenda **do período aberto** e marca só as sessões agendadas;
  - sem o aceite da `2026-10.4`, `/consultas` mostra o pedido de aceite e a lista só para ler, sem
    nenhuma ação. A faixa "o aviso mudou" passa a citar a agenda;
  - terapeuta: o card "Consultas" de `/pacientes/:id` ganha o selo da situação ("Em pausa até
    12/10", "Terapia encerrada", "Sem agenda") e o botão **"Ver a agenda"**, que mostra a regra, a
    pausa, as próximas e as 6 anteriores mais recentes com os motivos, só leitura, ou o pedido de
    aceite dela. Sem o aceite, o selo "consulta" usa só a última e a próxima do resumo. Em
    `/pacientes`, cada item ganha o mesmo selo, a partir do resumo de cada paciente;
  - o aviso de privacidade passa à versão 4 (agenda, motivos, pausas e o arquivo `.ics`), e a exclusão
    de conta cita a agenda.
- **Motivo:** a agenda substitui o cadastro de datas soltas sem mudar onde a pessoa já procura as
  consultas (card e `/consultas`). Mostrar a desmarcada riscada, com o motivo, em vez de sumir com
  ela, mantém o histórico que a terapeuta usa para entender as faltas. O selo na lista poupa a
  terapeuta de abrir cada paciente para saber quem está em pausa.

## DEC-047 — Gráfico das atividades: colunas a partir do tablet
- **Decisão:** o gráfico "Como foram as atividades feitas" escolhe o formato pela largura da tela:
  abaixo de **768px**, as barras horizontais da DEC-044 (nome inteiro e dia); a partir de 768px
  (tablet e computador), as **colunas lado a lado** do Recharts, como antes, com o nome cortado em
  14 caracteres e rolagem lateral a partir de 9 atividades. A troca é feita por um hook
  `useMediaQuery`, e só um dos dois formatos é montado. A tabela para leitor de tela não muda.
- **Motivo:** o pedido do usuário. No tablet e no computador, as colunas cabem e deixam a comparação
  entre atividades mais direta; o problema que levou às barras era só o celular estreito.

## DEC-048 — Correção da agenda no mesmo dia e consultas antigas absorvidas
- **Decisão:**
  - mudar a agenda **no mesmo dia em que ela foi criada** (dia de São Paulo, pelo `createdAt`) é uma
    **correção**: as regras criadas hoje saem inteiras, com as desmarcações e remarcações delas, sem
    deixar sessões no histórico. A regra anterior que uma delas tinha fechado (`MUDANCA`) volta a
    valer e é fechada de novo pela regra nova. Se depois disso não sobra regra nenhuma, valem as
    regras da primeira agenda, que pode começar no passado;
  - ao criar ou mudar a agenda, uma **consulta antiga sem hora** (avulsa de antes da agenda) que cai
    num dia da regra nova é a mesma sessão: sai, e a sessão da agenda fica no lugar, com a hora.
- **Motivo:** em produção, uma agenda criada por engano começando no dia e corrigida minutos depois
  deixou uma sessão falsa no histórico, que também encurtaria o ciclo da consulta. Um engano no mesmo
  dia não é histórico a preservar. E quem já usava o app antes da agenda tinha as consultas como
  datas soltas, que bateriam com a agenda nova e a impediriam de começar no passado.

## DEC-049 — Ciclo da consulta (API)
- **Decisão:**
  - o ciclo é calculado na API, a partir das sessões **agendadas** da agenda (`cycleFor`, função pura
    em `sessions.ts`): do dia seguinte à sessão anterior até o dia da sessão. Desmarcada não fecha
    ciclo, remarcada fecha no dia novo, avulsa fecha. O primeiro ciclo tem o passo da regra da
    sessão (7 ou 14 dias; 7 para avulsa). Sem próxima sessão, ciclo aberto até hoje. Teto de 42
    dias, o mesmo limite das listas do paciente, ficando com os mais recentes (`truncated`);
  - `GET /appointments/cycle?date=AAAA-MM-DD` (sem `date`, hoje) devolve `today` e `cycle`: `from`,
    `to`, a sessão que fecha o ciclo (dia, hora e tipo; `null` no ciclo aberto), `truncated` e um dia
    do ciclo anterior e do seguinte (`previous`, `next`), para as setas. Sem nenhuma sessão, `cycle`
    é `null`. O `date` vai até 365 dias à frente (400 `DATE_TOO_FAR`), para o cálculo não pesar na
    API. A terapeuta lê o mesmo em `GET /therapist/patients/:patientId/cycle`, atrás da cadeia
    da DEC-033;
  - as duas rotas **não pedem o aceite da agenda**: devolvem só dias e horas, como o resumo, nunca
    motivos;
  - a rota é nova e não muda nenhuma existente: a API vai para produção antes das telas, sem a janela
    em que o front novo fala com a API antiga (como no deploy da agenda). O `highlight` do resumo
    continua na resposta até as telas deixarem de usá-lo.
- **Motivo:** a psicóloga discute o que aconteceu desde a sessão anterior. Contar a partir das sessões
  (e não um tamanho fixo de 7 ou 14 dias) não deixa buraco depois de uma desmarcação nem sobreposição
  numa remarcação. Calcular na API mantém o "hoje" e as regras da agenda num lugar só.

## DEC-050 — Telas do ciclo da consulta
- **Decisão:**
  - as três abas do paciente (Atividades, Pensamentos, Tensão) e a visão da terapeuta abrem no
    **ciclo da consulta** atual (`GET .../cycle`, DEC-049), com a alternância **Ciclo | Semana**. O
    período fica na URL: `?ciclo=AAAA-MM-DD` (um dia do ciclo) ou `?semana=AAAA-MM-DD`; sem nenhum dos
    dois, o ciclo de hoje. Sem nenhuma sessão na agenda, não aparece a alternância e vale a semana,
    como antes. Trocar de aba mantém o período, e salvar um pensamento ou episódio volta para o ciclo
    do dia registrado;
  - cabeçalho do ciclo: "Consulta de 07/10" e "01/10 a 07/10" (no ciclo aberto, "Desde a última
    consulta" e "até hoje"), setas para o ciclo anterior e o seguinte, "Voltar para o ciclo atual",
    aviso quando o ciclo passa de 42 dias, **"Sua consulta é daqui a N dias"** ("A consulta é…" para a
    terapeuta) e o **resumo do ciclo**: "7 dias · 5 atividades feitas · 2 pensamentos registrados ·
    1 episódio de tensão", só números, sem meta; a área que a terapeuta ainda não liberou no aviso
    fica de fora do resumo;
  - no ciclo, todos os dias aparecem nas Atividades (como na semana); Pensamentos e Tensão seguem
    mostrando só os dias com registro. Gráficos e textos dizem "no ciclo" e "neste ciclo";
  - terapeuta: saem o **destaque âmbar** e o filtro **"desde a última consulta"** (DEC-033, DEC-034),
    substituídos pelo ciclo; o `highlight` do resumo deixa de ser usado pelas telas;
  - componentes compartilhados em `features/cycle/` (`usePeriod`, `PeriodNav`, resumos), e hooks das
    listas por período (`useRange…`).
- **Motivo:** a psicóloga discute o que aconteceu desde a sessão anterior; abrir as duas telas no
  mesmo recorte deixa paciente e terapeuta olhando a mesma coisa. Manter a semana como alternativa
  preserva o hábito de quem já usa o app. O resumo e a contagem dão contexto sem cobrança, seguindo o
  tom do app.

## Adiado
- **Exportação CSV/PDF:** os dados são consultados direto no app.
- **Modo demo:** quando existir, terá deploy e banco próprios, só com dados fictícios.

## Em aberto
- **CSP (Content-Security-Policy) no front:** adiada na DEC-037.
