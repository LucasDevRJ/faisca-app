# Faísca — Especificação

PWA para o Registro de Ativação (ativação comportamental da TCC).
Cadastro aberto, para vários pacientes e profissionais (psicólogas e psiquiatras).

## Contas e perfis
- Cadastro com **nome, e-mail e senha**; o e-mail precisa ser confirmado antes do primeiro uso.
  Para confirmar, a página do link pede a senha escolhida no cadastro. Se houver mais de um cadastro
  com o mesmo e-mail ainda não confirmado, cada link só confirma com a senha do próprio cadastro e
  aplica os dados dele (nome, senha e perfis); os outros links deixam de valer (DEC-072).
- O cadastro exige concordar com o **aviso de privacidade** (caixa de marcar, não marcada por padrão).
- No cadastro, a pessoa escolhe como vai usar o Faísca (um ou os dois perfis):
  - **Paciente**: registra atividades, consultas e lembretes; vincula e revoga suas profissionais.
  - **Terapeuta** (psicóloga ou psiquiatra): apenas leitura do que os pacientes com vínculo ativo
    liberaram para ela (DEC-097).
- O perfil não escolhido pode ser ativado depois, na tela Conta.
- Quem tem os dois perfis alterna entre "Meus registros" e "Meus pacientes".
  Quem tem um perfil só nunca vê telas do outro.
- Cadastro aberto, com rate limit no cadastro, no login e na recuperação de senha.
- Recuperação de senha por e-mail.
- **Sair de todos os aparelhos**, em Conta: confirmado com a senha, encerra todas as sessões da
  própria conta, inclusive a do aparelho em uso (DEC-085). Os outros aparelhos percebem na
  próxima ida à API, ao voltar para o app ou ao trocar de tela, e levam para entrar com o aviso
  "Sua sessão terminou" (DEC-088).
- **Trocar senha**, em Conta: pede a senha atual e a nova; os outros aparelhos saem da conta, este
  continua, e chega um e-mail neutro, sem link, avisando da troca (DEC-085).
- **Aviso de login novo:** a cada login com a senha certa, um e-mail neutro e sem link com a data, a
  hora e o navegador e o sistema ("Chrome no Android"), e um push nos aparelhos onde a pessoa ligou
  as notificações. Não avisa o primeiro login de todos; no máximo 5 e-mails de aviso por dia, e o
  push sai sempre. Ligado por padrão, com opção de desligar em Conta → Segurança; desligar manda
  um e-mail avisando (DEC-091).
