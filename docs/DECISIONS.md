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

## DEC-068 — Seu perfil: nome completo e paletas (telas)
- **Decisão:**
  - em **Conta**, no topo, a seção **"Seu perfil"**: nome completo (opcional; só a própria pessoa
    vê) e a **paleta de cores**, em cartões com uma amostra de cor, e o botão "Salvar perfil";
  - ao tocar numa paleta, as cores do app **mudam na hora, como prévia** (escolha do usuário). Só
    ficam ao salvar; quem sai de Conta sem salvar volta à paleta da conta;
  - cada paleta é um bloco de tokens no CSS (`:root[data-palette=...]`, com claro e escuro), sem
    mexer nas telas. A **escala das notas** (0 a 10) de cada uma foi gerada a partir da cor
    principal, com o mesmo contraste de cada degrau da Sálvia; no **Alto contraste**, os degraus
    são mais fortes (do 3 em diante, ao menos 3:1). Todas as cores de texto, campo e botão passam
    no AA nos dois temas (conferido por script);
  - a paleta da conta vem no `/auth/me` e é aplicada no `<html>` ao abrir. A última aplicada também
    fica no aparelho (`faisca:palette`, como o tema), lida pelo `theme-init.js` antes do React, para
    o app não abrir piscando a Sálvia;
  - o aviso de privacidade cita o nome completo e a paleta **sem versão nova** (DEC-061): são dados
    pessoais da própria conta, não de saúde.
