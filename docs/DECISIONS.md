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

## DEC-051 — API da Ação
- **Decisão:**
  - a **Ação** entra como registro independente das atividades (issue #62): tabela
    `BehavioralAction` com `actionDate` (DATE), `name` (1 a 100), `category`
    (`PRAZER | CONEXAO | REALIZACAO`), `status` (`PLANEJADA | AVALIADA | NAO_REALIZADA`),
    `expectation` (0 a 10, sempre), `pleasure` e `achievement` (0 a 10, só na avaliada) e
    `observation` (até 1000, na avaliada e na não realizada). CHECKs no banco para notas, textos e
    os campos de cada estado;
  - datas: **planejar** de hoje até 7 dias à frente; **registrar algo já feito** (criar já
    `AVALIADA`) de 7 dias atrás até hoje; **avaliar** ou marcar **não realizada** só a partir do
    dia da ação (400 `ACTION_NOT_YET`), sem prazo depois dele. Fora da janela, 400
    `DATE_OUT_OF_RANGE`;
  - **avaliada e não realizada são finais**: editar, avaliar de novo ou excluir é 409
    `ACTION_FINALIZED`, com escrita condicional (`status = PLANEJADA`). Na planejada, mudar só o nome,
    o tipo ou a expectativa vale mesmo com o dia já passado; mudar o dia segue a janela de planejar;
  - rotas do paciente em `/actions` (`GET ?from&to` com até 42 dias, `GET /:id`, `POST`,
    `PATCH /:id`, `POST /:id/evaluate`, `POST /:id/not-done`, `DELETE /:id`). A terapeuta lê em
    `GET /therapist/patients/:patientId/actions`, com até 92 dias, atrás da cadeia da DEC-033;
  - aviso de privacidade **`2026-10.5`**, com a área `actions`: sem ela, paciente e terapeuta não
    usam a Ação, e o resto do app segue igual;
  - `expectation` entra no `redact` do logger (regra 7); nome, prazer, realização e observação já
    estavam. Tudo sai em cascata ao excluir a conta;
  - a meta por ciclo e as telas vêm na DEC-052.
- **Motivo:** a ativação comportamental compara o que a pessoa esperava com o que sentiu; guardar a
  expectativa antes e as notas depois, em dois momentos, preserva essa comparação. Manter a não
  realizada registrada, em vez de excluí-la, mostra os ciclos com mais e com menos ações sem culpa.
  As janelas de 7 dias cobrem o planejamento até a próxima sessão semanal e o esquecimento comum.

## DEC-052 — Telas da Ação
- **Decisão:**
  - quarta aba **Ação** (`/acao`) no paciente; no celular, as quatro abas passam a uma **grade 2×2**
    (e os botões da terapeuta também), porque "Pensamentos" não cabe numa linha com quatro abas;
  - a tela segue o período das outras abas (ciclo ou semana, DEC-050) e tem: o bloco recolhível **"O
    que é a Ação?"** com os três tipos e exemplos; a **meta do ciclo** ("Neste ciclo"), com um espaço
    por tipo (dois no ciclo de 14 dias ou mais) que se preenche com uma ação feita, sem número de
    "faltam" nem cor de alerta; os dias com ação; o atalho **"Repetir do ciclo passado"**, com as
    ações do ciclo anterior levando ao formulário já com o nome e o tipo; e o **gráfico** de
    expectativa × prazer × realização no fim;
  - o cartão mostra o tipo, o estado ("Planejada", "Feita", "Não deu desta vez") e a **expectativa ao
    lado do resultado** ("Esperava 3 · Prazer 7 · Realização 6"). Na planejada: **"Conta como foi?"**
    e **"Não deu desta vez"** a partir do dia da ação, **Editar** e **Excluir**;
  - formulário em página própria (`/acao/nova?dia=&nome=&tipo=` e `/acao/:id/editar`): **"Vou fazer"
    | "Já fiz"**, tipo com a descrição, nome com o **exemplo do tipo escolhido** no placeholder e na
    dica, dia (com a janela de cada modo) e expectativa; no "Já fiz", também prazer, realização e
    observação. Ao salvar, volta para o ciclo do dia com "Ação salva.";
  - o gráfico das atividades vira um componente genérico (`ScoreChart`), usado pelas atividades e
    pela Ação, com o mesmo desenho (barras no celular, colunas a partir do tablet);
  - o resumo do ciclo ganha "N ações feitas"; a exclusão de conta cita as ações;
  - terapeuta: aba **Ação** em `/pacientes/:id?aba=acao`, só leitura, com a meta, os cartões e o
    gráfico, ou o pedido de aceite dela.
- **Motivo:** repetir o desenho das outras áreas deixa a parte nova familiar. A meta em espaços mostra
  o que já foi feito sem placar nem culpa (frontend/CLAUDE.md), e a expectativa ao lado do
  resultado é o que dá sentido à Ação: perceber que muitas vezes foi melhor do que se esperava.

## DEC-053 — Textos do RPD e da Tensão com até 5000 caracteres
- **Decisão:**
  - os textos do Registro de Pensamentos (situação, pensamento automático, comportamento e
    consequência) e dos Episódios de tensão (situação, o que fez e o que aconteceu depois) passam de
    1000 para **5000 caracteres** (issue #67), no Zod, no CHECK do banco (migration nova, que troca
    só o CHECK) e no front. As **observações** das atividades e da Ação continuam em 1000;
  - nesses campos, o formulário **não usa mais `maxLength`**, que corta em silêncio o texto colado.
    O `TextAreaField` ganha `limit`: um **contador** aparece a partir de 80% do limite ("4.850 de
    5.000 caracteres") e, se passar, mostra quanto passou. Quem barra é a validação, no front e na
    API;
  - nos cartões (paciente e terapeuta), texto com mais de 700 caracteres abre **recolhido**, com
    um trecho de até 500, cortado no último espaço, e o botão **"Ver mais" / "Ver menos"**;
  - deploy: a API sobe antes do front (#66). Com a ordem invertida, um texto acima de 1000 daria
    400 até a API nova subir.
- **Motivo:** o limite de 1000 foi estourado num uso real. Relatos de situação e de pensamento podem
  ser longos, e cortar o relato atrapalha o que a terapia precisa ler. 5000 (cerca de uma página)
  dá folga e ainda barra um texto colado por engano. Aumentar não perde dado: as colunas são `TEXT`
  e todo registro que já existe continua válido. As observações são notas curtas e ficam como
  estão. O contador e o "Ver mais" evitam o corte silencioso e mantêm os cartões legíveis.

## DEC-054 — API da explicação alternativa no RPD e do card de Novidades
- **Decisão:**
  - o RPD ganha as colunas de reestruturação que a DEC-039 tinha deixado de fora (issue #69),
    como na ficha "Avaliando Pensamentos: Perspectiva alternativa" usada na terapia (Beck, 2022):
    a **explicação alternativa** (`alternativeExplanation`, opcional, 1 a 5000 caracteres) e o
    **"como me sinto agora"** (`intensityAfter` em cada emoção, 0 a 10). A reavaliação só existe
    com a alternativa e cobre **todas** as emoções do registro, ou nenhuma. Continua um registro
    só, e não uma área nova: a alternativa responde ao pensamento daquele registro;
  - `alternativeAddedAt` guarda quando a alternativa entrou (CHECK: as duas colunas juntas). No
    PATCH do dia, ela é marcada quando a alternativa aparece, mantida quando o texto muda e apagada
    junto com ela (o `null` apaga a alternativa e a reavaliação);
  - **adicionar depois do dia:** `POST /thought-records/:id/alternative` (`{ alternativeExplanation,
    emotionsAfter? }`), uma vez só, se a alternativa estiver vazia (senão 409
    `ALTERNATIVE_ALREADY_SET`, com escrita condicional para dois envios ao mesmo tempo). O prazo é a
    **hora marcada da primeira consulta agendada que ainda não tinha começado quando o registro foi
    feito**: passou, 409 `ALTERNATIVE_DEADLINE_PASSED`; sem consulta, 409 `NO_NEXT_APPOINTMENT`;
  - **prazo congelado:** ao criar o registro, a API guarda essa hora em `alternativeDeadlineAt`
    (segunda migration). Depois, vale **o que vier primeiro**: o prazo congelado ou a consulta pela
    agenda de agora. Assim, desmarcar ou apagar uma consulta que já passou não reabre o prazo, e
    antecipar a consulta o encurta; remarcar para depois não o estende. Os registros sem prazo
    congelado (os de antes deste PR e os feitos sem consulta agendada) são congelados na primeira
    vez que a paciente os vê com uma consulta pela frente (lista ou página de edição), com escrita
    condicional. A leitura da terapeuta não grava nada;
  - a reavaliação, se vier, precisa listar exatamente as emoções do registro (400
    `EMOTIONS_MISMATCH`). O resto do registro continua travado, e o PATCH depois do dia segue em
    409;
  - a resposta do RPD traz `alternativeDeadline` (dia e hora da consulta, ou null) e
    `canAddAlternative`, para o "agora" ficar só na API, como o `editable`. A agenda é lida uma vez
    por pedido, e não uma por registro. A terapeuta lê os campos novos na rota de sempre, só GET;
  - **card de Novidades:** `User.seenAnnouncement` guarda a última novidade vista. O `/auth/me`
    devolve `pendingAnnouncement` (a atual, ou null), e `POST /auth/announcement-seen`
    (`{ announcement }`) marca só a atual; outra é 400. Conta nova já nasce com a atual vista. Os
    textos ficam no front; a lista das novidades fica em `auth/announcements.ts`;
  - logs: `alternativeExplanation`, `intensityAfter` e `emotionsAfter` entram no `redact` (regra 7).
    Lembretes não mudam (regra 3);
  - **sem nova versão do aviso de privacidade**: a finalidade é a mesma do RPD já aceito
    (pensamentos e emoções). O texto do aviso passa a citar os campos novos nas telas (DEC-055), e
    o card de Novidades conta a mudança para todos;
  - `db:seed-dev`: os RPDs dos dias anteriores passam a ter `createdAt` no próprio dia (travados,
    como no uso real), dois com alternativa e um aberto para adicionar até a próxima consulta.
- **Motivo:** a explicação alternativa é a parte da TCC que trabalha o pensamento, e muitas vezes
  só aparece depois do momento. O prazo até a consulta seguinte deixa adicionar com o registro
  ainda recente, e por isso mais fiel ao que se viveu, e a data guardada mostra à terapeuta se ela
  veio no dia ou depois. Sem consulta agendada não há prazo a contar, e o app é para quem faz
  terapia (a agenda obrigatória segue na issue #65). As Novidades ficam no banco porque, no
  iPhone, o Safari e o app instalado não dividem o armazenamento.
  O prazo congelado veio da revisão (revisor-regras): sem ele, a própria pessoa podia reabrir o
  prazo mexendo no passado da agenda.
- **Limites conhecidos:** num registro feito sem consulta agendada, a primeira consulta marcada
  depois, mesmo que bem mais tarde, abre o prazo até ela. E um registro de antes deste PR que a
  paciente ainda não abriu depois do deploy pode ter o prazo reaberto se ela mexer no passado da
  agenda antes de vê-lo; na prática, o botão de adicionar só aparece depois de ver a lista, que já
  congela.

## DEC-055 — Telas da explicação alternativa e do card de Novidades
- **Decisão:**
  - **formulário do RPD:** depois de "Consequência", o campo **Explicação alternativa** (opcional,
    com a dica "Existe outro jeito de olhar para essa situação? O que você diria a uma pessoa
    querida que tivesse esse pensamento?"). Com ela escrita, aparece **Como me sinto agora**: a
    caixa "Quero dizer como me sinto agora" abre um slider por emoção, com a nota de antes na dica,
    e aí todas ficam obrigatórias (a API exige todas ou nenhuma). Na edição, apagar o texto manda
    `null` e apaga a alternativa;
  - **cartão:** a alternativa num bloco com fundo pêssego (`bg-accent/10`, borda `accent`), o
    destaque pontual que o visual permite, e "Adicionada em dd/mm" quando ela entrou num dia
    depois do registro. As emoções reavaliadas aparecem como "8 → 4" (a barra segue a de antes);
  - **depois do dia, sem alternativa:** dentro do prazo, o botão **"Adicionar explicação
    alternativa"** com "até sex, 17/10, às 10:00"; sem consulta agendada, o convite "Agende sua
    próxima consulta…" com link para a agenda; prazo encerrado, **nada**, para o cartão não falar
    de prazo perdido. Sem contagem de dias, que soaria como cobrança;
  - **página `/pensamentos/:id/alternativa`:** mostra no topo a situação e o pensamento automático
    daquele registro, explica que é uma vez só e até quando, e tem o mesmo bloco do formulário. Um
    409 da API mostra a mensagem dela no lugar do formulário. Registro de hoje leva ao "Editar";
  - **card de Novidades** no topo das telas de quem entrou (`AppLayout`), com borda e fundo
    pêssego: título, texto do perfil de paciente e/ou de terapeuta (quem tem os dois vê os dois),
    **"Entendi"** e, no perfil de paciente, **"Ver meus pensamentos"** (os dois marcam como vista).
    Os textos ficam no front, por id; um id desconhecido não mostra nada;
  - **resumo do ciclo:** "2 pensamentos registrados (1 com explicação alternativa)", com os
    parênteses só quando há alguma;
  - **aviso de privacidade:** o item do RPD passa a citar a explicação alternativa e o "como me
    sinto agora", **sem versão nova** (exceção registrada no comentário de `privacy-page.tsx`);
  - o "Ver mais" / "Ver menos" dos textos longos (DEC-053) fica sempre sublinhado, para não passar
    despercebido.
- **Motivo:** o bloco da alternativa é o mesmo nos dois lugares (formulário e adicionar depois),
  para a pessoa reconhecer. Mostrar o pensamento ao adicionar depois ajuda quem volta dias depois
  a lembrar do que está respondendo. O destaque pêssego e o "antes → agora" deixam à vista, para a
  terapeuta, o que foi reestruturado e se a alternativa ajudou. A finalidade do RPD não mudou, por
  isso não há novo aceite; o card de Novidades conta a mudança a todos.

## DEC-056 — Ordem do deploy: a API antes do front
- **Decisão:**
  - num merge, a Vercel publica o front em ~1 min e o Railway, a API em ~8–9 min (espera o CI,
    build, migration no pre-deploy e healthcheck). Por isso, **mudança de contrato da API** (rota,
    formato de resposta ou de entrada que o front usa) **nunca vai no mesmo PR que o front que
    depende dela** (issue #66):
    1. primeiro o PR da API, **aditivo**: a API nova continua aceitando o front que está no ar;
    2. merge e conferência da API em produção;
    3. só então o PR do front;
  - remover ou renomear algo do contrato segue o "expandir e depois contrair": a API aceita os dois
    formatos, o front muda, e só depois um PR tira o antigo;
  - o `GET /health` passa a devolver `version`: os 7 primeiros caracteres do commit no ar
    (`RAILWAY_GIT_COMMIT_SHA`, preenchido pelo Railway; `null` fora dele). Depois do merge da API,
    o `version` igual ao commit do merge confirma que ela já está no ar;
  - o passo a passo de cada deploy fica na skill `deploy-checklist`; o `docs/DEPLOY.md` segue com o
    primeiro deploy e aponta para ela.
- **Motivo:** nos deploys da agenda (#56/#57) e da Ação (#63/#64), o front novo falou com a API
  antiga por ~8 e ~9 minutos (rotas em 404, telas que podiam quebrar). Nos do ciclo (#60/#61) e da
  explicação alternativa (#71/#72), feitos em dois PRs, não houve janela nenhuma. Fazer a Vercel
  esperar o Railway (deploy hook disparado por um workflow) exigiria segredo novo e mudanças nos
  dois painéis, e deixaria sem deploy os PRs só de front; para um projeto solo, a regra de
  processo, verificável pelo `/health`, resolve com menos peças.
- **Limite conhecido:** depende de disciplina; a skill `deploy-checklist` classifica o PR antes do
  merge para lembrar da regra. A proteção da `main` com checks obrigatórios (que destravaria o
  auto-merge) fica para depois, porque os workflows filtram por pasta (issue nova).

## DEC-057 — API das marcas de leitura da terapeuta ("Lido")
- **Decisão:**
  - a terapeuta marca como **lido** um Pensamento, um Episódio de tensão ou uma Ação de um paciente
    vinculado (issue #79). Atividades ficam de fora. É a **segunda exceção da regra 1** do
    AGENTS.md ("terapeuta: só GET"), depois dos POSTs do vínculo (DEC-031): ela grava só **as
    próprias marcas**, na tabela `ReadMark`, e **nunca altera o registro do paciente**;
  - as escritas ficam num **prefixo próprio**: `PUT /therapist/read-marks/:patientId` marca e
    `DELETE` desmarca, com `{ items: [{ type, id }] }` (até 500, para o "Marcar todos"). A cadeia
    é sessão → perfil de terapeuta → vínculo ativo; `/therapist/patients/...` continua com o
    `onlyReads` antes de tudo. Cada item é conferido: registro de outro paciente, ou de área sem o
    aceite do aviso, recusa o pedido inteiro (403) e nada é gravado;
  - `ReadMark` tem uma coluna por área (`thoughtRecordId`, `tensionEpisodeId`, `actionId`, CHECK
    de exatamente uma), `therapistId`, `patientId` e `readAt`; some em cascata com o registro ou
    com qualquer uma das contas. Uma marca por terapeuta e registro: a terapeuta nova de uma
    paciente começa sem marcas;
  - **status:** `NAO_LIDO` (sem marca), `LIDO` (marca igual ou depois do `updatedAt`) ou
    `ATUALIZADO` (o registro mudou depois da marca). As listas da terapeuta de Pensamentos,
    Tensão e Ação passam a trazer `readStatus` e `readAt`. O congelamento do prazo da explicação
    alternativa (DEC-054) passa a preservar o `updatedAt` (e só grava se o registro não mudou
    desde a leitura), para não "atualizar" nada à toa; e a edição do RPD sempre renova o
    `updatedAt`, porque mudar só as emoções (outra tabela) não o mudava;
  - `GET /therapist/patients/:patientId/unread` traz os não lidos e atualizados das três áreas, de
    qualquer data, na ordem das listas, com `counts`; área sem o aceite vem como `null`, em vez de
    403. `GET /links/patients` ganha `unreadCount`, só das áreas com aceite;
  - o **paciente não vê** as marcas: nenhuma rota dele muda. Logs só com ids (regra 7);
  - tudo o que já existia começa **não lido**: um "Marcar todos" resolve.
- **Motivo:** o ciclo responde "o que aconteceu nesta semana?", mas não "o que eu ainda não vi?":
  um registro do ciclo passado, ou uma explicação alternativa adicionada na véspera, passava
  despercebido. A marca é um dado de trabalho da terapeuta sobre a própria leitura, não uma
  escrita no prontuário; por isso cabe numa exceção estreita, num prefixo à parte, e o resto da
  visão da terapeuta segue com a garantia do `onlyReads`. Esconder do paciente evita a expectativa
  de resposta ("ela não leu o que eu escrevi").
- **Limite conhecido:** o contador da lista de pacientes lê ids e datas e conta na memória; com
  muitos registros por paciente, valeria uma consulta agregada no banco.

## DEC-058 — Telas do "Lido" da terapeuta
- **Decisão:**
  - o texto fala em **"para ler"** ("4 para ler", "5 registros para ler"), e não em "não lidos":
    soa como uma tarefa tranquila, e não como pendência atrasada;
  - na tela do paciente, um **card acima das abas**, só quando há algo para ler: "5 registros para
    ler", com a divisão por área e o botão **"Ver os registros para ler"**. Uma quinta aba
    quebraria a grade 2×2 do celular (DEC-052);
  - a visão **"Para ler"** (`?aba=para-ler`) junta Pensamentos, Tensão e Ação fora do ciclo, do mais
    antigo ao mais novo, com a área e o dia acima de cada cartão, o link "‹ Voltar ao ciclo" e, sem
    nada pendente, "Você já leu todos os registros de {nome}";
  - nas abas, um **número discreto** ao lado do nome (lido como ", 2 para ler" pelo leitor de
    tela), sem cor de alerta; o botão de cada cartão leva no nome, para o leitor de tela, a
    situação ou o nome do registro; ao marcar na visão "Para ler", o foco vai para o título;
  - no rodapé de cada cartão, só na visão da terapeuta: **"Marcar como lido"**; lido, **"Lido em
    dd/mm"** e **"Marcar como não lido"**; atualizado, o selo pêssego **"Atualizado depois que você
    leu"** e "Marcar como lido". Nunca marca sozinho ao abrir;
  - **"Marcar todos como lidos (N)"** no topo de cada lista e da visão "Para ler", só com algo
    pendente, marca exatamente a lista aberta, depois da confirmação **"Marcar N registros como
    lidos?"** (dá para desfazer em cada registro);
  - na lista de pacientes, o selo neutro **"4 para ler"**;
  - card de Novidades **só para a terapeuta** (`2026-10-lido`). Cada novidade passa a ter um
    **público** na API (todos ou só terapeuta), e a pendente é a mais recente que vale para o perfil
    da pessoa, depois da última vista: assim a novidade da terapeuta não esconde, de quem é só
    paciente, a da explicação alternativa que ela ainda não viu. `POST /auth/announcement-seen` só
    aceita a novidade pendente da pessoa (outra → 400);
    casos aceitos: conta nova nasce com a mais recente vista, então quem ativa o perfil de
    terapeuta depois não recebe a do "Lido"; e quem tem os dois perfis vê só a mais recente
    (continua valendo "uma novidade por vez", DEC-054);
  - aviso de privacidade: "A terapeuta pode marcar os seus registros como lidos, para se organizar.
    Essa marca é só dela: você não a vê.", **sem nova versão** (como na DEC-055);
  - `db:seed-dev` grava marcas da terapeuta dev nos três estados.
- **Motivo:** mostrar o que falta ler sem transformar a leitura em cobrança, nem para a psicóloga.
  O card só aparece quando é útil, e o "Marcar todos" com confirmação resolve a estreia, em que
  tudo começa para ler (DEC-057).

## DEC-059 — Visual dos campos: borda com contraste, foco sálvia e opções desenhadas
- **Decisão:**
  - nova cor **`--faisca-field-border`** (`#8a7f70` no claro, `#6a8b92` no escuro), só para a borda
    dos campos, com contraste de 3,7 a 4,4:1 contra o fundo e a superfície. A borda de antes
    (`--faisca-border`, 1,3 a 1,7:1) não atendia a WCAG 1.4.11 (3:1) e continua só nos cartões;
  - estilo central em `components/ui/field-styles.ts` (como o `button-styles.ts`):
    `fieldClasses` para texto, data, hora e textos longos (borda de 1,5px, cantos arredondados,
    hover em sálvia mais leve; foco com borda e anel sálvia sólidos e `outline-hidden`, que continua visível no alto contraste do sistema) e `choiceCardClasses` para os cartões de opção
    (marcado: borda sálvia e fundo tingido);
  - erro do campo com **ícone** (`FieldError`), para não depender só da cor (WCAG 1.4.1), também nos
    grupos de opções, ligado ao `fieldset` por `aria-describedby`;
  - caixa de seleção e rádio desenhados no `index.css` sobre o elemento nativo (teclado, leitor
    de tela e formulário iguais), voltando ao controle do sistema em alto contraste
    (`forced-colors`) e sem transição com `prefers-reduced-motion`.
- **Motivo:** o usuário pediu campos com a identidade do Faísca, e a revisão mostrou que a borda
  dos campos quase não aparecia. Um estilo central muda todos os formulários de uma vez e prepara
  o perfil (#83).
- **Limite conhecido:** o anel colorido da foto de perfil fica para o PR do perfil (#83).

## DEC-060 — Página "O que há de novo"
- **Decisão:**
  - página **`/novidades`** com todas as novidades do app que valem para a pessoa, da mais nova
    para a mais antiga, com a **data** em que cada uma entrou no ar e o texto do perfil dela
    (paciente, terapeuta ou os dois). Uma novidade só para terapeutas não aparece para quem é só
    paciente;
  - os textos saem do card para `features/announcements/announcement-texts.tsx`, com `date` e
    `patient`/`therapist` opcionais; card e página leem do mesmo lugar;
  - selo **"Nova"** na novidade ainda não fechada. **Abrir a página não conta como "Entendi"**: o
    card continua no topo até a pessoa tocar nele;
  - entradas: seção "Novidades do Faísca" na Conta e o link "Ver todas as novidades" no card
    (escondido na própria página);
  - **`/novidades#<id>`** abre e foca direto uma novidade, para o link das mensagens de novidade
    por canal (#82).
- **Motivo:** o card mostra uma novidade por vez; quem perde um card, ou tem os dois perfis e só vê
  a mais recente, não tinha como rever o que mudou. Só front, sem API.
- **Limite conhecido:** a data é escrita à mão no texto de cada novidade, no dia em que ela vai ao ar.

## DEC-061 — Perfil básico: nome completo e foto (API)
- **Decisão:**
  - **nome completo** opcional (`User.fullName`, até 120 caracteres, CHECK no banco), separado do
    `name` ("Como podemos te chamar?"), que continua sendo o nome mostrado no app;
  - **foto no próprio Postgres**, numa tabela à parte (`UserAvatar`), e não num serviço de
    arquivos: já reduzida a 256×256 em WebP (~20 KB), ela tem a mesma proteção e as mesmas regras
    dos outros dados. O serviço de arquivos fica para os laudos (#84), decidido lá;
  - o servidor confere o **tipo pelos primeiros bytes do arquivo** (JPEG, PNG ou WebP; até 5 MB e
    25 MP), antes de abri-lo, e processa uma foto por vez; o envio tem limite de 20 por hora por
    conta, porque processar imagem é caro numa instância pequena. Ele também endireita pela
    orientação da câmera, recorta no centro e **regrava sem metadados** (sem a localização GPS da
    foto). O recorte manual fica no front; o servidor recorta de novo por garantia;
  - rotas: `GET`/`PATCH /profile` e `GET`/`PUT`/`DELETE /profile/avatar`, sempre da própria
    conta; `GET /link/therapist/avatar` para o paciente ver a foto da terapeuta vinculada; e
    `GET /therapist/patients/:patientId/avatar`, dentro da cadeia de vínculo ativo (regra 1);
  - fora dessas rotas, só a **versão da foto** (`avatarVersion`, a data da última troca) aparece
    em `/link`, `/links/patients` e no resumo do paciente, para o front pedir a imagem certa sem
    cache antigo. A regra do `backend/CLAUDE.md` foi atualizada;
  - corpo grande demais passa a responder **413** (`PAYLOAD_TOO_LARGE`), e não 500;
  - `fullName` entra no `redact` dos logs (regra 7);
  - foto e nome completo são dados pessoais, mas não de saúde: o aviso de privacidade os cita
    **sem novo aceite** (como na DEC-055), na etapa das telas;
  - o **celular** fica para as notificações (#82): sem confirmação por código, seria um dado sem uso.
- **Motivo:** o pedido do perfil (#83), com o menor risco possível: nada de serviço novo logo
  depois do ataque ao Railway, e nada da foto que não seja necessário guardar.
- **Limite conhecido:** como o Faísca não tem backup no plano Hobby (DEC-038), a foto também não tem.

## DEC-062 — Incidente do Railway (out/2026): troca de todos os segredos
- **Decisão:**
  - em 21/10/2026, o Railway confirmou acesso indevido às variáveis de ambiente dos clientes (parte
    delas descriptografada) e pediu que todos trocassem os segredos. Os deploys ficaram pausados por
    mais de um dia (plano Hobby voltou em 22/10, 18h08 de Brasília);
  - não houve sinal de uso indevido no Faísca, e o banco **não estava aberto na internet** (o TCP
    Proxy da configuração inicial tinha sido removido, como manda o DEPLOY). Mesmo assim, **todos os
    segredos foram trocados** em 22/10: senhas do `postgres`, do `faisca_app` e do
    `faisca_migrator`, `JWT_SECRET`, `LINK_CODE_SECRET` e a chave do Resend (a antiga foi apagada).
    As chaves VAPID ainda não existem em produção;
  - as senhas do banco foram trocadas pelo **Console** do Postgres (`\password`), sem reabrir o
    banco na internet; o passo a passo virou a seção "Trocar os segredos" do `docs/DEPLOY.md`;
  - efeito para quem usa: todos saíram da conta (JWT novo) e entraram de novo;
  - no mesmo dia, o IP `216.198.79.1` da Vercel parou de responder e o site ficou fora por ~10 h;
    o registro A do domínio raiz passou para `76.76.21.21`.
- **Motivo:** dado de saúde em risco. Trocar tudo é barato perto do custo de um segredo vazado.
- **Limite conhecido:** não há como saber se a conta do Faísca estava no grupo afetado; o Railway
  só avisa por e-mail os casos confirmados, e nenhum chegou. Sem monitor de queda, o site fora do ar
  foi percebido por acaso: um monitor externo (ex.: UptimeRobot) fica recomendado.

## DEC-063 — Paletas de cores (API)
- **Decisão:**
  - cinco paletas, escolhidas pelo usuário a partir de uma prévia: **Sálvia** (a atual e padrão),
    **Lavanda**, **Oceano**, **Areia** e **Alto contraste**. Todas conferidas no contraste nos dois
    temas: AA nas quatro coloridas e AAA no Alto contraste;
  - a escolha fica **na conta** (`User.palette`, enum `Palette`; null = Sálvia), e não no aparelho,
    para valer no celular e no computador. O tema (claro, escuro, automático) continua no aparelho;
    paleta e tema se combinam;
  - vem no `/auth/me` (`palette`, já resolvida para `SALVIA` quando vazia), para o app aplicar as
    cores logo ao abrir, e muda pelo `PATCH /profile`, sempre da própria conta. O PATCH agora aceita
    só os campos enviados (nome completo, paleta ou os dois); corpo vazio é 400;
  - a lista de paletas do Zod (`PALETTES`) é conferida contra o enum do Prisma num teste;
  - as notas de 0 a 10 e os gráficos acompanham a cor principal de cada paleta, num tom só, sem
    vermelho e verde (nas telas).
- **Motivo:** o pedido do perfil (#83): personalização, com uma opção de alto contraste que ajuda
  quem enxerga pior. O enum evita guardar um nome de paleta que o app não conhece.
- **Limite conhecido:** paleta nova pede migration (o enum) e um bloco de cores nas telas.

## DEC-064 — Fotos na Ação (API)
- **Decisão:**
  - na Ação **avaliada**, até **10 fotos**, todas opcionais. O prazo para adicionar e remover é a
    **próxima consulta** depois da avaliação (mesma regra do prazo da explicação alternativa,
    DEC-054); sem consulta marcada, não há prazo. Fora da avaliada, 409 `PHOTOS_NOT_ALLOWED`; depois
    do prazo, 409 `PHOTOS_CLOSED`;
  - a Ação passa a guardar **quando foi avaliada** (`evaluatedAt`). As já avaliadas recebem o
    `updatedAt` na migration, porque avaliada é final e só mudava na avaliação;
  - **no Postgres**, numa tabela à parte (`ActionPhoto`, em cascata com a ação): a foto grande cabe em
    **2560 px** (WebP, qualidade 85, sem aumentar fotos menores) e a **miniatura** é um quadrado de
    400 px. Envio de até **20 MB** e **50 MP**, uma imagem por vez na API toda (fila em
    `lib/images.ts`), 60 envios por hora por conta, e o limite de 10 conferido antes de tratar a imagem;
    tipo conferido pelos primeiros bytes; **sem metadados** (sem GPS). O tratamento de imagem foi
    para `lib/images.ts`, usado também pela foto de perfil;
  - **gatilho para sair do Postgres:** quando as fotos passarem de **1 GB**, ou com os laudos (#84),
    migrar para um serviço de arquivos; o vídeo fica para essa etapa;
  - **a psicóloga vê as fotos** (só GET, vínculo ativo), pelo prefixo da terapeuta;
  - foto nova ou removida conta como mudança da ação: quem já leu vê **"atualizado"** (DEC-057);
  - **área nova no aviso de privacidade** (versão `2026-10.6`, `actionPhotos`): as fotos fazem parte
    do registro de saúde e podem mostrar outras pessoas. Sem o aceite, a Ação funciona e só as fotos
    pedem o aceite (paciente e terapeuta). A API **conhece** a versão, mas a **versão atual** (a que o
    cadastro e o aceite gravam) continua a `2026-10.5` até o PR das telas, que traz o texto do aviso
    e troca a atual para a `2026-10.6`. Assim ninguém aceita um texto que ainda não viu;
  - o prazo das fotos é **congelado** (`photosDeadlineAt`) na avaliação ou na primeira leitura do
    paciente com uma consulta pela frente, como o da alternativa: desmarcar ou apagar uma consulta
    que já passou não reabre; antecipar a consulta encurta. A leitura da terapeuta não grava nada;
  - a lista da Ação traz `photos` (id e data), `photosDeadline` e `photosOpen`; as imagens vêm por
    rota própria (`?size=thumb|full`), com cache privado de um dia (uma foto não muda: trocar é
    remover e adicionar).
- **Motivo:** o pedido do usuário (#95): guardar os bons momentos das ações, que ajudam na ativação
  comportamental e dão assunto para a sessão.
- **Limite conhecido:** sem backup no plano Hobby (DEC-038).

## DEC-065 — Fotos na Ação (telas) e aviso de privacidade versão 6
- **Decisão:**
  - no cartão da ação **avaliada**, as fotos aparecem como **miniaturas**; tocar abre a foto grande
    numa janela ("Foto 1 de 3"), com **Anterior** e **Próxima** (também pelas setas do teclado);
  - o paciente, dentro do prazo, tem **"Adicionar fotos"** (escolhe várias de uma vez; o app manda
    uma por vez e mostra "Enviando 2 de 3…") e **"Remover foto"** na foto aberta, com confirmação.
    O cartão mostra o prazo ("até seg, 28/09, às 14:00"), quantas fotos cabem ("2 de 10") e o lembrete
    de que as fotos aparecem para a psicóloga e de conferir se outras pessoas na foto estão de acordo.
    Mais de 20 MB, ou além do limite de 10, fica de fora com aviso, sem enviar;
  - o seletor pede só JPEG, PNG e WebP: assim o iPhone converte a foto HEIC antes de enviar;
  - depois do prazo, as fotos continuam à vista, sem adicionar nem remover; sem fotos e sem prazo,
    o cartão não fala de fotos. A **terapeuta** vê as miniaturas e a foto grande, pelo endereço do
    vínculo, sem botões de mudança;
  - sem o aceite da versão que cita as fotos, a Ação funciona normalmente: "Adicionar fotos" (ou
    "Ver as fotos", para a terapeuta) abre o pedido de aceite numa janela. Quem não aceitou pode
    aceitar quando quiser, pela faixa do aviso ou pelo próprio cartão;
  - o **aviso de privacidade** passa à **versão 6** (`2026-10.6` vira a atual): cita as fotos em "O
    que guardamos", em "Quem vê" e em "Por quanto tempo" (remover a foto também a apaga);
  - **card de Novidades** `2026-10-fotos-acao`, para pacientes e terapeutas.
- **Motivo:** fechar o #95 com a API já no ar (DEC-064, DEC-056); trocar a versão do aviso no mesmo
  PR que mostra o texto, para ninguém aceitar o que ainda não leu.
- **Limite conhecido:** o envio da foto HEIC depende da conversão do próprio iPhone (testar no
  aparelho da psicóloga); a foto sobe sem barra de progresso por arquivo.

## DEC-066 — Fotos da Ação sem cache no aparelho
- **Decisão:** as imagens das fotos da Ação (paciente e terapeuta, miniatura e grande) vão com
  `Cache-Control: no-store`, no lugar do cache privado de um dia da DEC-064.
- **Motivo:** a foto é dado de saúde e pode mostrar outras pessoas. Com cache, ela ficava no disco
  do aparelho depois de sair da conta ou de desfazer o vínculo, inclusive num celular dividido.
- **Limite conhecido:** a foto é baixada de novo a cada visita. As miniaturas têm 400 px, então o
  custo é pequeno. A foto de perfil continua com `private, no-cache` (DEC-061), porque mostra só o
  rosto de quem a enviou, que já aparece para quem tem vínculo. As fotos baixadas antes desta
  mudança podem continuar no aparelho por até 24 horas, pelo cache antigo.

## DEC-067 — Observações da Ação e das atividades com até 5000 caracteres
- **Decisão:** a observação da Ação (ao contar como foi, ao registrar já feita e em "não deu desta
  vez") e a das atividades (ao concluir e em "não realizada") passam de 1000 para **5000
  caracteres**, no Zod, no CHECK do banco (migrations novas, que trocam só o CHECK) e no front, com
  o mesmo contador da DEC-053 e sem `maxLength`. No cartão, observação longa abre recolhida, com
  "Ver mais". Muda o que a DEC-053 tinha decidido para as observações.
- **Motivo:** o limite estourou num uso real (o relato de uma ação de conexão). Na Ação, a
  observação é o lugar de contar como foi, que a terapia lê; cortar o relato atrapalha. A DEC-053
  tinha deixado as observações em 1000 por serem notas curtas, e elas não são. As atividades vão
  junto, a pedido do usuário, para o limite ser o mesmo em todo o app. Aumentar não perde dado: as
  colunas são `TEXT` e todo registro que já existe continua válido.
- **Limite conhecido:** deploy da API antes do front (DEC-056). Com a ordem invertida, uma
  observação acima de 1000 daria 400 até a API nova subir.

## Adiado
- **Exportação CSV/PDF:** os dados são consultados direto no app.
- **Modo demo:** quando existir, terá deploy e banco próprios, só com dados fictícios.

## Em aberto
- **CSP (Content-Security-Policy) no front:** adiada na DEC-037.