- **Verificação em duas etapas** (opcional, em Conta → Segurança; DEC-092): código por e-mail e/ou
  app autenticador, com 10 códigos de recuperação de uso único. Ligar pede a senha e um código, e
  os outros aparelhos saem da conta. No login, depois da senha, a tela pede o código (com "Usar
  outro jeito"), e só então a sessão abre. "Esqueci minha senha" não desliga a verificação.
  Configuração guiada em Conta e contato do suporte em "Não consigo entrar" (DEC-093).
  Desligar pede a senha e um código. Quem perdeu tudo fala com o responsável (DEPLOY).
- **Perfil básico** (paciente e terapeuta, tudo opcional; DEC-061): **nome completo**, além do
  "Como podemos te chamar?", e **foto**. A foto é guardada reduzida (256×256) e sem os metadados
  da câmera, como a localização. A terapeuta vê a foto dos pacientes com vínculo ativo; o paciente
  vê a da terapeuta vinculada. Dá para trocar ou remover a foto a qualquer momento, e ela sai com a
  conta. O celular entra com as notificações (#82), confirmado por código.
- **Paleta de cores** (DEC-063, DEC-068): Sálvia (padrão), Lavanda, Oceano, Areia ou Alto contraste, salva na
  conta e combinada com o tema claro, escuro ou automático. Escolhida em **Conta → Seu perfil**, junto
  com o nome completo: ao tocar numa paleta, as cores mudam na hora, como prévia, e só ficam ao salvar.
- **Foto de perfil** (DEC-069): em Seu perfil, escolhida e recortada num círculo antes de enviar; sem
  foto, um círculo com as iniciais. Aparece no cartão do vínculo (a da terapeuta, para o paciente) e na
  lista e na página do paciente (para a terapeuta).
- **"Sobre mim"** (DEC-081), só para o paciente, em Conta: três campos opcionais de texto livre, até
  2000 caracteres cada: "Sobre mim", "O que eu gostaria de trabalhar" (com sugestões de tocar, que
  inserem texto editável) e "Hábitos que quero deixar (ou já deixei)". Salvar tudo vazio apaga. A
  terapeuta com vínculo ativo só lê, num cartão na página do paciente, e ele entra no "Para ler"
  quando muda. Pede o aceite da versão do aviso que o cita.
- **Ajustes de acessibilidade** (DEC-076, DEC-087): abertos a todos (paciente e terapeuta), desligados por
  padrão e salvos na conta, em **Conta → Acessibilidade**: **Linguagem direta** (textos literais, sem
  expressões figuradas), **Uma coisa por vez** (formulários de Pensamentos, Tensão e Ação divididos em
  passos curtos, com validação por passo), **Leitura confortável** (fonte maior e mais espaço entre
  linhas, letras e palavras, com prévia na hora), **Sem pressão de tempo** (esconde contagens
  regressivas, distâncias em dias para consultas e prazos de alternativa e fotos) e **Menos movimento**
  (desliga animações e transições, inclusive nos gráficos, com prévia na hora).

## Atividades
### Estados
| Estado | Campos exigidos | Pode editar/excluir? |
|---|---|---|
| PLANEJADA | nome, data | sim |
| PENDENTE | + vontade antes (0–10) | sim |
| CONCLUIDA | + prazer (0–10), realização (0–10), observação opcional | **não** |
| NAO_REALIZADA | observação opcional | **não** |

### Transições
- PLANEJADA → PENDENTE → CONCLUIDA
- PLANEJADA ou PENDENTE → NAO_REALIZADA
- Uma atividade pode ser criada já como PLANEJADA, PENDENTE ou CONCLUIDA (registro retroativo, sem limite de dias).
- CONCLUIDA e NAO_REALIZADA são finais: qualquer edição ou exclusão retorna **409**.

### Regras
- Pode haver várias atividades no mesmo dia.
- `activityDate` (dia da atividade) é separado de `createdAt` (quando foi registrada); a terapeuta vê os dois.
- Notas de 0 a 10 são inteiras.
- CONCLUIDA e NAO_REALIZADA só com data até hoje; PLANEJADA e PENDENTE aceitam qualquer data.
- Nome da atividade com 1 a 100 caracteres; observação com até 5000 (DEC-067).
- No mesmo dia, as atividades aparecem na ordem em que foram registradas.
- Até **5000 atividades por conta**, com trava da conta ao conferir o teto, e limite de **30 escritas por minuto** nas rotas da área (DEC-112).

### Fotos (DEC-103, #197)
- Até **10 fotos** por atividade, todas opcionais, com o mesmo tratamento das fotos da Ação: sem os
  metadados da câmera (como a localização), a grande cabendo em 2560 px e uma miniatura quadrada.
- **Quando:** com a atividade aberta (planejada ou pendente), a qualquer hora; na **concluída**, até a
  **próxima consulta** depois da conclusão (sem consulta marcada, sem prazo), como na Ação. A
  **não realizada** não recebe fotos, mas as que já tinha saem a qualquer hora. Pôr ou tirar foto não muda nenhum campo da atividade:
  a concluída continua imutável (409 ao editar ou excluir).
- O teto de **300 fotos por conta** soma as fotos da Ação e das atividades (DEC-074).
- A profissional vê as fotos só com **Atividades** e **fotos das atividades** liberadas e com o aceite
  da versão do aviso que as cita; o paciente também precisa desse aceite para usá-las.
- **Na tela (DEC-104):** no cartão da atividade, como na Ação: miniaturas, a foto grande numa janela
  ("Foto 1 de 3", Anterior e Próxima), "Adicionar fotos" (várias de uma vez, uma por vez no envio) e
  "Remover foto" com confirmação. O cartão diz o prazo da concluída, quantas cabem e que as fotos
  aparecem só para quem o paciente liberar. Na não realizada com fotos, um aviso de que ela não recebe
  fotos novas e que dá para tirar as que estão lá. A profissional vê sem botões de mudança. Sem o
  aceite, "Adicionar fotos" (ou "Ver as fotos") abre o pedido de aceite numa janela.

## Consultas
A terapia costuma ser semanal ou quinzenal: o paciente monta uma **agenda** que se repete, e as
sessões são calculadas a partir dela (DEC-045). Só o paciente mexe na agenda; a terapeuta lê.
- **Agendar**: data da primeira sessão, **hora (obrigatória)** e frequência, **semanal** ou
  **quinzenal**. O dia da semana sai da data; as sessões se repetem sem data de fim.
- A primeira agenda pode começar no passado, para as sessões que já aconteceram entrarem no
  histórico. **Mudar** dia, hora ou frequência começa uma agenda nova a partir de hoje ou depois; a
  anterior termina na véspera, e as sessões dela até ali continuam como estão. Mudar no mesmo dia
  em que a agenda foi criada é uma **correção**: a agenda do dia sai inteira, sem deixar sessões. Uma
  consulta antiga, sem hora, que cai num dia da agenda nova é absorvida por ela.
- **Desmarcar** uma sessão, com **motivo obrigatório** (até 500 caracteres): ela continua na lista,
  marcada como desmarcada. Vale também para uma sessão que já passou (registrar a falta).
- **Remarcar** uma sessão que ainda não começou para outro dia e hora que ainda não chegaram, com
  **motivo obrigatório**. Dá para **desfazer** a desmarcação ou a remarcação.
- **Pausar**: a partir de hoje ou de uma data futura, com **data de volta opcional**. Sem sessões
  durante a pausa; com data de volta, a agenda volta sozinha, e "Retomar agora" encerra a pausa a
  qualquer momento. Uma pausa por vez. Os registros continuam liberados na pausa.
- **Encerrar a terapia**: as sessões que ainda não começaram somem, inclusive as avulsas; o
  histórico fica. Dá para agendar de novo depois.
- **Consulta avulsa**: uma sessão extra, com dia e hora. As consultas de antes da agenda ficam como
  avulsas, sem hora.
- **Um horário por dia**: uma avulsa, uma remarcação ou uma agenda nova não pode cair num dia que já
  tem sessão agendada (uma desmarcada libera o dia).
- **Última consulta** = a sessão agendada mais recente que já começou (dia e hora); **próxima** = a
  primeira que ainda não começou. Desmarcadas não contam. Uma consulta sem hora conta o dia todo.
- O paciente pode baixar um arquivo de agenda (`.ics`) com as sessões dos próximos 12 meses, com o
  texto neutro "Consulta", para importar no calendário do celular.

## Ciclo da consulta
O período que cada sessão olha: o que a pessoa viveu desde a sessão anterior (DEC-049).
- O ciclo vai do **dia da sessão anterior ao dia da próxima sessão, os dois inclusive**. O dia de
  cada sessão, portanto, aparece nos dois ciclos que se encontram nela. As sessões costumam distar
  7 ou 14 dias; por causa do dia compartilhado, esses ciclos mostram 8 ou 15 datas, respectivamente.
- Sessão **desmarcada** não fecha ciclo: o período se junta ao da sessão seguinte. Sessão
  **remarcada** fecha no dia novo. Consulta **avulsa** também fecha um ciclo.
- A **primeira sessão** (sem anterior) olha os 7 dias que terminam nela (14 na quinzenal).
- **Teto de 42 dias** (depois de uma pausa longa, por exemplo): ficam os dias mais recentes, com aviso.
- No dia da consulta, o **ciclo atual vira na hora marcada**, no relógio de São Paulo. Antes dela, o
  ciclo termina na consulta de hoje; a partir do horário, começa o ciclo seguinte, no mesmo dia. Uma
  sessão sem horário só vira o ciclo no dia seguinte. Sem próxima sessão, o ciclo fica **aberto** a
  partir do dia da última sessão até hoje. Sem nenhuma sessão, não há ciclo, e as telas usam a semana.
- Na URL, `?ciclo=AAAA-MM-DD` com a data de uma sessão escolhe o ciclo que **termina** nela; as setas
  usam o dia seguinte para abrir o ciclo seguinte. Isso deixa possível navegar entre os dois ciclos
  que compartilham o dia da consulta.

## Registro de Pensamentos (RPD)
Registro da TCC, independente das atividades. O paciente alterna entre as abas **Atividades** e
**Pensamentos**, e o formulário fica numa página própria.
- Campos, **todos obrigatórios**, menos a explicação alternativa e o "como me sinto agora":
  - **dia da situação** (sem horário, até hoje), separado de quando foi registrado;
  - **situação**, **pensamento automático**, **comportamento** e **consequência**: texto de 1 a 5000 caracteres (DEC-053);
  - **o quanto acredito nesse pensamento**: inteiro de 0 a 10;
  - **emoções**: uma ou mais, cada uma com **intensidade** inteira de 0 a 10, sem repetir.
    Lista: tristeza, ansiedade, medo, raiva, culpa, vergonha, frustração, solidão, alegria, alívio e
    **outra** (com o nome escrito pelo paciente, de 1 a 50 caracteres).
  - **explicação alternativa** (opcional): outro jeito de olhar a situação, texto de 1 a 5000
    caracteres (DEC-054);
  - **como me sinto agora** (opcional, só com a explicação alternativa): nova intensidade de 0 a 10
    para **todas** as emoções do registro de uma vez.
- Editar e excluir só até o fim do dia em que o registro foi feito; depois, **409**.
- **Exceção da explicação alternativa:** depois do dia do registro, se ainda estiver vazia, ela
  pode ser adicionada **uma única vez** (com o "como me sinto agora", opcional), **até a hora
  marcada da próxima consulta** depois do registro. Consulta às 10:00 de 17/10: dá até 09:59 de
  17/10. O prazo é o da consulta marcada quando o registro foi feito: antecipar a consulta encurta
  o prazo, mas desmarcar, apagar ou remarcar para depois não o estende. Sem consulta agendada, não
  dá para adicionar depois. Depois de adicionada, fica fixa, como o resto do registro (**409**). A data em
  que ela entrou fica guardada e aparece para a terapeuta.
- Pode haver vários registros no mesmo dia, na ordem em que foram feitos.
- Até **5000 registros de pensamento por conta**, com trava da conta ao conferir o teto, e limite de **30 escritas por minuto** (DEC-112).
- Termos clínicos suaves: "Registro de Pensamentos (RPD)", "pensamento automático".
- Usar o RPD exige ter aceitado uma versão do aviso de privacidade que o cite (veja "Privacidade").

## Episódios de tensão
Registro de episódios de tensão, independente das atividades e do RPD. O paciente ganha a aba
**Tensão**, ao lado de **Atividades** e **Pensamentos**, e o formulário fica numa página própria.
- Campos, **todos obrigatórios, menos a hora**:
  - **dia** do episódio (até hoje), separado de quando foi registrado;
  - **hora** (opcional, no relógio de São Paulo): a pessoa pode não lembrar. Se o dia for hoje, a
    hora não pode ser depois de agora;
  - **situação** (o que estava acontecendo), **o que fez** e **o que aconteceu depois**: texto de 1 a
    5000 caracteres (DEC-053);
  - **tensão**: inteiro de 0 a 10 ("nenhuma" a "muito forte");
  - **vontade de vocalizar**: inteiro de 0 a 10 ("nenhuma" a "muito forte"). Cobre o tique vocal ou
    de ansiedade, a forma de expressar a ansiedade: falando, gritando ou se movimentando.
- Editar e excluir só até o fim do dia em que o registro foi feito; depois, **409**.
- Pode haver vários episódios no mesmo dia: pela hora e, no fim, os sem hora, na ordem em que foram
  registrados.
- Até **5000 episódios de tensão por conta**, com trava da conta ao conferir o teto, e limite de **30 escritas por minuto** (DEC-112).
- A tela mostra, por semana, só os dias com episódio e, no fim, um **gráfico** da tensão e da vontade
  de vocalizar ao longo da semana, com os dias de consulta marcados.
- Usar os episódios exige ter aceitado uma versão do aviso de privacidade que os cite.

## Ação
Ações que a pessoa escolhe fazer no ciclo, de três tipos, independentes das atividades (DEC-051).
- **Tipo** (obrigatório, um só): **Prazer** (algo que se gosta de fazer), **Conexão** (aproximar-se
  de alguém) ou **Realização** (algo que dá sensação de propósito ou de dever cumprido).
- **Planejar**: dia, nome (1 a 100 caracteres), tipo e **expectativa antes** (0 a 10, o quanto
  espera gostar). O dia vai de hoje até 7 dias à frente.
- **Contar como foi** (a partir do dia da ação): **prazer depois** e **realização depois** (0 a 10)
  e uma observação opcional (até 5000, DEC-067). A ação vira **avaliada**.
- **Não deu desta vez** (a partir do dia da ação): a ação fica registrada como **não realizada**,
  com observação opcional. Nem sempre dá para fazer tudo, e ver os ciclos com mais e com menos
  ações faz parte do acompanhamento.
- Dá para registrar algo **já feito**, já avaliado, com o dia nos últimos 7 dias.
- Uma ação planejada com o dia já passado continua pendente, sem prazo para contar como foi.
- **Avaliada e não realizada são finais**: editar ou excluir retorna **409**. A planejada pode ser
  editada (mudar o dia segue a janela de planejar) e excluída.
- Até **5000 ações por conta**, com trava da conta ao conferir o teto, e limite de **30 escritas por minuto** (DEC-112).
- A meta é **uma de cada tipo por ciclo da consulta** (duas de cada no ciclo de 14 dias ou mais),
  mostrada de forma neutra, sem placar.
- Usar a Ação exige ter aceitado uma versão do aviso de privacidade que a cite.
- **Fotos** (DEC-064): na ação avaliada, até 10 fotos opcionais, que aparecem para a psicóloga.
  Cada conta guarda até 300 fotos no total, somando todas as ações (DEC-074).
  Dá para adicionar e remover até a hora da próxima consulta depois da avaliação (sem consulta
  marcada, sem prazo). As fotos pedem o aceite da versão do aviso que as cita. No cartão, as fotos
  aparecem como miniaturas e abrem maiores ao tocar, com anterior e próxima (DEC-065); a terapeuta
  só vê.
- A aba **Ação** fica ao lado de Atividades, Pensamentos e Tensão (no celular, as quatro em grade
  2×2), com a explicação dos três tipos, a meta do ciclo, os dias com ação, o cartão com a
  expectativa ao lado do resultado ("Esperava 3 · Prazer 7 · Realização 6") e um gráfico de
  expectativa × prazer × realização. O formulário fica numa página própria, com um exemplo de cada
  tipo, e dá para repetir uma ação do ciclo passado. A terapeuta vê a aba **Ação**, só leitura.

## Meus Planos (DEC-094, #179)
Planos de ação combinados com a psicóloga: "Quando surgir vontade de ___, registrar: …", com
perguntas que mudam de plano para plano, respondidas **toda vez** que a situação acontece.
O paciente pode criar e administrar seus planos. A **psicóloga** também pode criar um plano para o
paciente quando o vínculo está ativo, o paciente liberou Meus Planos para ela e ambos aceitaram a
versão do aviso que cita a área. O plano pertence ao paciente: só ele pode editar, encerrar, reabrir,
apagar ou criar registros. A psiquiatra continua com acesso de leitura (DEC-102).
- **Plano:** nome de 1 a 120 caracteres (o gatilho) e de 1 a 10 perguntas, de 1 a 200 caracteres
  cada. O app oferece um modelo com 6 perguntas (antes, sentimento, o que procurava, o que imaginou
  que receberia, o que fez, como se sentiu depois). Até 30 planos por conta.
- O paciente muda o nome e as perguntas quando quiser, **encerra** (sai da lista principal e não
  recebe registro novo) e **reabre**. Apagar só um plano **sem registros**; com registros, **409**,
  e o caminho é encerrar.
- **Registro:** dia (até hoje) e hora opcional do momento, separados de quando foi registrado, e uma
  resposta por pergunta, até 5000 caracteres cada; as respostas são opcionais, mas pelo menos uma
  tem texto. O registro guarda **uma cópia das perguntas** como estavam: mudar o plano depois não
  muda o sentido de um registro antigo.
- Editar e excluir o registro só no dia em que foi feito; depois, **409**, como na Tensão.
- Até **5000 registros em planos por conta** (somando todos os planos), com trava da conta ao conferir o teto, e limite de **30 escritas por minuto** (DEC-112).
- Na terapeuta: os planos (ativos e encerrados) e os registros, só leitura, exceto criar plano para
  a psicóloga nas condições acima. Nem a psicóloga nem a psiquiatra alteram planos existentes ou
  criam registros. Os **registros** entram no "Para ler" e têm o "Lido" (DEC-057); o plano em si, não.
- Nome, perguntas e respostas nunca aparecem em notificação nem em log.
- Usar o Meus Planos exige ter aceitado uma versão do aviso de privacidade que o cite (2026-11.2).
- **Telas (DEC-095, DEC-102):** no paciente, a aba **Meus Planos** só aparece quando existe algum
  plano; sem plano, um link discreto "Criar um plano" abaixo das abas. Na página da terapeuta, a aba
  também aparece enquanto falta o aceite para ela aceitar, e para a psicóloga com Meus Planos
  liberado, mesmo sem planos, para poder criar o primeiro. A psiquiatra continua vendo a aba só quando
  existe plano. No celular, com 5 ou 6 abas, a grade passa a 3 colunas. O modelo das 6 perguntas entra
  por um botão, e não já preenchido.

## Tarefas (DEC-106, #150)
**Paciente cria e responde; a profissional vinculada só lê quando a área estiver liberada e aceita.**
- Tarefa única combinada na consulta, separada dos planos que têm registros recorrentes.
- Só o paciente cria: descrição obrigatória (1–5000 caracteres), título opcional (1–120) e
  "Combinada com" opcional, escolhida dentre os vínculos ativos. Essa escolha não libera a área.
- Até 500 tarefas por conta, com trava da conta ao conferir o teto. Antes de responder, pode editar
  ou apagar. Depois de responder, a descrição fica preservada e a tarefa não pode ser apagada (409).
- Uma resposta: texto livre (1–10000 caracteres), "Não consegui fazer" ou "Não faz sentido para mim
  agora". Nas duas últimas opções, comentário opcional (até 10000). Todas são respostas válidas.
- O prazo de edição é a primeira consulta posterior à **primeira resposta**, segundo a agenda do
  paciente. A resposta pode ser iniciada mesmo depois de uma consulta. Sem consulta marcada,
  continua editável. Ao aparecer consulta, o prazo é congelado; antecipar encurta, apagar ou
  desmarcar não reabre um prazo congelado. Sem horário, a consulta fecha a edição no início do dia,
  como na explicação alternativa (DEC-054). Exatamente no prazo, a resposta fica final (409).
- Aba **Tarefas** sempre disponível ao paciente. Cinco ou seis abas usam grade de três colunas no
  celular; Meus Planos continua condicional. As tarefas são listadas de qualquer data, mais novas
  primeiro; na profissional, essa lista não depende do período selecionado para as outras áreas.
- A profissional só lê com vínculo ativo, área **TASKS** liberada pelo paciente e aceite do aviso
  que cobre Tarefas. A área nova começa fechada, inclusive nos vínculos existentes. Nada muda na
  regra de escrita da profissional. "Combinada com" é omitido na visão profissional; o prazo da
  resposta também é omitido quando a agenda não está compartilhada.
- Só tarefas respondidas entram no **Para ler** (tipo TASK, coluna taskId em ReadMark). Alterar a
  resposta depois da leitura volta a contar como atualizado. A leitura pela profissional nunca
  congela prazo nem grava no registro do paciente.
- Rotas do paciente: GET/POST `/tasks`, PATCH/DELETE `/tasks/:id`, PUT `/tasks/:id/response`.
  Profissional: GET `/therapist/patients/:patientId/tasks` na cadeia existente de autorização.
- Aviso **2026-11.6** com área `tasks`, texto e aceite para paciente e profissional.
  Não bloqueia áreas cujo aviso já foi aceito. Textos e status de resposta fora dos logs; sem
  notificação nesta entrega. Fotos e ligação a outras áreas continuam na #151.

## Sono, humor e remédio (DEC-107, #188 e #171)
- Um registro por dia, todo opcional: a hora em que deitou e a hora em que acordou (as horas de sono
  são calculadas), a nota do sono e a do humor (0 a 10), uma palavra para o dia e, para quem liga a
  opção em Conta, "Tomou o remédio como combinado?" (Sim, Esqueci algum ou Hoje não). A noite pertence
  ao dia em que a pessoa acordou.
- O paciente registra e edita os últimos 7 dias. Sem cobrança, sem sequência e sem lembrete diário.
- O Faísca não guarda nome, dose nem efeito de remédio.
- Duas áreas no vínculo, "Sono e humor" e "Remédio", fechadas para todas as profissionais até o
  paciente liberar. A profissional só lê, sem "Lido". As duas entram no resumo do período, sem a
  palavra do dia.

## Resumo do período (DEC-100, #172)
- Números do período aberto na tela, para o paciente ("Meu resumo") e para a profissional, comparados
  com o **período anterior do mesmo tamanho**: dias com registro, atividades, pensamentos (as emoções mais
  presentes, a crença e o efeito da explicação alternativa), tensão, Ação e Meus Planos.
- Só números calculados na hora, sem interpretação, sem texto do paciente e sem guardar nada novo.
- Cada área só aparece com acesso: na profissional, liberada pelo paciente e com o aceite dela; no
  paciente, com o aceite dele. Uma área fechada não entra nem na contagem de dias. Período de até 92 dias.
- **Telas (DEC-101):** na profissional, o cartão "Resumo do período" fica no topo da página do paciente,
  acima das abas, e segue o período da tela; os registros detalhados continuam embaixo. No paciente, "Meu
  resumo" fica em Meus registros, fechado por padrão. Cada bloco tem "Ver registros", que abre a área.

## Tela de registros: ciclo ou semana (paciente e terapeuta)
- A tela abre no **ciclo da consulta** atual, com o título "Consulta de dd/mm", o período, quantos
  dias faltam para a consulta e um resumo neutro (dias, atividades feitas, pensamentos e episódios
  registrados). Sem nenhuma sessão na agenda, abre na semana (DEC-050).
- Dá para alternar entre **Ciclo** e **Semana** e navegar entre ciclos ou semanas; o período fica na
  URL e vale para todas as abas.
- A semana vai de segunda a domingo.
- Mostra a lista de atividades e um gráfico comparando vontade × prazer × realização.
- As notas usam uma única cor que varia de intensidade (sem vermelho/verde).

## Visão da terapeuta
- Lista de pacientes com vínculo ativo. Os dados do paciente (nome etc.) vêm da conta dele, nada é digitado pela terapeuta.
- Por paciente, **só as áreas que ele liberou para ela** (DEC-097, DEC-099); sem nenhuma, a página
  explica que ele ainda não liberou nada:
  - linha do tempo com notas e observações;
  - abas **Atividades | Pensamentos | Tensão | Ação | Meus Planos**, só as liberadas;
  - **Pensamentos**: o Registro de Pensamentos, só leitura, com todos os campos e as duas datas;
  - **Consultas**: a agenda, só leitura, com as sessões desmarcadas e remarcadas e os motivos, e a
    pausa; na lista de pacientes, um selo quando a agenda está em pausa ou foi encerrada;
  - **Tensão**: os Episódios de tensão, só leitura, com todos os campos, as duas datas e um gráfico
    da tensão e da vontade de vocalizar no período, com os dias de consulta marcados;
  - gráficos;
- **Período**: a psicóloga abre no **ciclo da consulta** (seção "Ciclo da consulta"), o mesmo que o paciente vê, em todas as abas; dá para alternar para a semana e navegar entre ciclos ou semanas. O ciclo substitui o antigo destaque e o filtro "desde a última consulta" (DEC-050). Sem a agenda liberada, a semana. A **psiquiatra** vê por **meses** (1, 2 ou 3 até hoje, começando em 3), com setas para voltar no tempo (DEC-099).
- **Lido** (DEC-057): a terapeuta marca cada Pensamento, Episódio de tensão, Ação, o "Sobre mim" (DEC-081), registro do Meus Planos (DEC-094) ou resposta de Tarefa (DEC-106) como **lido**
  (e desfaz), ou **todos da lista aberta** de uma vez. Nunca marca sozinho ao abrir. Um registro
  que muda depois de lido (edição no dia, explicação alternativa adicionada, ação avaliada, resposta de tarefa editada) volta
  a contar, como **atualizado**. A visão **Para ler** junta as áreas liberadas fora do ciclo, do mais
  antigo ao mais novo, paginada na API em blocos de **50 registros por vez** com cursor (`nextCursor`),
  mantendo os contadores (`counts`) sempre com o total geral de cada área (DEC-112); a lista de pacientes mostra quantos faltam ler de cada um, com quem tem
  algo para ler no topo, e o total de todos ("12 registros para ler, de 2 pacientes"). As marcas são da
  terapeuta: o paciente não as vê, e uma terapeuta nova começa sem nenhuma. Nas telas, o texto
  fala em **"para ler"** (DEC-058).
- O perfil de terapeuta não recebe notificações.

## Vínculo paciente ↔ terapeuta
Um paciente tem no máximo **uma profissional ativa de cada tipo**: uma psicóloga e uma psiquiatra
(DEC-097); uma profissional pode ter N pacientes. Todo perfil de terapeuta tem um **tipo**
(psicologia ou psiquiatria), escolhido no cadastro ou ao aceitar o convite (nas telas, a escolha é obrigatória e nada vem marcado,
DEC-099; a API, sem o campo, usa psicóloga),
e pode informar o número do conselho (CRP ou CRM), só para mostrar. O tipo só muda sem vínculo ativo.
Ninguém se vincula a si mesmo. Existem duas formas de criar o vínculo:

### 1. Convite por e-mail (iniciado pelo paciente)
- O paciente informa o e-mail da terapeuta e o sistema envia um link.
- O link não expira, vale uma única vez e pode ser cancelado enquanto estiver pendente.
- Ao abrir o link:
  - quem não tem conta faz o cadastro com o perfil de terapeuta já marcado;
  - quem já tem conta faz login e ativa o perfil de terapeuta, se ainda não tiver.
- O vínculo é criado na hora, sem digitar código.

### 2. Código de vínculo (terapeuta digita)
- O paciente gera um código de 8 caracteres (ex.: `K7M4-P9QX`), sem letras ou números ambíguos.
- O código:
  - vale **24 horas** e uma única vez;
  - é invalidado quando o paciente gera um novo.
- A terapeuta digita o código em um campo da área "Meus pacientes" e o vínculo é criado.
- Limite de tentativas: 5 erros em 15 minutos bloqueiam temporariamente a terapeuta.

### O que cada profissional vê (DEC-097)
- Cada vínculo tem as **áreas liberadas** pelo paciente: Atividades, fotos das atividades (DEC-103),
  Pensamentos, Tensão, Ação, fotos da Ação, "Sobre mim", agenda (com os motivos) e Meus Planos. Os
  vínculos que já existiam começam sem as fotos das atividades.
- **Vínculo novo começa sem área nenhuma**: o paciente escolhe o que cada uma vê. Os vínculos que já
  existiam antes da DEC-097 ficaram com todas as áreas.
- Mudar vale na hora. Área não liberada some para aquela profissional: as rotas respondem 403, e o
  "Para ler" e o número de não lidos não a contam. O resumo do paciente (nome, e-mail, foto) aparece
  sempre; a última e a próxima consulta, só com a agenda liberada.
- Cada profissional tem as próprias marcas de leitura e o próprio mural; o paciente vê os avisos das
  duas.

### Regras comuns
- Com uma psicóloga e uma psiquiatra vinculadas, ou com um convite pendente, o paciente não gera
  outro convite nem outro código. Com só uma delas, dá para chamar a outra.
- Desfazer é por vínculo: desfazer um não mexe no outro.
- Na tela (DEC-098): em Conta, "Quem me acompanha", com um cartão por profissional, as caixas de
  "O que [nome] pode ver" (as fotos da Ação só com a Ação marcada, e as das atividades só com
  Atividades marcada, DEC-104) e "Marcar tudo".
- Na profissional (DEC-099): a profissão vem do cadastro ou do convite e fica em Conta, com o
  conselho; a página do paciente mostra só as abas liberadas; a psiquiatra vê por meses (1, 2 ou 3).
- Quando um vínculo é criado, o paciente é avisado no app e por e-mail e vê o **nome e o e-mail** de quem se vinculou.
- O paciente revoga a qualquer momento e o acesso cai na hora. O registro do vínculo é mantido (`revokedAt`).
  Os registros do paciente não são apagados: continuam na conta dele. Num vínculo novo, a terapeuta volta
  a ver tudo, inclusive o que foi registrado sem vínculo. A confirmação de desfazer conta isso.

## Mural de avisos (DEC-079)
- A terapeuta escreve **avisos** para todos os pacientes com vínculo ativo de uma vez (férias,
  feriado, horários). É de **mão única**: os pacientes não comentam, não se veem entre si e não
  sabem quem mais recebe.
- Só texto, de 1 a 2000 caracteres, sem fotos. A terapeuta cria, edita e apaga os próprios avisos,
  com um limite de publicações por hora.
- O paciente vê **todos** os avisos de cada profissional com vínculo ativo, inclusive os de antes do
  vínculo, do mais novo para o mais antigo. O selo **"Novo"** fica até ele abrir; esse "já vi" é só
  dele. Um aviso editado não volta a ser novo. Ao desfazer o vínculo, deixa de ver na hora.
- A terapeuta **não vê quem leu**.
- **Telas** (DEC-080): a terapeuta escreve, edita e apaga em **Mural** (`/mural`), com atalho em Meus
  pacientes. O paciente vê o aviso mais recente num cartão em Meus registros, que só aparece
  quando há aviso, e todos em **Avisos** (`/avisos`). O selo "Novo" continua durante a visita e
  some na próxima.
- Sem notificação por enquanto: o push e o e-mail de lembrete (#32) ainda não existem. Quando
  entrarem, o aviso novo gera um texto neutro ("Você tem um aviso novo no Faísca"), com
  liga/desliga.

## Autorização (regra inviolável)
- No papel de terapeuta (psicóloga ou psiquiatra): somente requisições GET, apenas de pacientes com
  vínculo ativo e só das áreas que o paciente liberou para ela (DEC-097).
  As exceções não alteram dado de paciente: os dois pedidos que criam o vínculo (digitar o código e
  aceitar o convite, DEC-031), as marcas de leitura da própria terapeuta (DEC-057) e os avisos do
  mural dela, que são conteúdo dela (DEC-079).
- No papel de paciente: acesso somente aos próprios dados.
- Qualquer outro caso retorna **403**: outro método, paciente sem vínculo, vínculo revogado, área não liberada ou dado de outra pessoa.
- Tudo isso é garantido no backend, nunca só na interface.

## Lembretes (somente perfil paciente)
- O paciente escolhe **um canal único** na conta (DEC-089): **E-mail** (padrão) ou **Notificação no aparelho** (Web Push). Se o envio por notificação falhar ou não houver mais aparelho inscrito, o lembrete **cai automaticamente para o e-mail** e grava `lastFallbackAt` para avisar no app.
- Existem dois tipos de lembrete, desligados por padrão, cada um com liga/desliga e horário próprio:
  - **Manhã** (padrão `08:00`): enviado se houver **Atividade `PLANEJADA`** ou **Ação `PLANEJADA`** para hoje.
  - **Noite** (padrão `20:00`): enviado se houver **Atividade `PLANEJADA` ou `PENDENTE`** ou **Ação `PLANEJADA`** com data até hoje.
- **Horário de silêncio** (ligado por padrão, das `22:00` às `07:00`, ajustável): nenhum lembrete sai dentro desse intervalo; o que cairia nele aguarda e sai no fim do silêncio.
- **Pausar lembretes:** o paciente pode pausar os lembretes até uma data escolhida (de hoje até 1 ano à frente) ou retomar a qualquer momento; passada a data, os lembretes voltam sozinhos.
- No máximo um envio por tipo por dia de referência (2 no total), garantido por `NotificationLog`.
- Horários em intervalos de 15 minutos, no fuso America/Sao_Paulo.
- O texto é sempre neutro (regra 3): nunca inclui nome de atividade, nome de ação, notas ou observações, e respeita o ajuste **Linguagem direta** (DEC-087).
- Sair de um aparelho remove a inscrição de push daquela sessão; trocar a senha remove as dos outros aparelhos e mantém a do aparelho atual; "Sair de todos os aparelhos" remove todas (DEC-085, DEC-089).

## Privacidade (LGPD)
- Tarefas exigem a versão `2026-11.6` (DEC-106), apresentada junto com o texto novo no app.
- O sistema coleta nome, e-mail e senha (guardada só como hash), os registros e o que o aviso de privacidade descreve (preferências da conta, dados de segurança como os da verificação em duas etapas, vínculos e lembretes); nada além disso.
- Um **aviso de privacidade** público (`/privacidade`) diz quem é o responsável, o que é coletado e para quê, quem vê, onde os dados ficam, por quanto tempo, os direitos da pessoa e o contato. Ele tem link no cadastro, na tela de entrar, no rodapé do app e em Conta.
- Como os registros são dados de saúde (dado sensível na LGPD), o cadastro pede consentimento específico e destacado. A API grava a data e a versão do aviso aceito.
- Quando o aviso muda para cobrir dados novos, quem aceitou a versão anterior aceita de novo antes de usar a parte nova. Cada área exige a versão que passou a citá-la: o RPD, a partir da `2026-10.2`; os Episódios de tensão, a partir da `2026-10.3`; a agenda (hora, motivos e pausas), a partir da `2026-10.4`; a Ação, a partir da `2026-10.5`; as fotos da Ação, a partir da `2026-10.6`; as fotos das atividades, a partir da `2026-11.5` (DEC-103). Sem ela, só aquela área fica bloqueada (para paciente e terapeuta), e o resto do app funciona. Uma versão nova não bloqueia de novo uma área já liberada, e um aceite só libera todas. O "Sobre mim" exige a `2026-11`, e o Meus Planos, a `2026-11.2`. Uma versão sem área nova (a `2026-10.7`, das cópias de segurança; a `2026-11.3`, com os dados do 2FA, as mensagens ao suporte e o contato; e a `2026-11.4`, com as várias profissionais e as áreas liberadas) pede o aceite numa faixa no topo de Meus registros e de Meus pacientes, sem bloquear nada (DEC-078, DEC-096, DEC-098).
- O aceite e o cadastro gravam a **versão do aviso que o app mostrou**: outra versão é recusada (409,
  com o pedido de atualizar o app), e um app antigo, que não manda a versão, grava a anterior, sem
  liberar a área nova (DEC-105).
- O contato do aviso é `suporte@minhafaisca.com.br` (DEC-096).
- Nenhum documento pessoal é solicitado.
- **Cópia de segurança** diária do banco, criptografada antes de sair do Railway e guardada no Cloudflare R2: 7 cópias diárias e 4 semanais, que expiram em até 5 semanas. Só é aberta para recuperar dados depois de um problema grave (DEC-075, DEC-078).
- A pessoa pode excluir a própria conta, o que apaga todos os seus dados e vínculos do app na hora. Nas cópias de segurança, eles expiram em até 5 semanas; se uma cópia for restaurada, as contas excluídas depois dela são apagadas de novo (DEC-077). A exclusão é confirmada com a senha, derruba todas as sessões abertas e gera um e-mail neutro avisando que a conta foi excluída e o prazo das cópias. A janela de excluir lembra ao paciente com vínculo ativo que, para só dar um tempo, basta desfazer o vínculo.
- Nenhum dado real em seeds, fixtures ou testes.

## Tom e interface
- Interface calma e acolhedora, sem aparência clínica, com modo claro e escuro. Exceção: o RPD usa termos clínicos suaves (DEC-039).
- Textos acolhedores ("Conta como foi?") por padrão, ou literais e objetivos com **Linguagem direta** ligada ("Avaliar atividade", DEC-087); nos dois modos, sem gamificação nem mensagens que gerem culpa.
- PWA instalável; usar o app exige conexão.
- **Card de Novidades:** uma melhoria do app é avisada uma vez, no topo das telas, até a pessoa
  tocar em "Entendi". O "já vi" fica na conta (vale em todos os aparelhos), e quem se cadastra
  depois não recebe como novidade o que já existia (DEC-054, DEC-055).
- **O que há de novo:** uma página reúne todas as novidades da pessoa, da mais nova para a mais
  antiga, com a data, inclusive as já vistas; abrir a página não fecha o card (DEC-060).

## Fora do escopo (por ora)
- Exportação CSV/PDF
- Modo demo
- Uso offline com sincronização
- Mais de uma profissional do mesmo tipo por paciente (hoje, uma psicóloga e uma psiquiatra)
- Verificação de CRP ou CRM (o número do conselho é só informado pela profissional)