- **Motivo:** o pedido do perfil (#83), com as paletas escolhidas pelo usuário (DEC-063). A prévia
  na hora ajuda a escolher sem ir e voltar.
- **Limite conhecido:** a foto de perfil fica para o próximo PR (recorte com react-easy-crop). Ao
  sair da conta, a paleta da última pessoa continua no aparelho até a próxima entrar.

## DEC-069 — Foto de perfil (telas)
- **Decisão:**
  - em **Seu perfil**, acima do nome: a foto num **círculo com anel na cor principal da paleta**;
    sem foto (ou se ela não carregar), as **iniciais** do nome no mesmo círculo (só letras: "Ana
    (fictícia)" vira "AF"). Botões "Escolher foto" / "Trocar foto" e "Remover foto", com confirmação;
  - ao escolher, abre o **recorte** (react-easy-crop 6.2.4, aprovado pelo usuário): círculo,
    arrastar para posicionar e zoom pelo controle ou com dois dedos. O app desenha só o pedaço
    escolhido num quadrado de 512 px e envia em JPEG; a API recorta de novo, reduz a 256 px e tira os
    metadados (DEC-061). O seletor pede só JPEG, PNG e WebP, para o iPhone converter a HEIC;
  - a foto salva na hora (sem o "Salvar perfil"), porque já passou pela confirmação do recorte;
  - onde aparece: a da **terapeuta** no cartão do vínculo, em Conta (ajuda a conferir que é a pessoa
    certa); a do **paciente** na lista "Meus pacientes" e no topo da página dele, para a terapeuta. A
    imagem é decorativa (o nome está sempre ao lado em texto), sem texto alternativo próprio;
  - o aviso de privacidade cita a foto e quem a vê, **sem versão nova** (DEC-061).
- **Motivo:** fechar o perfil básico (#83) com o menor risco: a imagem é tratada no servidor e só
  aparece para quem tem vínculo.
- **Limite conhecido:** a foto só aparece nos lugares acima; no topo do app (perto de "Conta") fica
  para depois, se fizer falta.

## DEC-070 — Proteção da main com CI obrigatório
- **Decisão:**
  - a `main` passa a exigir **PR** (sem aprovação de outra pessoa: o projeto tem um dono só) e o CI
    verde nos quatro jobs: `backend`, `frontend`, `playwright` e `migrations`;
  - a branch **não** precisa estar atualizada com a `main` para o merge: senão cada merge obrigaria
    a atualizar e rodar de novo o CI dos outros PRs abertos;
  - force push e exclusão da `main` ficam bloqueados;
  - a regra **não** vale para administradores: o dono mantém uma saída para correção de emergência;
  - os quatro workflows rodam em **todo PR**, com um job `changes` que confere se o PR mexe na área;
    se não mexe, o job principal é pulado, e o GitHub conta pulado como aprovado (PR #111). Sem
    isso, um PR que não toca numa área esperaria para sempre pelo resultado dela;
  - com a proteção, o **merge automático** do GitHub passa a funcionar: ligado no PR, o merge
    acontece sozinho quando o CI fica verde.
- **Motivo:** item 2 do plano de Engenharia de Contexto (#92, #77). Nenhum código entra na `main`
  sem passar pelo CI, e o merge deixa de depender de alguém lembrar de conferir os checks.
- **Limite conhecido:** o dono ainda pode contornar a regra como administrador; isso fica
  reservado a emergências, e o hook do Claude Code continua bloqueando force push na `main`.

## DEC-071 — Revisor de segurança e npm audit no CI
- **Decisão:**
  - subagente **`revisor-seguranca`**, só de leitura, em dois modos: **por área** (backend,
    frontend, testes, dependências), para revisar o código inteiro uma área por vez, e **pelo
    diff**, antes de PR que mexa em login, sessão, senha, vínculo, envio de arquivo ou
    dependências. Ele entrega uma lista priorizada (alta, média, baixa) com `arquivo:linha`, o
    cenário de ataque e o teste que provaria a falha; **não corrige**: o usuário aprova e cada
    correção sai num PR pequeno, com um teste que falha antes e passa depois. Não substitui pentest;
  - workflow **`audit-ci.yml`**: `npm audit --omit=dev --audit-level=high` no backend e no
    frontend, em todo PR e toda segunda de manhã. **Só avisa** (escolha do usuário): não entra nos
    checks obrigatórios da main (DEC-070), para uma falha publicada num dia qualquer não travar
    todos os PRs, inclusive uma correção urgente sem relação com ela;
  - **alertas do Dependabot** ligados no GitHub, sem os PRs automáticos de atualização (escolha do
    usuário, para evitar barulho). A varredura de segredos do GitHub já estava ativa.
- **Motivo:** item 3 do plano de Engenharia de Contexto (#92). A falha do `sharp` (corrigida no
  #109) mostrou que dependência fica insegura sem ninguém mexer no código.
- **Limite conhecido:** o `npm audit` só conhece falhas publicadas; a revisão lê o código, mas
  não ataca o app em execução.

## DEC-072 — Confirmação de e-mail aplica o cadastro do link clicado e confere a senha dele
- **Decisão:**
  - cada cadastro com um e-mail ainda não confirmado gera o **próprio link**, que guarda a senha
    (só o hash), o nome e os perfis **daquele cadastro** (`AuthToken.pending*`, com CHECK no banco).
    Um cadastro novo não invalida o link de outro;
  - **confirmar exige a senha daquele cadastro**: o link de outra pessoa com o mesmo e-mail só
    confirma com a senha dela, que a dona não sabe. A senha é conferida antes de usar o link, então
    um erro de digitação não o gasta. Link de antes desta DEC, sem os dados do cadastro, confere com
    a senha da conta. A tela do link pede "a senha que você escolheu ao criar a conta", com o
    atalho "esqueceu a senha? crie uma nova" (que também confirma o e-mail). Entrou em dois PRs: a
    API aceitando a senha e depois a tela pedindo e a API exigindo (a Vercel publica antes do
    Railway, DEC-056);
  - confirmar aplica os dados do link clicado, incrementa o `sessionVersion` (derruba qualquer
    sessão anterior) e apaga os outros links de confirmação. Conta já confirmada não muda;
  - o reenvio manda o link do cadastro pendente mais recente, que só confirma com a senha daquele
    cadastro; sem nenhum cadastro pendente válido (links vencidos), não manda nada e quem pediu
    refaz o cadastro;
  - limites do cadastro: **3 por hora por e-mail e IP juntos** (outra pessoa não gasta a cota da
    dona do e-mail) e **10 por hora só por e-mail** (barra quem troca de "IP" para mandar e-mails
    sem fim), além do limite por IP. A confirmação tem limite de erros por IP;
  - cada link novo apaga os links de confirmação vencidos da conta; "esqueci a senha" antes de
    confirmar apaga os pendentes. Nada de hash de senha nem nome guardado além do necessário;
  - dois links diferentes clicados juntos esperam a vez (a conta é travada primeiro), sem erro 500;
  - o e-mail cumprimenta pelo nome daquele cadastro; `pendingPasswordHash` e `pendingName` entram
    no `redact` dos logs (regra 7).
- **Motivo:** a primeira revisão de segurança (`revisor-seguranca`, DEC-071) achou uma tomada de
  conta: quem se cadastrava antes com o e-mail de outra pessoa e uma senha própria ficava com a
  conta quando a dona se cadastrava e confirmava. Com a conta, dava para gerar um código de vínculo
  e ler os registros dela. A revisão da primeira correção mostrou que só aplicar os dados do link
  clicado não bastava: os e-mails são idênticos e o outro pode mandar vários. Por isso o usuário
  escolheu somar a senha na confirmação, que fecha o caso de verdade.
- **Limite conhecido:** "esqueci a senha" antes de confirmar mantém o nome e os perfis do primeiro
  cadastro (a pessoa ajusta em Conta). O convite anexado a um cadastro (`attachInvite`) ainda vale
  para a conta inteira, e não para o link: revisar nas próximas correções de segurança.

## DEC-073 — Respostas de conta no mesmo tempo e `no-store` como padrão da API
- **Decisão:**
  - cadastro, "esqueci a senha" e reenvio da confirmação **validam o pedido e respondem**; buscar a
    conta, gerar o link e mandar o e-mail acontecem **depois da resposta** (`lib/background.ts`).
    Pedido inválido continua recebendo 400 na hora. Uma falha nesse trabalho vai para o log só com
    o tipo da tarefa e o nome e o código do erro, sem a mensagem (que pode citar o e-mail); a
    pessoa vê a mesma resposta neutra da DEC-025 e pode pedir de novo. Os testes que leem o e-mail
    logo depois do pedido (Vitest e a API do Playwright) rodam o trabalho antes de responder
    (`runInline`);
  - o **hash da senha do cadastro continua antes da resposta**: ele sempre acontece, exista a
    conta ou não, então não muda o tempo, e a parte que ocupa a CPU não entra na fila;
  - o trabalho depois da resposta tem **teto: 4 tarefas de uma vez e até 50 esperando de cada
    tipo**; o que passar disso é descartado com aviso no log. Sem teto, quem forja IPs encheria a
    memória; com cota por tipo, uma enxurrada de cadastros não barra o "esqueci a senha" de
    ninguém. No deploy, a API espera até 5 s pelas tarefas pendentes antes de encerrar;
  - **toda resposta da API sai com `Cache-Control: no-store`**, inclusive erros do CORS e do JSON
    (o middleware vem logo depois do `helmet`). Quem precisa de outro valor troca na própria rota (a
    foto de perfil continua `private, no-cache`, DEC-061).
- **Motivo:** a revisão de segurança (DEC-071) mostrou que o texto já era igual (DEC-025), mas o
  tempo não: com conta, a API esperava o banco e o Resend; sem conta, respondia na hora. Medindo o
  tempo, dava para descobrir quem usa o Faísca, um app de terapia. Responder antes do trabalho
  deixa o tempo igual sem atrasar todo mundo; um tempo mínimo fixo deixaria tudo mais lento e
  ainda vazaria quando o Resend demorasse. O `no-store` padrão evita que registros de terapia
  fiquem guardados no aparelho ou em proxies por esquecimento numa rota nova.
- **Limite conhecido:** se a API reiniciar (deploy) no instante entre a resposta e o envio, o
  e-mail não sai; a pessoa pede de novo. Dentro de um mesmo tipo a cota é dividida: quem tem
  muitos IPs pode lotar a fila de "esqueci a senha" e o pedido de outra pessoa naquele momento é
  descartado (ela vê a resposta neutra e pede de novo depois); juntar pedidos iguais por e-mail
  fica para quando houver sinal de abuso.

## DEC-074 — Teto de fotos por conta e convite sem o nome no assunto
- **Decisão:**
  - além das 10 por ação (DEC-064), **cada conta guarda até 300 fotos**, somando todas as ações. Acima
    disso, o envio recebe 409 `ACCOUNT_PHOTO_LIMIT` com a orientação de remover uma foto de alguma
    ação que ainda esteja no prazo. O limite é conferido antes de tratar a imagem e de novo na transação,
    com a conta e depois a ação travadas (sempre nessa ordem), para dois envios juntos não passarem;
  - o assunto do e-mail de convite passa a ser fixo: **"Você recebeu um convite para o Faísca"**. O
    nome de quem convida continua no corpo, escapado, com o aviso "se não conhece quem enviou, pode
    ignorar".
- **Motivo:** a revisão de segurança (DEC-071) apontou que o teto por ação não segurava quem cria
  ações sem fim: com até 20 MB enviados por foto, uma conta podia encher o Postgres do Railway e
  derrubar o app para todos. 300 são 30 ações cheias, muito acima do uso real, e o usuário
  escolheu esse número. O nome é escrito livremente no cadastro, então no assunto ele virava um
  meio de mandar phishing com o domínio do Faísca (ex.: um "nome" que imita um banco).
- **Limite conhecido:** fotos de ações com o prazo já fechado não podem ser apagadas (DEC-064), então
  quem chegar ao teto só libera espaço nas ações ainda no prazo. Enviando várias fotos de uma vez
  no limite, a tela repete o aviso para cada uma (mostrar uma vez só fica para um PR do front). Rever o número se alguém chegar
  perto em uso real.

## DEC-075 — Cópia de segurança diária, criptografada e fora do Railway
- **Decisão:**
  - o Faísca passa a ter **cópia de segurança do banco** (substitui o "sem backup" da DEC-038). Um
    serviço próprio no Railway (`backup/`, Postgres 18) faz o `pg_dump` pela **rede privada**: o
    banco continua fechado para a internet. Ele confere se a cópia abre,
    **criptografa com `age`** antes de sair e envia para o **Cloudflare R2**, fora do Railway;
  - a cópia é feita pelo **`faisca_backup`**, que só tem `SELECT` no schema `public`, inclusive nas
    tabelas futuras (`ALTER DEFAULT PRIVILEGES`). O papel `pg_read_all_data` foi descartado porque
    também lê o `pg_authid`, onde ficam os hashes das senhas. O `faisca_app` e o `faisca_migrator`
    não mudam (regra 6). A conexão vem das variáveis `PG*` do libpq, sem senha na linha de comando;
  - em texto claro, a cópia **nunca toca o disco**: ela sai do `pg_dump` direto para o `age`, e uma
    cópia do fluxo passa inteira por um `pg_restore` que não grava nada. O log registra o SHA-256,
    que é conferido antes de restaurar. A chave pública precisa ser uma só, senão o script para;
  - a **chave pública** fica no repositório (`backup/age-recipient.txt`). A **chave privada** fica só
    com o autor, no gerenciador de senhas e em papel. Nunca vai para o Railway, o GitHub ou uma conversa;
  - **retenção:** 7 cópias diárias (`daily/`, 7 dias) e 4 semanais, as de domingo (`weekly/`, 28
    dias). Quem apaga as antigas são as regras de expiração do R2. Por até um dia, até a expiração
    rodar, pode haver uma a mais. Uma **trava de retenção** do R2 impede apagar ou sobrescrever uma
    cópia antes do prazo, mesmo com a chave de envio (6 e 27 dias, um a menos que a expiração);
  - o CI (`backup-ci.yml`) testa o ciclo inteiro com dados fictícios: cópia pelo usuário só de
    leitura, criptografia com uma chave descartável, cópia que não abre sem a chave e restauração
    num banco vazio;
  - **ordem de entrada:** a cópia **diária** (o `cronSchedule`) só entra junto com o **aviso de
    privacidade novo, em versão nova e com novo aceite** (DEC-036). A mudança é material: dado de
    saúde passa a sair do Railway e a ficar guardado depois da exclusão. Até lá, o serviço roda com
    `BACKUP_TEST_ONLY=1`, que só grava na pasta `test/`, **sem trava**. A cópia de teste é apagada à
    mão logo depois do teste de restauração (e expira em 1 dia), para o aviso atual, que diz "não
    guardamos cópias de segurança", seguir verdadeiro na prática. Sem cron, **cada deploy** do
    serviço roda o script uma vez;
  - a restauração é testada à mão, uma vez por mês, num contêiner descartável, porque precisa da
    chave privada.
- **Motivo:** com o cadastro aberto e uso real, um volume corrompido, um erro de migration ou um
  incidente como o do Railway em out/2026 (DEC-062) apagaria registros de terapia para sempre. O
  backup do Railway só existe no plano Pro (~US$ 20/mês), enquanto o R2 tem 10 GB grátis e não cobra
  para baixar uma cópia. Rodar no GitHub Actions obrigaria a deixar o banco aberto na internet.
  Criptografar antes de sair faz uma cópia vazada ser inútil sem a chave. A preocupação da DEC-038
  (dados de saúde fora do controle do app) fica atendida porque nada sai do Railway em texto claro.
- **Limite conhecido:** quem exclui a conta continua nas cópias **por até 5 semanas**, até elas
  expirarem. O mesmo vale para uma foto removida da Ação. O aviso de privacidade novo precisa dizer
  as duas coisas. O "sem backup" citado nos limites da DEC-064 e da DEC-065 deixa de valer com esta
  decisão. Se a chave privada se perder, as cópias
  ficam inúteis. A chave de envio do R2 também consegue ler, mas sem a chave privada o que ela lê não
  serve para nada. A restauração em produção (banco novo) está descrita, mas não foi ensaiada.

## DEC-076 — Ajustes de acessibilidade (API)
- **Decisão:**
  - cinco ajustes de acessibilidade na conta (`User`, booleanos, desligados por padrão; issue #87):
    **`directLanguage`** (Linguagem direta), **`oneThingAtATime`** (Uma coisa por vez),
    **`comfortableReading`** (Leitura confortável), **`noTimePressure`** (Sem pressão de tempo) e
    **`reducedMotion`** (Menos movimento);
  - ficam **na conta** (e não só no aparelho), para valerem no celular e no computador, e são
    **abertos a todos** (paciente e terapeuta), sem precisar informar condição de saúde;
  - vêm agrupados em `accessibility` no `GET /auth/me` (para o app aplicá-los logo ao abrir) e no
    `GET /profile`, e mudam pelo `PATCH /profile` (`{ accessibility: { ... } }`, sempre da própria
    conta). O `PATCH /profile` continua aceitando só os campos enviados (nome completo, paleta e/ou
    qualquer subconjunto dos cinco ajustes); objeto `accessibility` vazio é 400;
  - **sem nova versão do aviso de privacidade**: são preferências de interface da própria conta, como
    a paleta (DEC-063), e não dados de saúde; a terapeuta não vê os ajustes do paciente. A pergunta
    sobre neurodivergência e as condições de saúde entram na etapa do Perfil de saúde, com aceite
    próprio.
- **Motivo:** o "efeito rampa" e o fato de muitos adultos usarem os ajustes sem diagnóstico fechado:
  qualquer pessoa (inclusive a terapeuta) pode ligar um ajuste quando quiser, sem precisar declarar
  um diagnóstico. Subir a API antes das telas segue a DEC-056.
- **Limite conhecido:** os efeitos visuais e de formulário de cada ajuste entram no PR das telas da
  seção Acessibilidade.

## DEC-077 — Lista de contas excluídas, para a restauração não trazer ninguém de volta
- **Decisão:**
  - ao excluir a conta, o id dela entra na tabela **`DeletedAccount`**, na mesma transação. Só o id
    (um UUID aleatório) e a data: sem nome, sem e-mail e sem relação com nenhum outro dado;
  - a lista fica **35 dias**, o prazo das cópias de segurança (DEC-075). A API apaga o que passou do
    prazo ao subir e uma vez por dia (`setInterval`, sem `node-cron`: é o único job e é idempotente);
  - ao restaurar uma cópia, as contas excluídas depois dela são apagadas de novo
    (`docs/DEPLOY.md`, "Restaurar em produção"). Se o banco atual ainda abre, a lista vem dele; se
    ele sumiu, vem do log `Conta excluída`, que já registrava o `userId`;
  - o aviso de privacidade pode, então, prometer que uma conta excluída não volta com uma
    restauração.
- **Motivo:** uma cópia de segurança é uma foto do passado. Restaurar uma cópia de segunda depois de
  alguém excluir a conta na terça traria a conta de volta, com os registros de saúde, contra o que
  o aviso e a LGPD prometem. Fora das cópias de segurança, o id não identifica ninguém, e a lista
  some depois delas (35 dias contra 28 da cópia semanal mais antiga). Ainda não há cópia guardada
  de antes desta lista: as diárias só começam com o aviso novo (DEC-075).
- **Limite conhecido:** se o banco sumir inteiro, a lista depende do log do Railway, que no plano
  Hobby guarda poucos dias: uma restauração feita muito depois do desastre pode não achar todas as
  exclusões. O log só serve enquanto o `userId` não for mascarado (comentário em
  `auth.service.ts`). A restauração em produção continua não ensaiada.

## DEC-078 — Aviso de privacidade versão 7: cópias de segurança e cópia diária ligada
- **Decisão:**
  - o aviso de privacidade passa à **versão 7** (`2026-10.7`, "versão 7, de outubro de 2026"), que conta
    as cópias de segurança da DEC-075. **Como protegemos:** uma cópia por dia, criptografada antes de
    sair do servidor, que só quem cuida do Faísca consegue abrir e que só é usada num problema grave.
    **Onde ficam:** no Cloudflare R2, fora do Brasil. **Por quanto tempo:** a exclusão apaga do app na
    hora; as cópias expiram em até 5 semanas e, até lá, não são abertas; se uma cópia for usada, o que
    já tinha sido excluído é apagado de novo (DEC-077); uma foto removida da Ação segue o mesmo prazo.
    Sai o "não guardamos cópias de segurança";
  - **sem área nova:** a versão não traz dado novo, muda onde e por quanto tempo os dados ficam. Por
    isso não bloqueia nenhuma área (`PRIVACY_AREAS` não muda), mas pede o aceite de novo, como a
    DEC-075 previa. Como a faixa de antes (DEC-043) só citava áreas bloqueadas e não apareceria, quem
    está com o aviso desatualizado e sem área faltando vê no topo de Meus registros e de Meus
    pacientes a faixa **"O aviso de privacidade mudou"**, com o resumo, o link "Ver o que mudou", a
    caixa desmarcada "Li e concordo" e o botão "Aceitar". Ela some depois do aceite;
  - o **e-mail de conta excluída** e a **janela de excluir conta** contam que as cópias expiram em até
    5 semanas. Para o paciente com vínculo ativo, a janela lembra que dá para só dar um tempo:
    desfazer o vínculo em Conta e voltar quando quiser, com os registros guardados (sem vínculo, a
    frase não aparece);
  - **card de Novidades** `2026-10-copias-seguranca`, para todos, com link para o aviso;
  - a **cópia diária** entra no ar: `"cronSchedule": "0 6 * * *"` (3h em São Paulo) no
    `backup/railway.json`. Depois do merge, com o aviso no ar, a variável `BACKUP_TEST_ONLY` é apagada
    no Railway (roteiro no DEPLOY). Até isso acontecer, o cron grava só em `test/`, que expira em 1 dia;
  - o roteiro do backup no DEPLOY ganha os tropeços da primeira configuração: o serviço do banco se
    chama `faisca`, a `}` a mais no `PGHOST`, o `R2_ENDPOINT` sem bucket, a chave privada com o
    prefixo `AGE-SECRET-KEY-` e o nome com a pasta na frente no download do R2.
- **Motivo:** a DEC-075 condicionou a cópia diária a um aviso novo com novo aceite, porque dado de
  saúde passa a sair do Railway e a ficar guardado depois da exclusão. Bloquear o app inteiro por uma
  mudança sem dado novo seria desproporcional; uma faixa com aceite explícito informa e registra o
  consentimento sem atrapalhar o uso. Lembrar o desvínculo na hora de excluir evita que alguém apague
  tudo quando só queria uma pausa.
- **Limite conhecido:** quem não aceitar a versão 7 continua usando o app, e os dados dessa pessoa
  também entram nas cópias, porque a cópia é do banco inteiro. O aceite aqui registra que a pessoa foi
  informada; quem não concordar pode excluir a conta, e as cópias expiram em até 5 semanas. A faixa
  fica em Meus registros e Meus pacientes, e não em Conta nem nas páginas de formulário.

## DEC-079 — Mural de avisos da terapeuta (API)
- **Decisão:**
  - a terapeuta publica **avisos** para todos os pacientes com vínculo ativo de uma vez. É de **mão
    única**: sem comentários, sem interação entre pacientes e sem lista de quem recebe. A ideia
    inicial era um feed em que os pacientes também postassem e comentassem. Essa parte foi recusada
    (ver o motivo);
  - é a **terceira exceção da regra 1** do AGENTS.md ("terapeuta: só GET"), depois do vínculo
    (DEC-031) e do "Lido" (DEC-057). Ela grava **só o próprio aviso**, nunca dado de paciente. As
    escritas ficam num prefixo próprio, `POST`/`PATCH`/`DELETE /therapist/notices`, com a cadeia
    sessão → perfil de terapeuta, sem vínculo (o aviso não é sobre um paciente).
    `/therapist/patients/...` continua com o `onlyReads` antes de tudo. `GET /therapist/notices` lista
    os dela. Aviso de outra terapeuta → 403; que não existe → 404;
  - `TherapistNotice`: `therapistId`, `body` (1 a 2000 caracteres, CHECK na migration), `createdAt` e
    `updatedAt`; some com a conta dela. Limite de **10 publicações por hora**;
  - o paciente (`GET /notices`) vê **todos** os avisos da terapeuta com vínculo ativo, **inclusive os
    de antes do vínculo**, do mais novo para o mais antigo, com `seen` e `unseenCount`. Sem vínculo,
    lista vazia. `PUT /notices/seen` com `{ ids }` (até 100) grava o "já vi" em `NoticeSeen`. Um id de
    outra terapeuta recusa o pedido inteiro (403), como no "Lido";
  - o "já vi" é **só do paciente**: a terapeuta **não vê quem leu**. Um aviso **editado não volta a
    ser "Novo"** (só mostra que foi editado), para uma correção de digitação não virar ruído;
  - **sem notificação** nesta etapa: push e e-mail (#32) ainda não existem. Quando entrarem, o texto
    é neutro e sem a palavra "psicóloga", porque a tela bloqueada revelaria que a pessoa faz terapia;
  - o **aviso de privacidade** cita o mural no PR das telas, **sem versão nova**, como o "Lido" e a
    foto do perfil (DEC-058, DEC-069): o aviso é conteúdo da terapeuta, e não dado de saúde do
    paciente; o "já vi" fica só com ele. A v7 tinha acabado de pedir um aceite a todos;
  - logs só com ids (regra 7); `body` entrou no `SENSITIVE_KEYS`.
- **Motivo:** a terapeuta precisava avisar todos de uma vez (férias, feriados) sem mandar mensagem
  um a um. O feed entre pacientes foi recusado mesmo como opcional: estar nele já revela quem é
  paciente de quem, prints tiram o texto do app, uma postagem de crise ou um conselho errado chega a
  quem leu, e a psicóloga passaria a responder por um espaço de grupo sem enquadre nem mediação.
  Esconder quem leu evita a pressão do "ela vai ver que eu não li", pelo mesmo motivo da DEC-057.
- **Limite conhecido:** a lista do paciente traz todos os avisos, sem paginação; com centenas de
  avisos, valeria paginar. O limite por hora fica na memória da instância, como os outros.

## DEC-080 — Mural de avisos (telas)
- **Decisão:**
  - **terapeuta:** página **`/mural`**, com atalho num cartão em Meus pacientes ("Abrir o mural").
    No topo, o que os pacientes veem e o que ela não vê. Formulário "Novo aviso" com contador perto
    dos 2000 caracteres. A lista "Publicados" mostra a data, "editado em…" e os botões **Editar**
    (janela) e **Apagar** (confirmação: "Ele some para todos os seus pacientes"). Depois de salvar,
    o aviso de status e o foco vão para a lista. O limite por hora aparece como "Você publicou vários
    avisos seguidos. Tente de novo daqui a pouco.";
  - **paciente:** cartão **"Avisos de <nome>"** em Meus registros, abaixo do aviso de novo vínculo,
    **só quando há aviso**. Mostra o mais recente em até 3 linhas, com o selo "Novo", e o botão "Ver
    avisos". Página **`/avisos`** com todos, do mais novo para o mais antigo;
  - o selo é **"Novo", sem número**, para não virar cobrança. Ao abrir `/avisos`, os não vistos são
    marcados na API, mas a lista em memória não muda: o selo **continua durante a visita** e some na
    próxima vez que a lista carregar;
  - os textos usam **o nome de quem acompanha**, e não "sua psicóloga" (#101). Sem vínculo, o texto é
    neutro;
  - o aviso de privacidade cita o mural em "O que guardamos" e em "Quem vê", **sem versão nova**
    (DEC-079);
  - card de Novidades `2026-10-mural`, para todos;
  - no menu de quem tem os dois perfis, "Meus registros" fica marcado em `/avisos` e "Meus pacientes"
    no `/mural`.
- **Motivo:** a página própria não polui a lista de pacientes e dá espaço para ler e editar. O
  cartão só com aviso não ocupa a tela de quem não tem vínculo. O selo que fica durante a visita
  deixa a pessoa saber qual aviso é o novo; se sumisse ao abrir, ela não veria.
- **Limite conhecido:** sem notificação até a #32. Quem não abre o app não fica sabendo do aviso.

## DEC-081 — "Sobre mim" do paciente (API)
- **Decisão:**
  - tabela `PatientAbout`, **uma por paciente**, com três campos opcionais de texto livre:
    `aboutMe` ("Sobre mim"), `goals` ("O que eu gostaria de trabalhar") e `habits` ("Hábitos que
    quero deixar, ou já deixei"). Até **2000 caracteres** cada, no Zod e num CHECK no banco, que
    também exige ao menos um campo preenchido. **Salvar tudo vazio apaga** o registro, em vez de
    guardar uma linha vazia;
  - rotas do paciente `GET`/`PUT /about-me`, sempre da própria conta (o PUT manda os três campos, sem
    campo a mais); leitura da terapeuta em `GET /therapist/patients/:patientId/about-me`, dentro da
    cadeia de vínculo ativo, **só leitura** (regra 1 sem exceção nova);
  - entra no **"Para ler"** (DEC-057): a marca de leitura ganha `aboutId` (o CHECK de "um registro
    por marca" passa a contar quatro colunas) e o tipo `ABOUT_ME`; mudou depois de lido, volta como
    atualizado; o paciente apagar tudo apaga a marca junto. A resposta do "Para ler" ganha
    `aboutMe` e `counts.aboutMe`, nulos sem o aceite;
  - **área nova no aviso de privacidade** (`aboutMe`, versão `2026-11`), com aceite próprio, para
    paciente e terapeuta. A API **conhece** a versão; a atual continua a `2026-10.7` até o PR das
    telas trazer o texto do aviso (como na DEC-064/065);
  - os três campos entram no `redact` dos logs (regra 7): é texto de saúde;
  - as sugestões de "O que eu gostaria de trabalhar" ficam no front e **inserem texto editável**: a
    API guarda só o texto, nunca um rótulo;
  - sem IA nesta etapa: o "Fio do histórico" com IA é a etapa B (#108), depois da conversa com a
    psicóloga.
- **Motivo:** o pedido do usuário (31/10/2026): o paciente contar mais sobre si e sobre o que quer
  trabalhar, para a psicóloga ter esse contexto ao ler os registros. Sem diagnóstico nem rótulo
  clínico, por escolha do usuário.
- **Limite conhecido:** o "Sobre mim" não tem histórico de versões: a terapeuta vê só o texto atual.

## DEC-082 — "Sobre mim" (telas) e aviso de privacidade versão 8
- **Decisão:**
  - em **Conta**, só para quem é paciente, a seção **"Sobre mim"**: *"Se quiser, conte um pouco sobre
    você. Tudo é opcional, e a sua psicóloga lê o que você escrever aqui."*, com os três campos
    (contador perto de 2000 caracteres) e o botão "Salvar". Nada de barra de "perfil completo";
  - em "O que eu gostaria de trabalhar", **sugestões de tocar** (Ansiedade, Tristeza ou desânimo,
    Autoestima, Relacionamentos, Socializar, Trabalho ou estudos, Sono, Rotina e organização, Lidar
    com a raiva, Luto). Tocar insere o texto no campo, que continua editável; a sugestão já escrita
    some da lista;
  - na **página do paciente**, para a terapeuta, o cartão **"Sobre a Paula"**: só os campos
    preenchidos, "Atualizado em dd/mm" e o "Marcar como lido" dela. Sem o aceite, uma linha curta e
    o botão "Ler e aceitar", que abre o pedido numa janela (a página pode já ter o pedido grande
    numa aba). O "Sobre mim" também entra na visão **"Para ler"**, pelo dia em que mudou;
  - o **aviso de privacidade** passa à **versão 8** (`2026-11` vira a atual): cita o "Sobre mim" em
    "O que guardamos" e em "Quem vê", com os pedidos de aceite próprios para paciente e terapeuta;
  - **card de Novidades** `2026-11-sobre-mim`, **só para pacientes**: as novidades ganham o público
    `PACIENTE`, e uma novidade só de paciente não esconde da terapeuta a anterior que ela não viu.
- **Motivo:** fechar a etapa A do "Sobre mim" com a API já no ar (DEC-081, DEC-056), trocando a
  versão do aviso no mesmo PR que mostra o texto. Textos aprovados pelo usuário.
- **Limite conhecido:** os textos dizem "a sua psicóloga"; a revisão do feminino em todo o app é a #101.

## DEC-083 — Total "para ler" em Meus pacientes
- **Decisão:**
  - no topo de **Meus pacientes**, um card com o total de todos os pacientes: **"12 registros para
    ler"** e, embaixo, **"de 2 pacientes"** (no singular, "1 registro" e "1 paciente"). Só aparece
    quando há algo para ler; tudo lido, some, sem "parabéns" nem cor de alerta (DEC-058). Sem link:
    os números de cada um ficam na lista logo abaixo;
  - na lista, quem tem algo para ler **sobe**, do maior para o menor número; empates e quem não tem
    nada seguem a ordem de antes;
  - só no front: soma o `unreadCount` que a lista já traz (DEC-057), sem rota nova.
- **Motivo:** um registro importante de um ciclo passado só era visto ao abrir o paciente certo.
  Enquanto não há notificação para a terapeuta (os resumos do dia da consulta e semanal, na #82,
  dependem da #32), o total na tela inicial dela mostra que há algo pendente. Pedido do usuário.
- **Limite conhecido:** o total só conta as áreas com aceite (como o `unreadCount`), e só aparece
  quando ela abre o app.

## DEC-084 — Revisor de segurança obrigatório nos PRs sensíveis
- **Decisão:** o `revisor-seguranca` (DEC-071), no modo diff, passa a ser **exigido pelo
  CLAUDE.md** antes de abrir PR que toque em login, sessão, senha, verificação em duas etapas,
  passkey, vínculo, envio de arquivo, cabeçalhos de segurança (CSP, CORS, cookies), criptografia ou
  dependências, como já são o `revisor-regras` e o `revisor-telas`. O veredito vai no relatório
  e no PR. Achado sério se corrige antes do PR; o resto vira issue, combinado com o usuário. A
  skill `finalizar-mudanca` segue a mesma lista.
- **Motivo:** os registros são dado de saúde e identificam a pessoa, e as próximas etapas de
  segurança (#134 a #138) mexem justamente em login, sessão e criptografia. Antes, o revisor era
  só uma recomendação da skill, e podia ficar de fora. Pedido do usuário.
- **Limite conhecido:** continua sendo leitura do código, sem atacar o app em execução (o ZAP no CI
  é a #116), e depende de o agente seguir o CLAUDE.md; não há check no CI que o exija.

## DEC-085 — "Sair de todos os aparelhos" e "Trocar senha" (API)
- **Decisão:**
  - `POST /auth/logout-all`, com sessão: confere a **senha** (escolha do usuário) e sobe o
    `sessionVersion` da própria conta (DEC-025), o que derruba **todas** as sessões abertas,
    inclusive a de quem pediu; apaga o cookie e responde 204. O corpo só aceita `password`: um id
    a mais é 400, e a conta é sempre a da sessão. Senha errada é 400 `INVALID_PASSWORD` e não
    derruba nada;
  - os limites de erros de senha passam a valer para "Excluir conta", "Sair de todos" e "Trocar
    senha" **juntos** (trocar de rota não dá tentativas novas para adivinhar a senha com uma
    sessão aberta): **10 a cada 15 min por sessão** e um teto de **30 por conta**. Por sessão, e não só por conta, para
    quem roubou uma sessão não travar, errando de propósito, o "Sair de todos" da dona (achado do
    `revisor-seguranca`);
  - para isso, o JWT ganha um **id de sessão** (`sid`, aleatório), criado no login e mantido nas
    renovações diárias: um cookie roubado, com todas as renovações dele, conta como uma sessão só, e
    dois logins no mesmo segundo não dividem o contador. Tokens de antes desta decisão, sem `sid`,
    usam o `iat` original no lugar, que também segue nas renovações: ninguém sai da conta no deploy;
  - `POST /auth/change-password`, com sessão: `{ currentPassword, newPassword }`, a nova com a
    política do cadastro (8 caracteres a 72 bytes). Atual errada é 400 `INVALID_PASSWORD`; nova
    igual à atual, 400 `SAME_PASSWORD`. Grava a nova e sobe o `sessionVersion`: os **outros**
    aparelhos saem, e **este continua** (escolha do usuário), com um cookie novo da mesma sessão.
    Manda um **e-mail neutro, sem link** ("se não foi você, use Esqueci a senha"), para quem teve a
    senha trocada por outra pessoa ficar sabendo, sem um link que sirva de isca. Os links de
    "Esqueci a senha" ainda abertos deixam de valer na troca, e, se o `requireAuth` renovou o
    cookie no mesmo pedido, só o cookie novo vai na resposta (achados do `revisor-seguranca`);
  - log só com o id da conta (regra 7); `currentPassword` e `newPassword` entram na lista de
    campos ocultos do logger. Sem migration: o `sessionVersion` já existia.
- **Motivo:** fecha o limite conhecido da DEC-025 (um JWT copiado, ou outro aparelho logado,
  continuava valendo por até 30 dias depois do "Sair"). Pedir a senha impede que alguém com o
  celular desbloqueado expulse a dona da conta dos outros aparelhos sem saber a senha. API antes
  das telas (DEC-056). Antes, trocar a senha só era possível pelo "Esqueci a senha", por e-mail.
- **Limite conhecido:** não há lista de aparelhos conectados (o JWT não fica guardado no banco);
  quando a #32 (push) existir, "Sair de todos" também deve apagar as inscrições de push dos outros
  aparelhos. Um pedido do outro aparelho que já passou pelo `requireAuth` antes da troca termina
  com a sessão antiga (janela de milissegundos, própria do JWT com versão). Tokens sem `sid`
  emitidos antes do deploy seguem com um contador por renovação até vencerem (até 30 dias); o
  usuário preferiu não obrigar todos a entrar de novo.

## DEC-086 — Seção "Segurança" em Conta (telas)
- **Decisão:**
  - em **Conta**, para todos os perfis, a seção **"Segurança"**, antes de "Excluir conta". É nela
    que entram depois a verificação em duas etapas (#134) e a trava do app (#137);
  - **"Trocar senha"**: "Senha atual" e "Senha nova" (pelo menos 8 caracteres), com o aviso "Ao
    trocar, os outros aparelhos saem da conta. Este continua conectado." Senha atual errada e senha
    nova igual à atual aparecem no campo certo; deu certo, os campos se limpam e aparece "Pronto,
    senha trocada.";
  - **"Sair de todos os aparelhos"**: um texto curto e o botão, que abre uma janela pedindo a
    senha: "Todos os aparelhos, inclusive este, vão pedir o e-mail e a senha de novo. Seus
    registros continuam guardados." Depois, a tela de entrar mostra "Pronto, você saiu de todos os
    aparelhos. Entre de novo para continuar.", como o aviso de conta excluída;
  - o **"Sair" do topo** continua só para este aparelho (escolha do usuário): perguntar a cada saída
    atrapalharia o uso de todo dia.
- **Motivo:** telas da DEC-085, com a API já no ar (DEC-056). Textos aprovados pelo usuário. A
  janela de "Sair de todos" sugeria o "Esqueci a senha" para quem acha que alguém sabe a senha;
  com a "Trocar senha" na mesma seção, ela aponta para a "Trocar senha".
- **Limite conhecido:** sem lista dos aparelhos conectados (DEC-085).

## DEC-087 — Seção "Acessibilidade" em Conta e efeito dos 5 ajustes nas telas
- **Decisão:**
  - em **Conta**, abaixo de "Seu perfil" e para todos os perfis (paciente e terapeuta), a seção
    **"Acessibilidade"** (issue #87, com a API da DEC-076 já no ar): cinco caixas de seleção
    independentes, desligadas por padrão, e o botão **"Salvar acessibilidade"** (`PATCH /profile` com
    `{ accessibility }`);
  - **Leitura confortável** (`comfortableReading`) e **Menos movimento** (`reducedMotion`) têm
    **prévia na hora** em Conta (como a paleta na DEC-068) e só ficam gravados no aparelho e na conta
    ao salvar; sair de Conta sem salvar volta aos ajustes da conta. Os dois ficam em
    `data-comfortable-reading="true"` e `data-reduced-motion="true"` no `<html>` e no `localStorage`
    (`faisca:comfortable-reading` e `faisca:reduced-motion`), lidos pelo `theme-init.js` antes do
    React para o app abrir já com a fonte e sem animação;
  - efeito de cada ajuste nas telas (`useAccessibility()`):
    - **Linguagem direta (`directLanguage`):** troca expressões figuradas por textos literais e
      objetivos ("Conta como foi?" → "Avaliar atividade" / "Avaliar ação"; "Tudo bem, quer contar o
      que aconteceu?" e "Tudo bem, não deu desta vez" → "Registrar que não realizou"; "Não deu desta
      vez" → "Não realizada"; "O que passou pela sua cabeça na hora?" → "O que você pensou naquele
      momento?"; "quanto pesa cada emoção agora?" → "qual é a intensidade de cada emoção agora?";
      "Quando algo mexer com você…" → "Quando uma situação causar emoção ou pensamento forte…"). A
      regra de tom no `frontend/CLAUDE.md` e no `revisor-telas` passa a cobrir os dois modos;
    - **Uma coisa por vez (`oneThingAtATime`):** divide em passos curtos, com "Passo X de N",
      "‹ Anterior" e "Próximo ›" (validando o passo atual antes de avançar), os três formulários em
      página própria: **Pensamentos** (5 passos: dia e situação; pensamento e crença; emoções;
      comportamento e consequência; explicação alternativa e salvar), **Tensão** (3 passos: dia, hora
      e situação; tensão e vontade de vocalizar; o que fez, o que aconteceu depois e salvar) e
      **Ação** (2 passos em "Vou fazer", ou 3 em "Já fiz": modo e tipo; ação, dia e expectativa; e,
      em "Já fiz", prazer, realização e observação). As janelas curtas (`Dialog`) continuam numa tela
      só;
    - **Leitura confortável (`comfortableReading`):** aumenta a fonte base (`112.5%` no `:root`) e o
      espaçamento entre linhas (`1.75`), letras (`0.02em`) e palavras (`0.08em`);
    - **Sem pressão de tempo (`noTimePressure`):** esconde a contagem de dias para a consulta no
      cabeçalho do ciclo ("Sua consulta é daqui a N dias"), a distância em dias nas consultas ("em N
      dias" / "há N dias", para paciente e terapeuta) e o texto de prazo para adicionar explicação
      alternativa e fotos da Ação ("até…");
    - **Menos movimento (`reducedMotion`):** desliga animações e transições no CSS e nos gráficos
      (`ScoreChart` e `TensionChart`), mesmo sem `prefers-reduced-motion` ligado no aparelho;
  - o aviso de privacidade passa a citar os ajustes de acessibilidade na conta e no aparelho, **sem
    versão nova** (DEC-076).
- **Motivo:** fechar a Parte 1b da #87 com a API já no ar (DEC-076, DEC-056). Aplicar leitura
  confortável e menos movimento no `theme-init.js` evita um salto de fonte ou animação no primeiro
  quadro. Validar cada passo antes de avançar em "Uma coisa por vez" evita que a pessoa chegue ao fim
  e descubra um erro num passo que já saiu da tela.
- **Limite conhecido:** "Linguagem direta" cobre os botões, títulos de janela, dicas e estados vazios
  com linguagem figurada nas áreas principais; textos que já eram diretos continuam iguais nos dois
  modos. As condições de saúde, remédios e contatos de emergência ficam para a Parte 2 da #87.

## DEC-088 — Sessão terminada em outro aparelho: o app percebe e avisa
- **Decisão:**
  - enquanto alguém está logado, o app (`SessionWatcher`, dentro do `RequireAuth`), a cada **401 da
    API**, confirma a sessão em `GET /auth/me`. Se ela acabou mesmo, apaga da memória os dados da
    conta (consultas e envios em andamento) e leva para entrar, guardando a tela de volta
    (`?next=`), com o aviso **"Sua sessão terminou. Entre de novo para continuar."**, que recebe o
    foco (a pessoa não pediu para sair). A confirmação evita que um pedido que saiu com o cookie de
    antes de uma troca de senha neste aparelho derrube a sessão nova;
  - o app também **confere a sessão** (`GET /auth/me`) ao **voltar para a tela** (aba ou PWA de novo
    visível) e ao **trocar de tela**, no máximo uma vez a cada 15 s: a tela nova pode vir da memória,
    sem nenhuma ida à API;
  - o aviso vai no state da navegação, como os de conta excluída e de "Sair de todos"; a marca é
    apagada ao mostrar o aviso e ao entrar de novo. Uma resposta atrasada da conferência não põe de
    volta uma conta que já saiu (achados do `revisor-seguranca`).
- **Motivo:** no teste do usuário, depois de "Sair de todos" no computador, o celular continuou
  mostrando a tela e só pedia para entrar ao tentar uma ação, sem explicar por quê. O servidor já
  barrava tudo (DEC-085); faltava o aparelho perceber e limpar a tela. Pedido do usuário.
- **Limite conhecido:** com o app fechado ou parado na mesma tela, o aparelho só percebe na próxima
  ida à API, na volta para o app ou na troca de tela; aviso instantâneo dependeria de push (#32) ou
  de uma conexão aberta.

## DEC-089 — Lembretes do paciente: canal único, horário de silêncio, pausa e Web Push nativo (API)
- **Decisão:**
  - implementa a API e o agendador da etapa de lembretes do paciente (issue #32, com as decisões de
    canal único, queda automática para e-mail e horário de silêncio da #82), substituindo o desenho
    inicial de canal por tipo da DEC-004 e o pacote `node-cron` da DEC-006;
  - **`ReminderSettings`** (uma por conta, `onDelete: Cascade`): `channel` (`EMAIL | PUSH`, padrão
    `EMAIL`), `morningEnabled` (`false`, padrão `08:00`), `eveningEnabled` (`false`, padrão `20:00`),
    `quietHoursEnabled` (`true`, padrão `22:00` às `07:00`), `pausedUntil` (`DATE` opcional, de hoje
    até 365 dias à frente) e `lastFallbackAt` (`TIMESTAMP`). CHECK no banco garante todos os horários
    em múltiplos de 15 minutos, sem segundos, e `quietStart <> quietEnd`;
  - **o que dispara:** **Manhã** sai quando há **Atividade `PLANEJADA`** ou **Ação `PLANEJADA`** com
    data hoje; **Noite** sai quando há **Atividade `PLANEJADA` ou `PENDENTE`** ou **Ação `PLANEJADA`**
    com data até hoje. **Horário de silêncio:** nada sai dentro de `[quietStart, quietEnd)`; lembrete
    da madrugada (`< quietEnd`) aguarda `quietEnd` do mesmo dia, e lembrete noturno (`>= quietStart`
    em janela que atravessa a meia-noite) sai em `quietEnd` da manhã seguinte, com `referenceDate` de
    ontem;
  - **`PushSubscription`** (até 10 aparelhos por conta, `onDelete: Cascade`): guarda `endpoint`
    (único), `p256dh`, `auth` e `sessionId` (o `sid` do JWT da DEC-085). Para impedir SSRF, a API só
    aceita `https://` sem porta nem credenciais nos domínios oficiais de Web Push dos navegadores
    (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`),
    confere que `p256dh` é um ponto válido na curva P-256 e envia com `redirect: 'error'`. **Sem
    dependências novas no `package.json`:** VAPID (RFC 8292, ES256) e `aes128gcm` (RFC 8291) usam
    `node:crypto` + `fetch` do Node 24, e o agendador a cada 5 minutos usa `setInterval` com
    `unref()` (como na DEC-077);
  - **queda automática para e-mail:** quando `channel = PUSH`, envia para todas as inscrições da
    conta; respostas `404`/`410` apagam a inscrição expirada. Se não houver inscrição ou nenhuma
    entregar, o lembrete sai por **E-mail** (com aviso de que a notificação no aparelho falhou) e
    grava `lastFallbackAt`;
  - **idempotência (`NotificationLog`, DEC-006):** chave única `(userId, type, referenceDate)` criada
    antes do envio e removida só se push e e-mail falharem juntos;
  - **integração com sessão (fecha o limite da DEC-085):** `POST /auth/logout` apaga a inscrição de
    push da sessão atual; `POST /auth/change-password` apaga as inscrições das outras sessões e
    mantém a do aparelho atual; `POST /auth/logout-all` e `POST /auth/reset-password` apagam todas;
  - **rotas do paciente (`/reminders`):** `GET /reminders`, `PUT /reminders`, `POST /reminders/pause`,
    `DELETE /reminders/pause`, `POST /reminders/push-subscriptions` e
    `DELETE /reminders/push-subscriptions`, atrás de `requireAuth` + `requirePatient`. Tentar alterar
    ou remover o `endpoint` de outra pessoa retorna `403 FORBIDDEN`;
  - **regras 3 e 7:** templates fixos e neutros (`reminders.emails.ts`), com par para **Linguagem
    direta** (DEC-087), sem nunca interpolar nome de atividade, ação, nota ou observação; `endpoint`,
    `p256dh` e `auth` entram no `SENSITIVE_KEYS` do logger. `VAPID_*` opcionais quando todas estão em
    placeholder, e obrigatórias juntas quando configuradas.
- **Motivo:** a Ação passou a fazer parte da rotina planejada (DEC-051), então o lembrete precisa
  olhar Atividades e Ações. O canal único com queda para e-mail evita perder lembretes quando o
  aparelho revoga a permissão ou desinstala o PWA, sem mandar mensagens duplicadas nos dois canais.
  Usar `node:crypto` do Node 24 e `setInterval` evita trazer pacotes antigos (`web-push` e
  `node-cron`) para a árvore de produção. Subir a API antes das telas segue a DEC-056.
- **Limite conhecido:** o resumo da terapeuta e o WhatsApp ficam na #82.

## DEC-090 — Telas de lembretes em Conta, Service Worker de Web Push e card de Novidades
- **Decisão:**
  - em **Conta**, só para quem é paciente, a seção **"Lembretes"** (com atalho `#lembretes` que rola e
    leva o foco ao título):
    - **Por onde receber:** escolha de canal único (**E-mail** ou **Notificação neste aparelho**). Ao
      salvar com **Notificação neste aparelho**, o navegador pede permissão (`Notification.requestPermission`),
      inscreve o aparelho no `PushManager` com a chave VAPID pública da API e grava em
      `POST /reminders/push-subscriptions` antes do `PUT /reminders`. Se a permissão estiver negada ou o
      navegador não suportar Web Push, mostra orientação clara sem falhar em silêncio;
    - **Quando lembrar:** caixas de seleção **De manhã** (padrão `08:00`) e **À noite** (padrão
      `20:00`), cada uma com seletor de horário em intervalos de 15 minutos;
    - **Horário de silêncio:** caixa **Respeitar horário de silêncio** (padrão `22:00` às `07:00`) com
      seletores de início e fim, validando que os dois horários são diferentes;
    - **Pausar lembretes:** cartão no topo da seção com botão **"Pausar lembretes"** (abre janela para
      escolher a data, de hoje até 1 ano à frente) e, durante a pausa, **"Retomar agora"**, mantendo o
      foco no botão que substitui o anterior;
    - **aviso de queda para e-mail:** quando `lastFallbackAt` vem preenchido, um alerta explica que a
      última notificação no aparelho não pôde ser entregue e saiu por e-mail;
    - respeita **Linguagem direta** e **Sem pressão de tempo** (esconde a contagem relativa de dias da
      pausa, DEC-087);
  - no **Service Worker** (`frontend/src/sw.ts`): listener de `push` que mostra a notificação neutra
    com ícone do PWA e valida o destino interno (`safePushUrl`), e listener de `notificationclick` que
    foca a janela aberta ou abre o caminho interno;
  - no **aviso de privacidade** (`/privacidade`): cita as preferências de lembretes e o endereço
    técnico da notificação em "O que guardamos" e "Para quê", sem versão nova nem bloqueio de área
    (preferência da própria conta, sem dado de saúde, como nas DEC-061, DEC-076 e DEC-080);
  - **card de Novidades** `2026-11-lembretes`, só para pacientes (`PACIENTE`), com atalho para
    `/conta#lembretes`.
- **Motivo:** fechar a etapa #32 com a API já publicada na `main` (DEC-089, DEC-056), mantendo os
  lembretes neutros, opcionais e sem cobrança.
- **Limite conhecido:** o resumo da terapeuta, o aviso de comunicado novo no mural e o canal de
  WhatsApp ficam na #82.

## DEC-091 — Aviso de login novo por e-mail e push (API)
- **Decisão:**
  - a cada **login com a senha certa**, depois da resposta (o login não espera o envio, e uma falha
    no envio não derruba o login), o Faísca manda:
    - um **e-mail neutro e sem link**: "Alguém entrou na sua conta do Faísca em 09/11/2026, às
      21:40 (horário de Brasília), pelo Chrome no Android. Se foi você, está tudo certo... Se não
      foi você, crie uma senha nova: abra o Faísca e toque em 'Esqueci minha senha'... A senha
      nova tira da sua conta todos os aparelhos conectados." (o nome exato do botão da tela de
      entrada; o e-mail de senha trocada, da DEC-085, passa a usar o mesmo nome);
    - um **push neutro** ("Alguém entrou na sua conta...") para as inscrições de push da conta
      (DEC-089). Como a sessão nova ainda não tem inscrição, todas são de outros aparelhos;
      inscrição vencida (404/410) é apagada;
  - **em todo login**, e não só em "aparelho novo": um cookie de aparelho conhecido guardaria mais
    um dado e deixaria passar quem roubou a senha e entrou num aparelho já usado. Na prática, login
    é raro, porque a sessão dura 30 dias e se renova sozinha (DEC-025);
  - **exceção:** só o **primeiro login de todos** não gera aviso (`User.hasLoggedIn`, migration
    `20261109130000_login_alert_first_login`), para a pessoa não receber "alguém entrou" logo
    depois de criar a conta. Quem já tinha conta confirmada entra na migration como "já entrou".
    A primeira versão ignorava todos os logins da primeira hora depois de confirmar, e um acesso
    de outra pessoa nessa hora passaria sem aviso (achado do `revisor-regras` e do
    `revisor-seguranca`);
  - **limites contra abuso** (achados do `revisor-seguranca`), em memória, como os limites de
    tentativa (DEC-025):
    - **um aviso pendente por conta** na fila de tarefas depois da resposta: logins em série numa
      conta não enchem a fila (50 por tipo) nem tiram a vez do aviso de outra pessoa. Um login que
      chega enquanto o aviso anterior está pendente fica marcado e **é avisado logo depois**, com o
      navegador e a hora dele: dois acessos quase juntos geram dois avisos, e o da pessoa não
      esconde o de quem roubou a senha. A reserva vence em 2 minutos, caso a fila tenha descartado
      a tarefa;
    - **no máximo 5 e-mails por conta a cada 24 h**, somando o aviso de acesso e o de "aviso
      desligado", para logins (ou liga/desliga) em série numa conta própria não gastarem a cota do
      Resend nem atrasarem a confirmação e o "esqueci minha senha" de outras pessoas. O **push
      sai em todo login**, porque não tem cota;
    - o "primeiro login de todos" é decidido pelo banco (`updateMany` com `hasLoggedIn: false`), e
      o aviso relê a conta na hora de enviar: dois logins juntos não pulam o aviso os dois, e quem
      acabou de desligar o aviso ou excluir a conta não recebe;
  - **"Chrome no Android"** vem de uma leitura simples do `User-Agent` na hora (`lib/device.ts`,
    sem dependência nova): só o navegador e o sistema, **sem IP e sem localização**, sem guardar
    nem logar nada (regra 7). Desconhecido, a frase é omitida;
  - **sem link**, como o e-mail de senha trocada (DEC-085): um "Não fui eu" seria a isca ideal para
    golpe;
  - **ligado por padrão**, com opção de desligar: `User.loginAlertEnabled` (migration
    `20261109120000_login_alert`, padrão `true`), `PUT /auth/login-alert` com `{ enabled }`
    (`requireAuth`, só a própria conta; campo a mais é 400), e `loginAlert` no `/auth/me`.
    Desligado, nem e-mail nem push. **Desligar manda um e-mail neutro e sem link** ("O aviso de
    novos acessos da sua conta no Faísca foi desligado. Se não foi você, crie uma senha nova em
    'Esqueci minha senha', na tela de entrada."), para quem roubou uma sessão não desligar o aviso
    em silêncio (texto aprovado pelo usuário).
- **Motivo:** se a senha vazar, a pessoa hoje só descobre se perceber algo estranho no app
  (#135). Textos e escolhas aprovados pelo usuário, que pediu também o push. API antes da tela
  (DEC-056).
- **Limite conhecido:** quem tiver acesso à caixa de e-mail e à senha pode apagar o aviso. O push
  ajuda nesse caso, se houver outro aparelho com notificação. Os limites em memória zeram a cada
  deploy e valem para uma instância só. Dois logins da mesma conta ao mesmo tempo geram um aviso
  só (o do primeiro). Entre o deploy da API e o da tela, o e-mail cita "Conta → Segurança" antes
  de a caixa existir.

## DEC-092 — Verificação em duas etapas, etapa 1: código por e-mail e app autenticador (API)
- **Decisão:**
  - **opcional para todos** por enquanto, inclusive terapeutas (#134). Dois métodos nesta etapa,
    que podem ser ligados juntos: **código por e-mail** e **app autenticador** (TOTP do RFC 6238,
    HMAC-SHA1, 6 dígitos, passos de 30 s, um passo de tolerância de cada lado, feito com o
    `node:crypto`, sem dependência nova). Face ID ou digital (passkey) é a etapa 2; a trava do
    app, a #137;
  - **ativar** (`POST /auth/2fa/setup` com a senha e o método; `POST /auth/2fa/setup/confirm` com um
    código): o e-mail manda um código; o app recebe um segredo **pendente**, cifrado, até a pessoa
    provar que funciona. No **primeiro** método ligado: **10 códigos de recuperação** (8
    caracteres sem os ambíguos, uso único, mostrados uma vez), o `sessionVersion` sobe (os outros
    aparelhos saem; este ganha um cookie novo da mesma sessão, decisão do usuário) e chega um
    e-mail neutro, sem link, "foi ligada". Ligar o **segundo** método pede, além da senha, um
    código do que já está ligado (ou de recuperação), e avisa por e-mail ("um novo jeito… foi
    ligado"): só a senha não basta para alguém pôr o próprio app na conta. O segredo pendente do
    app vence em 10 min e é apagado ao ligar o e-mail, ao trocar ou redefinir a senha e em "sair de
    todos os aparelhos"; pedir de novo um jeito já ligado responde 409 antes de gastar um código;
  - **login:** com 2FA, a senha certa **não abre a sessão**. A API responde `{ twoFactor: {
    methods, preferred, emailHint } }` e grava um cookie curto (`faisca_mfa`, JWT de 10 min com a
    conta e o desafio), que o `requireAuth` recusa, e vice-versa. O código vem por
    `POST /auth/2fa/login/email` (envia) e `POST /auth/2fa/login/verify` (`via`: EMAIL, TOTP ou
    RECOVERY). Só com o código certo a sessão abre, o cookie curto é apagado e sai o aviso de login
    novo (DEC-091). `preferred` é o último método usado. A sessão sai com o `sessionVersion` lido
    antes de consumir o desafio: se a senha mudar no meio, a sessão nova cai;
  - **desafios no banco** (`TwoFactorChallenge`, `LOGIN` ou `ACTION`): um aberto por conta e tipo,
    10 min, **5 tentativas**; o código por e-mail tem 6 dígitos, vale 10 min e uma vez, no máximo
    3 envios por desafio, com 30 s entre eles, e **6 e-mails de código por conta por hora** (em
    memória), além de limites por IP e por conta nas rotas. **10 códigos errados em 15 min**, somando
    todos os logins e IPs, travam a entrada da conta por 15 min (429) e mandam um e-mail neutro
    ("alguém acertou a senha, mas errou o código"): sem isso, abrir um login novo a cada 5
    tentativas daria chutes sem fim. Cada tentativa ocupa a vaga antes de ir ao banco (pedidos
    juntos não passam do teto), e logins juntos passam um de cada vez (trava na linha da conta), com
    um desafio aberto só. A senha nova (troca ou "Esqueci minha senha") acaba com a trava. Erros: `INVALID_CODE` (400),
    `CODE_EXPIRED` (400), `TOO_MANY_REQUESTS` (429), `TWO_FACTOR_EXPIRED` (401);
  - **segredos:** `TWO_FACTOR_SECRET` (variável nova, opcional; sem ela, o 2FA responde 503
    `TWO_FACTOR_UNAVAILABLE` e o resto funciona; quem já tem 2FA fica sem entrar até a chave voltar,
    em vez de entrar sem o código) gera, por HKDF, a chave do **AES-256-GCM** do
    segredo do app e a do **HMAC** dos códigos (por e-mail e de recuperação), que têm pouca
    entropia. O AES-GCM usa o id da conta como dado associado (um segredo copiado para outra conta
    não abre) e só aceita a tag de 16 bytes. **A chave nunca deve ser trocada** (os segredos dos
    apps e os códigos deixariam de abrir) e precisa ser diferente do `JWT_SECRET` e do
    `LINK_CODE_SECRET`. O mesmo código do app não vale duas vezes (`totpLastStep`, gravado de forma
    atômica). O campo do código nas requisições é `otp`, escondido no logger junto do segredo, do
    link do QR e dos hashes (regra 7);
  - **desligar** (`POST /auth/2fa/disable`): a senha e um código de qualquer jeito ligado (o do
    e-mail vem de `POST /auth/2fa/email-code`) ou de recuperação; apaga os dois métodos, os
    códigos e os desafios, e manda um e-mail neutro "foi desligada". **Gerar códigos novos**
    (`POST /auth/2fa/recovery-codes`) pede a senha e um código, invalida os antigos e avisa por
    e-mail;
  - **senha nova** (troca ou "Esqueci minha senha") e "sair de todos os aparelhos" fecham os
    desafios de login abertos: quem estava no meio do passo do código precisa começar de novo;
  - **"Esqueci minha senha" não desliga o 2FA**;
  - **perdeu tudo:** códigos de recuperação → o outro método → recuperação com espera de 7 dias
    (próximo PR) → processo manual com o responsável, que confere a identidade por fora do app e
    roda `npm run 2fa:disable -- <e-mail>` (DEPLOY). **Perguntas de segurança foram descartadas:**
    as respostas são fáceis de descobrir, sobretudo por quem é próximo, que num app de saúde mental
    costuma ser o maior risco; viram porta dos fundos do 2FA, guardam mais dado pessoal e o NIST
    desaconselha (decisão do usuário, depois do debate).
- **Motivo:** se a senha vazar em outro site, só ela deixa de bastar para entrar (#134). Pedido do
  usuário, que quer a aplicação "super segura" e vê a segurança também como sinal de confiança. O
  código por e-mail entrou porque o app autenticador é o método em que mais gente trava. API antes
  das telas (DEC-056).
- **Limite conhecido:** o código por e-mail vale tanto quanto a segurança da caixa de e-mail. Os
  limites em memória zeram a cada deploy. O aviso de privacidade ainda não cita os dados de
  segurança guardados (o segredo cifrado e os hashes dos códigos), que não são dado de saúde: entra
  na próxima versão do aviso. A recuperação com espera fica para o PR seguinte.

## DEC-093 — Telas da verificação em duas etapas (Conta e login)
- **Decisão:**
  - **um PR só para Conta e login:** as duas telas só funcionam juntas. Com a de Conta sozinha no
    ar, quem ligasse o 2FA ficaria sem entrar, porque o login antigo não entende `{ twoFactor }`;
  - **Conta → Segurança:** um cartão com o estado ("Desligada" ou "Ligada: código por e-mail · app
    autenticador") e quantos códigos de recuperação restam, com aviso a partir de 3. Botões:
    Ativar; com um jeito ligado, Adicionar outro jeito, Códigos de recuperação e Desligar. Sem a
    chave no servidor, o cartão avisa que está indisponível e não oferece ativar;
  - **configuração guiada** numa janela, um passo por vez: senha → escolher (e-mail recomendado
    para começar, com "Precisa de ajuda?") → código → códigos de recuperação (copiar, baixar um
    `.txt` gerado no próprio aparelho, "Já guardei") → pronto. Adicionar o segundo jeito, gerar
    códigos novos e desligar pedem a senha e um código de um jeito ligado; o código por e-mail só
    sai quando a pessoa pede;
  - **QR code** desenhado no próprio aparelho pela biblioteca `qrcode` (1.5.4, versão fixa): o
    segredo não passa por nenhum outro serviço. A chave aparece também em grupos de 4, com Copiar;
  - **login:** depois da senha, "Confirme que é você" com o último jeito usado; pelo e-mail, o
    código sai sozinho uma vez. "Usar outro jeito" mostra só os jeitos ligados e o código de
    recuperação. "Não consigo entrar" explica os códigos de recuperação e dá o contato
    `suporte@minhafaisca.com.br` (escolha do usuário) para quem perdeu tudo. Passo vencido volta
    para o e-mail e a senha, com o aviso;
  - campo do código com `autocomplete="one-time-code"` e teclado numérico (letras no código de
    recuperação); com Linguagem direta, os textos do e-mail ficam literais.
- **Motivo:** textos e desenho aprovados pelo usuário (#134). O e-mail em primeiro lugar e a
  ajuda sobre o app autenticador servem para quem nunca usou 2FA, como a psicóloga.
- **Limite conhecido:** a imagem do QR é um `data:` URL, e a CSP (#33) vai precisar permitir
  `img-src data:`. Os códigos de recuperação ficam na memória da tela até a janela fechar. A caixa
  do suporte fica no Zoho Mail (plano grátis, centro de dados nos EUA; MX, SPF e DKIM na raiz do
  domínio, sem mexer nos registros do Resend); o aviso de privacidade ainda não cita esse serviço
  e entra na próxima versão.

## DEC-094 — Meus Planos, 1ª entrega: planos de ação do paciente (API)
- **Decisão (#179):**
  - **o que é:** o plano de ação que a psicóloga combina com o paciente ("Quando surgir vontade de
    ___, registrar: …"), com perguntas que mudam de plano para plano e um registro **toda vez** que a
    situação acontece. Nenhuma área existente cobria isso: a Ação planeja atividades, a Tensão tem
    campos fixos, as Tarefas (#150) têm uma resposta só;
  - **entrega dividida:** nesta, só o paciente cria e registra, e a terapeuta com vínculo ativo só
    lê. A psicóloga criar planos fica para a 2ª entrega, porque pede uma exceção nova na regra 1
    (a mesma de que a #150 precisa). Assim o paciente já usa o plano que recebeu;
  - **tabelas `Plan` e `PlanEntry`:** o plano tem nome (1 a 120) e de 1 a 10 perguntas (1 a 200
    cada), numa lista de textos; `archivedAt` marca o plano **encerrado**, que sai da lista
    principal, não recebe registro novo e pode ser reaberto. Até 30 planos por conta, contra abuso;
  - **o registro guarda uma cópia das perguntas** e as respostas na mesma ordem (até 5000 cada,
    vazia = não respondida, pelo menos uma com texto). Mudar o plano depois não muda o sentido de
    um registro antigo. Dia (até hoje) e hora opcional, como na Tensão;
  - **apagar plano só sem registros** (409 `PLAN_HAS_ENTRIES`, com a sugestão de encerrar);
  - **travas contra pedidos simultâneos** (achados do `revisor-seguranca`): criar plano trava a conta
    (`FOR NO KEY UPDATE`, como nas fotos da Ação) antes de contar o teto; registrar segura o plano
    (`FOR SHARE`) até gravar; apagar trava o plano (`FOR UPDATE`) e só então conta os registros.
    Assim, um registro que entra enquanto o plano é apagado fica, e a exclusão dá 409, em vez de o
    registro sair em cascata; e um plano encerrado no meio do caminho não recebe o registro;
  - **registro:** editar e excluir só no dia em que foi feito (409
    `PLAN_ENTRY_LOCKED`), com escrita condicional, como na Tensão (DEC-028, DEC-042);
  - **rotas do paciente** (`/plans`, `/plans/:id`, `/plans/:id/entries`, `/plan-entries/:id`) e
    **da terapeuta** (`GET /therapist/patients/:patientId/plans` e
    `.../plans/:planId/entries`), dentro do prefixo só leitura. Plano de outro paciente pelo
    caminho do vinculado é 403, pelo mesmo `findOwnedPlan` do paciente;
  - **"Para ler":** só os **registros** entram (tipo `PLAN_ENTRY` nas marcas de leitura, coluna
    `planEntryId`), com o nome atual do plano para a visão que junta as áreas. Criar ou mudar um
    plano não entra (escolha do usuário);
  - **aviso de privacidade 2026-11.2**, com a área `plans`: conhecida na API, vira a atual no PR das
    telas, junto com o texto (como na DEC-064/065);
  - **logs:** `title`, `questions`, `answers` e `planTitle` entram no `redact` (regra 7). Nada do
    plano vai para notificação (regra 3);
  - **CHECKs** com uma função imutável (`texts_length_between`, com `search_path` vazio) para
    conferir o tamanho de cada texto das listas, porque CHECK não aceita subconsulta.
- **Motivo:** a psicóloga do usuário passou um plano de ação, e ele precisa registrar no Faísca o
  quanto antes (prioridade dele em 11/11/2026). As perguntas próprias servem para qualquer tema, e
  a cópia das perguntas protege o histórico que a psicóloga já leu.
- **Limite conhecido:** os planos podem tratar de temas íntimos (a LGPD chama alguns de dados
  sensíveis); o nome do plano aparece só dentro do app. Não há teto de registros por conta nem
  página no "Para ler" (vale para todas as áreas; vira issue). O registro mostra o nome **atual**
  do plano (só as perguntas são copiadas): renomear muda o título que aparece nos registros
  antigos, sem marcá-los como atualizados. Os CHECKs dependem do EXECUTE padrão de `PUBLIC` na
  função `texts_length_between`; um `REVOKE` futuro nas funções precisa de um `GRANT` explícito ao
  `faisca_app`. A chave `title` no redact vale para o logger inteiro. A aba condicional e a grade de 3
  colunas no celular ficam para o PR das telas, com DEC própria revendo a DEC-052.

## DEC-095 — Telas do Meus Planos e grade de abas de 3 colunas
- **Decisão (#179, sobre a API da DEC-094):**
  - **aba condicional:** "Meus Planos" (o mesmo nome na psicóloga) só aparece quando existe algum
    plano, ou enquanto a pessoa está nela. Sem plano, um link discreto abaixo das abas: "Combinou um
    plano de ação com sua psicóloga? Criar um plano" ("Criar um plano de ação" com Linguagem
    direta). Na terapeuta, a aba também aparece enquanto ela não aceitou a versão 2026-11.2: sem o
    aceite, não dá para saber se o paciente tem planos, e é na aba que ela aceita;
  - **grade de abas (revê a DEC-052):** no celular, 2×2 com quatro abas e **3 colunas** com cinco ou
    seis (o sexto espaço fica para as Tarefas, #150); no computador, uma linha só. Conferido em 375
    px: as cinco cabem sem cortar nem rolar para o lado;
  - **telas do paciente:** `/planos` (lista com o último registro, Registrar, Ver registros, Editar,
    Encerrar e Apagar só sem registros; os encerrados recolhidos, com Reabrir), `/planos/novo` e
    `/planos/:id/editar` (nome e perguntas; o **modelo de 6 perguntas por botão**, com confirmação
    se já houver perguntas escritas; aviso de que as perguntas novas valem para os próximos
    registros), `/planos/:id` (registros por ciclo ou semana, com "Sem resposta" nas vazias) e o
    registro em página própria, com "Uma coisa por vez" dividindo o dia e cada pergunta em passos;
  - **psicóloga:** a aba só de leitura, com a escolha do plano (`?plano=`), as perguntas, os
    registros com o "Lido" e o número para ler; no "Para ler", o cartão traz "Plano: {nome}";
  - **o plano devolve `lastEntryDate`** para o cartão mostrar "Último registro: dd/mm";
  - **aviso de privacidade versão 9 (2026-11.2) passa a ser a atual**, só com o Meus Planos (os dados
    do 2FA e o e-mail do suporte entram numa versão própria, escolha do usuário), e a novidade
    `2026-11-meus-planos` para os dois perfis.
- **Motivo:** textos aprovados pelo usuário, que pediu a funcionalidade o quanto antes para usar o
  plano de ação que a psicóloga passou. A aba condicional deixa a tela simples para quem não usa, e a
  grade de 3 colunas comporta as próximas áreas sem esconder nenhuma.
- **Limite conhecido:** os textos ainda não passaram pela psicóloga; o que ela mudar entra depois.
  Com cinco abas, a segunda linha da grade fica com um espaço vazio até as Tarefas.

## DEC-096 — Aviso de privacidade versão 10: 2FA, suporte no Zoho e contato
- **Decisão:** a versão **2026-11.3** (versão 10) do aviso, numa só vez (API e texto no mesmo PR):
  - **"O que guardamos"** ganha a **segurança da conta** (os jeitos da verificação em duas etapas, a
    chave do app autenticador criptografada e os códigos de recuperação em hash, DEC-092) e as
    **mensagens para o suporte** (a mensagem e o e-mail, sem precisar de dado de saúde);
  - **"Onde ficam"** cita o **Zoho Mail, nos Estados Unidos**, onde fica a caixa do suporte (DEC-093);
  - o **contato** do aviso passa a ser `suporte@minhafaisca.com.br`, e não mais o e-mail pessoal do
    responsável;
  - **sem área nova:** nada fica bloqueado. O aceite fica na faixa "O aviso de privacidade mudou",
    como na 2026-10.7 (DEC-078), com o texto desta versão.
- **Motivo:** pendências registradas na DEC-092 (dados do 2FA) e na DEC-093 (o Zoho), numa versão
  própria, separada da do Meus Planos (escolha do usuário). O contato pelo domínio tira o e-mail
  pessoal de quem usa o app (sugestão aceita pelo usuário, #176).
- **Limite conhecido:** a faixa tem um texto só, o da versão mais nova sem área nova. Quem ficou
  numa versão sem área nova antiga vê o texto desta, o que basta, porque o aviso completo fica no
  link "Ver o que mudou".

## DEC-097 — Várias profissionais e áreas liberadas por vínculo (API)
- **Decisão (#170):**
  - **tipo de profissional:** `User.professionalKind` (`PSICOLOGIA` ou `PSIQUIATRIA`), obrigatório com o
    perfil de terapeuta (CHECK). Quem já era terapeuta virou psicóloga. Vem no cadastro, ao ativar o
    perfil ou no aceite do convite (`professionalKind`, sem ele psicóloga) e muda em
    `PATCH /profile` (`professional.kind`), só **sem vínculo ativo** (409 `PROFESSIONAL_KIND_LOCKED`).
    O conselho (CRP ou CRM, 1 a 30 caracteres) é opcional, só para mostrar;
  - **uma de cada tipo por paciente:** o índice "uma terapeuta ativa por paciente" virou "uma ativa
    por paciente e tipo" e "uma vez cada profissional" (índices únicos parciais, valem com dois
    aceites ao mesmo tempo). O vínculo guarda o tipo (`kind`) do momento do vínculo. A segunda do
    mesmo tipo recebe 409 `PATIENT_ALREADY_LINKED` ("Esta pessoa já tem uma psicóloga vinculada");
  - **áreas liberadas por vínculo:** `TherapistLink.sharedAreas` (enum `SharedArea`: Atividades,
    Pensamentos, Tensão, Ação, fotos da Ação, "Sobre mim", agenda e Meus Planos). **Vínculo novo começa
    sem área nenhuma** (escolha do usuário: mais seguro para dado de saúde). Os que já existiam
    ganharam todas na migration, para nada mudar para quem já usava;
  - **autorização:** o `requireActiveLink` guarda o vínculo com as áreas, e cada rota de área pede
    `requireSharedArea(...)` (403, o mesmo de sem vínculo). As fotos da Ação pedem a Ação e as fotos.
    O "Para ler", as marcas de leitura e o número de não lidos de `/links/patients` só contam as
    áreas liberadas; marcar registro de área fechada é 403. O resumo devolve `access` (tipo e áreas)
    e só traz a agenda com ela liberada;
  - **paciente:** `GET /link` devolve `links` (todos, a psicóloga primeiro) e mantém `link` (o
    primeiro) para as telas de antes. `PUT /link/:linkId/areas` muda o que cada uma vê (vale na hora).
    `POST /link/revoke` aceita `linkId`; sem ele e com um só vínculo, desfaz esse (telas de antes); com
    dois, 400 `LINK_ID_REQUIRED`. Com uma de cada tipo vinculadas, gerar código ou convite dá 409. A
    foto de cada uma em `/link/:linkId/avatar`;
  - **mural:** o paciente vê os avisos de todas as profissionais com vínculo ativo;
  - **campos que vêm de outra área** (achados do `revisor-regras` e do `revisor-seguranca`): na visão
    da profissional, sem a agenda liberada saem o prazo da explicação alternativa e o das fotos
    (`alternativeDeadline`, `photosDeadline`), que mostrariam o dia e a hora das consultas; sem as
    fotos liberadas, a lista de fotos da Ação vem vazia. Vale nas listas e no "Para ler";
  - **corridas:** criar o vínculo trava a conta da profissional antes de ler o tipo, e trocar o tipo
    trava a mesma linha antes de conferir "sem vínculo ativo". Quem liga o perfil de terapeuta (ou
    refaz o cadastro ainda não confirmado) fica com o tipo que pediu agora;
  - **regra nº 1 reescrita** no AGENTS.md, na SPEC, no backend/CLAUDE.md e na skill `nova-rota-api`.
- **Motivo:** o usuário também se trata com uma psiquiatra e quer que ela acompanhe os registros,
  escolhendo o que cada profissional vê. Consentimento por área é o mínimo para dado de saúde.
- **Limite conhecido:** até as telas do paciente (PR seguinte), um vínculo novo fica sem área e não
  há tela para liberar: vincular a psiquiatra (ou refazer o vínculo da psicóloga) só depois delas. O
  período "semana ou 30 dias" da psiquiatra e as telas dela ficam para o PR das telas da
  profissional, depois da conversa do usuário com ela. O aviso de privacidade ganha versão nova no PR
  das telas do paciente. O tipo é declarado pela própria profissional (o conselho não é conferido):
  quem libera o acesso é o código ou o convite do paciente, e a tela dele precisa mostrar quem é cada
  uma. A migration deu todas as áreas também aos vínculos já desfeitos, o que não tem efeito, porque
  um vínculo desfeito nunca é reativado (o novo nasce sem área).

## DEC-098 — Telas do paciente para várias profissionais
- **Decisão (#170, sobre a API da DEC-097):**
  - **Conta → "Quem me acompanha"** (no lugar de "Minha terapeuta"): um cartão por profissional, com
    foto, nome, "Psicóloga" ou "Psiquiatra", o conselho se ela informou, e-mail e desde quando;
  - **"O que [nome] pode ver":** uma caixa por área. As **fotos da Ação** só aparecem com a Ação
    marcada, e desmarcar a Ação leva as fotos junto (escolha do usuário). Sem nenhuma marcada: "[nome]
    ainda não vê nenhum registro seu. Marque o que quiser compartilhar." O botão "Salvar o que [nome]
    vê" grava na ordem das telas. Antes de salvar, "Vale assim que você salvar." e, com caixas
    mudadas, "Ainda não salvo."; depois, "Salvo. Já vale."; se falhar, as caixas voltam ao que está
    gravado. O formulário acompanha o que está gravado (outra aba ou aparelho não reabre uma área
    fechada). Os botões repetidos por cartão levam o tipo no nome lido pelo leitor de tela, e o cartão
    diz que "o tipo e o conselho são informados pela própria profissional" (achados dos revisores);
  - **desfazer por profissional** ("Desfazer o vínculo com [nome]"), com a confirmação dizendo que,
    num vínculo novo, ela começa sem ver nada;
  - **"Vincular outra profissional"** (código ou convite) enquanto houver vaga: uma psicóloga e uma
    psiquiatra. O código gerado fica na tela até virar vínculo;
  - **aviso de novo vínculo** com o tipo e, quando ela ainda não vê nada, "[nome] ainda não vê nada:
    escolha em Conta o que pode ver". Usa o nome, e não pronome, e lista **todas** as não vistas, porque
    "Entendi" marca todas;
  - depois de desfazer um vínculo, o foco vai para o título "Quem me acompanha";
  - **aviso de privacidade 2026-11.4 (versão 11)**, sem área nova: até duas profissionais, cada uma vendo
    só o que o paciente escolhe; quem já acompanha continua vendo o que via, e a nova começa sem ver
    nada. O aceite fica na faixa.
- **Motivo:** textos aprovados pelo usuário. Liberar por área, com a nova começando vazia, deixa o
  paciente no controle do que cada profissional vê.
- **Limite conhecido:** as telas da profissional (tipo em Conta, só as abas liberadas, o período da
  psiquiatra) ficam para o PR seguinte, depois da conversa do usuário com a psiquiatra. Até lá, a
  psiquiatra com área fechada recebe 403 nas abas que a tela atual ainda mostra.

## DEC-099 — Telas da profissional para várias profissionais
- **Decisão (#170, com as respostas da psiquiatra do usuário):**
  - **profissão no cadastro e no convite:** com "Acompanhar pacientes" marcado, o cadastro pergunta
    "Sou psicóloga" ou "Sou psiquiatra"; quem abre o convite sem ser profissional também escolhe.
    **Nada vem marcado** e a escolha é obrigatória, e o botão diz "Aceitar como psiquiatra": escolher
    errado ocuparia a vaga da outra profissional até o paciente desfazer o vínculo (achado do
    `revisor-seguranca`);
  - **Conta → "Meu perfil profissional":** a profissão e o número do conselho (opcional), que os
    pacientes veem. A profissão só muda sem vínculo ativo, e a tela explica o motivo do 409;
  - **página do paciente:** só as **abas liberadas** pelo paciente; uma aba fechada pedida na URL abre
    a primeira liberada. Sem nenhuma: "[nome] ainda não liberou nenhuma área para você. Quando liberar,
    os registros aparecem aqui." O cartão de consultas e o "Sobre mim" só com a área deles;
  - **período da psiquiatra em meses:** 1, 2 ou 3 meses até hoje, com setas para voltar no tempo,
    começando em 3 (consultas de 1 em 1 a 3 em 3 meses) e lembrando a última escolha no aparelho (só
    preferência de tela). Na psiquiatra, a lista de atividades mostra só os dias com registro. A
    psicóloga segue com o ciclo e a semana; sem a agenda liberada, a semana;
  - **"Marcar tudo"** nas caixas do paciente (ainda é preciso salvar);
  - **acessibilidade** (achados do `revisor-telas`): "Marcar tudo" e "Próximo período" ficam desligados
    em vez de sumir (o foco não se perde), as setas têm 44 px, o intervalo do período é anunciado e a
    explicação da troca de profissão fica ligada ao grupo;
  - **o resumo do paciente é buscado de novo ao abrir a página** (sem os 30 s de folga do cache): ele
    traz as áreas liberadas, que o paciente muda a qualquer momento, e o da lista "Meus pacientes" não
    serve de base (achado pelo teste de ponta a ponta do vínculo);
  - o mural já funciona para qualquer profissional.
- **Motivo:** respostas do usuário depois da consulta com a psiquiatra: ela vê tudo o que ele liberar,
  as consultas psiquiátricas são espaçadas e os dois jeitos de vincular (código e convite) servem.
- **Limite conhecido:** ampliar para 6 meses pede subir o limite de 92 dias das listas da
  profissional. Sono e humor ficam na #188; medicação, na #171.

## DEC-100 — Resumo do período em números (API)
- **Decisão (#172, desenho e textos aprovados pelo usuário):**
  - **duas rotas só de leitura:** `GET /period-summary?from&to` ("Meu resumo", do próprio paciente, pela
    sessão) e `GET /therapist/patients/:patientId/period-summary?from&to` (a profissional, com vínculo
    ativo). Até 92 dias, o mesmo limite das listas da profissional, que cobre os 3 meses da psiquiatra;
  - **só números, calculados na hora** dos registros que já existem: nada novo é guardado, e nenhum texto
    do paciente sai na resposta ("Outra" emoção entra sem o nome escrito por ele);
  - **comparação com o período anterior do mesmo tamanho**, que termina na véspera do atual (pedido do
    usuário). Por isso uma chamada de 92 dias olha até 184 dias para trás, de propósito: a profissional já
    pode pedir qualquer intervalo de 92 dias nas listas. Médias com uma casa decimal, `null` sem valores;
  - **o que entra:** dias com registro; Atividades (feitas, não realizadas, abertas e, nas feitas, as
    médias de vontade antes, prazer e realização); Pensamentos (quantos, as 3 emoções mais presentes com a
    intensidade média, a crença média, quantos têm explicação alternativa e, nas emoções reavaliadas, a
    intensidade antes e depois); Tensão (quantos, média, a maior e a vontade de vocalizar média); Ação
    (avaliadas por tipo, não realizadas, planejadas e, nas avaliadas, a expectativa ao lado do prazer e da
    realização); Meus Planos (registros e em quantos planos);
  - **cada área só com acesso:** na profissional, liberada pelo paciente (DEC-097) e coberta pelo aceite
    dela; no paciente, coberta pelo aceite dele. Área sem acesso vem como `null`, em vez de 403, como os não
    lidos (DEC-057), e os **dias com registro não a contam**, para não revelar uma área fechada;
  - **sem versão nova do aviso de privacidade:** o resumo só reorganiza o que a pessoa (ou a profissional
    com a área liberada) já vê, e nada novo é guardado nem sai do Faísca.
- **Motivo:** a psiquiatra tem consultas espaçadas e pediu, pelo usuário, tudo resumido e com comparação.
  Números do banco são exatos, de graça e não saem do app; o resumo em texto com IA (#108) vem depois e se
  apoia neles.
- **Limite conhecido:** sem pensamentos repetidos (#166) nem sono e humor (#188), que entram quando
  existirem. As telas ficam para o PR seguinte.

## DEC-101 — Telas do resumo do período
- **Decisão (#172, desenho e textos aprovados pelo usuário):** as telas da DEC-100.
  - **Na profissional:** o cartão "Resumo do período" fica **no topo da página do paciente**, acima das
    abas, e segue o período da tela: os meses na psiquiatra, o ciclo ou a semana na psicóloga. Os registros
    detalhados continuam embaixo, como antes, e nada sai. Sem nenhuma área com acesso, o cartão não aparece.
  - **No paciente:** "Meu resumo", o mesmo cartão em Meus registros, logo abaixo do período. Começa
    **fechado** ("Ver o resumo") para não empurrar as atividades do dia para baixo, e só pergunta à API
    depois de aberto.
  - **Os textos:** os aprovados, com a comparação neutra "(antes: X)", sem seta, cor ou "piorou", e a nota
    "Números calculados dos registros do período, sem interpretação." Uma área sem registro no período não
    aparece. Na Ação só com planejadas, sai "1 planejada", sem "0 avaliadas e 0 não realizadas" na frente.
  - **"Ver registros"** em cada bloco: na profissional, abre a aba da área; no paciente, a página da área no
    mesmo período (as atividades já estão na tela, sem link).
- **Motivo:** a psiquiatra achou a página detalhada demais para consultas a cada 3 meses e pediu métricas;
  o resumo vem primeiro, e quem quiser os detalhes desce ou abre a aba. O paciente vê o que elas veem.
- **Limite conhecido:** o sono, o humor e o remédio (#188) entram no cartão quando existirem, com um gráfico
  do período.

## Adiado
- **Exportação CSV/PDF:** os dados são consultados direto no app.
- **Modo demo:** quando existir, terá deploy e banco próprios, só com dados fictícios.

## Em aberto
- **CSP (Content-Security-Policy) no front:** adiada na DEC-037.
