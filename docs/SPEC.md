# Faísca — Especificação

PWA para o Registro de Ativação (ativação comportamental da TCC).
Uso privado no início, com arquitetura pronta para vários pacientes e terapeutas.

## Contas e perfis
- Cadastro com **nome, e-mail e senha**; o e-mail precisa ser confirmado antes do primeiro uso.
  Para confirmar, a página do link pede a senha escolhida no cadastro. Se houver mais de um cadastro
  com o mesmo e-mail ainda não confirmado, cada link só confirma com a senha do próprio cadastro e
  aplica os dados dele (nome, senha e perfis); os outros links deixam de valer (DEC-072).
- O cadastro exige concordar com o **aviso de privacidade** (caixa de marcar, não marcada por padrão).
- No cadastro, a pessoa escolhe como vai usar o Faísca (um ou os dois perfis):
  - **Paciente**: registra atividades, consultas e lembretes; vincula e revoga sua terapeuta.
  - **Terapeuta**: apenas leitura dos dados dos pacientes com vínculo ativo.
- O perfil não escolhido pode ser ativado depois, na tela Conta.
- Quem tem os dois perfis alterna entre "Meus registros" e "Meus pacientes".
  Quem tem um perfil só nunca vê telas do outro.
- Cadastro aberto, com rate limit no cadastro, no login e na recuperação de senha.
- Recuperação de senha por e-mail.
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
- **Ajustes de acessibilidade** (DEC-076): abertos a todos (paciente e terapeuta), desligados por padrão
  e salvos na conta, em **Conta → Acessibilidade**: **Linguagem direta** (textos literais), **Uma coisa
  por vez** (formulários em passos curtos), **Leitura confortável** (fonte maior e mais espaço entre
  linhas e letras), **Sem pressão de tempo** (esconde contagens regressivas e prazos) e **Menos
  movimento** (desliga animações e transições).

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
- O ciclo de uma sessão vai do **dia seguinte à sessão agendada anterior até o dia da sessão,
  inclusive**. Na agenda semanal, 7 dias; na quinzenal, 14.
- Sessão **desmarcada** não fecha ciclo: o período se junta ao da sessão seguinte. Sessão
  **remarcada** fecha no dia novo. Consulta **avulsa** também fecha um ciclo.
- A **primeira sessão** (sem anterior) olha os 7 dias que terminam nela (14 na quinzenal).
- **Teto de 42 dias** (depois de uma pausa longa, por exemplo): ficam os dias mais recentes, com aviso.
- O **ciclo atual** é o que contém hoje; no dia da consulta, o ciclo ainda é o dela, mesmo depois da
  sessão. Sem próxima sessão, o ciclo fica **aberto**: do dia seguinte à última sessão até hoje. Sem
  nenhuma sessão, não há ciclo, e as telas usam a semana.

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

## Tela de registros: ciclo ou semana (paciente e terapeuta)
- A tela abre no **ciclo da consulta** atual, com o título "Consulta de dd/mm", o período, quantos
  dias faltam para a consulta e um resumo neutro (dias, atividades feitas, pensamentos e episódios
  registrados). Sem nenhuma sessão na agenda, abre na semana (DEC-050).
- Dá para alternar entre **Ciclo** e **Semana** e navegar entre ciclos ou semanas; o período fica na
  URL e vale para as três abas.
- A semana vai de segunda a domingo.
- Mostra a lista de atividades e um gráfico comparando vontade × prazer × realização.
- As notas usam uma única cor que varia de intensidade (sem vermelho/verde).

## Visão da terapeuta
- Lista de pacientes com vínculo ativo. Os dados do paciente (nome etc.) vêm da conta dele, nada é digitado pela terapeuta.
- Por paciente:
  - linha do tempo com notas e observações (nada é privado);
  - abas **Atividades | Pensamentos | Tensão**;
  - **Pensamentos**: o Registro de Pensamentos, só leitura, com todos os campos e as duas datas;
  - **Consultas**: a agenda, só leitura, com as sessões desmarcadas e remarcadas e os motivos, e a
    pausa; na lista de pacientes, um selo quando a agenda está em pausa ou foi encerrada;
  - **Tensão**: os Episódios de tensão, só leitura, com todos os campos, as duas datas e um gráfico
    da tensão e da vontade de vocalizar no período, com os dias de consulta marcados;
  - gráficos;
- **Período**: a tela abre no **ciclo da consulta** (seção "Ciclo da consulta"), o mesmo que o paciente vê, nas três abas; dá para alternar para a semana e navegar entre ciclos ou semanas. O ciclo substitui o antigo destaque e o filtro "desde a última consulta" (DEC-050).
- **Lido** (DEC-057): a terapeuta marca cada Pensamento, Episódio de tensão ou Ação como **lido**
  (e desfaz), ou **todos da lista aberta** de uma vez. Nunca marca sozinho ao abrir. Um registro
  que muda depois de lido (edição no dia, explicação alternativa adicionada, ação avaliada) volta
  a contar, como **atualizado**. A visão **Para ler** junta as três áreas fora do ciclo, do mais
  antigo ao mais novo, e a lista de pacientes mostra quantos faltam ler. As marcas são da
  terapeuta: o paciente não as vê, e uma terapeuta nova começa sem nenhuma. Nas telas, o texto
  fala em **"para ler"** (DEC-058).
- O perfil de terapeuta não recebe notificações.

## Vínculo paciente ↔ terapeuta
Um paciente tem no máximo **uma** terapeuta ativa; uma terapeuta pode ter N pacientes.
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

### Regras comuns
- Com um vínculo ativo ou convite pendente, o paciente não gera outro convite nem outro código.
- Quando um vínculo é criado, o paciente é avisado no app e por e-mail e vê o **nome e o e-mail** de quem se vinculou.
- O paciente revoga a qualquer momento e o acesso cai na hora. O registro do vínculo é mantido (`revokedAt`).
  Os registros do paciente não são apagados: continuam na conta dele. Num vínculo novo, a terapeuta volta
  a ver tudo, inclusive o que foi registrado sem vínculo. A confirmação de desfazer conta isso.

## Autorização (regra inviolável)
- No papel de terapeuta: somente requisições GET, e apenas de pacientes com vínculo ativo.
  A exceção são os dois pedidos que criam o vínculo (digitar o código e aceitar o convite),
  que não leem nem alteram dado de paciente (DEC-031).
- No papel de paciente: acesso somente aos próprios dados.
- Qualquer outro caso retorna **403**: outro método, paciente sem vínculo, vínculo revogado ou dado de outra pessoa.
- Tudo isso é garantido no backend, nunca só na interface.

## Lembretes (somente perfil paciente)
- Existem dois tipos, cada um com liga/desliga, horário e canal próprios:
  - **Noite**: enviado se houver atividade PLANEJADA ou PENDENTE com data até hoje.
  - **Manhã** (opcional): enviado se houver atividade PLANEJADA para hoje.
- Canais: Web Push, e-mail ou os dois.
- No máximo um envio por tipo por dia (2 no total).
- Horários em intervalos de 15 minutos, no fuso America/Sao_Paulo.
- O texto é sempre neutro: nunca inclui nome de atividade, notas ou observações.

## Privacidade (LGPD)
- O sistema coleta apenas nome, e-mail e senha (guardada só como hash), além dos registros.
- Um **aviso de privacidade** público (`/privacidade`) diz quem é o responsável, o que é coletado e para quê, quem vê, onde os dados ficam, por quanto tempo, os direitos da pessoa e o contato. Ele tem link no cadastro, na tela de entrar, no rodapé do app e em Conta.
- Como os registros são dados de saúde (dado sensível na LGPD), o cadastro pede consentimento específico e destacado. A API grava a data e a versão do aviso aceito.
- Quando o aviso muda para cobrir dados novos, quem aceitou a versão anterior aceita de novo antes de usar a parte nova. Cada área exige a versão que passou a citá-la: o RPD, a partir da `2026-10.2`; os Episódios de tensão, a partir da `2026-10.3`; a agenda (hora, motivos e pausas), a partir da `2026-10.4`; a Ação, a partir da `2026-10.5`; as fotos da Ação, a partir da `2026-10.6`. Sem ela, só aquela área fica bloqueada (para paciente e terapeuta), e o resto do app funciona. Uma versão nova não bloqueia de novo uma área já liberada, e um aceite só libera todas. Uma versão sem área nova (a `2026-10.7`, das cópias de segurança) pede o aceite numa faixa no topo de Meus registros e de Meus pacientes, sem bloquear nada (DEC-078).
- Nenhum documento pessoal é solicitado.
- **Cópia de segurança** diária do banco, criptografada antes de sair do Railway e guardada no Cloudflare R2: 7 cópias diárias e 4 semanais, que expiram em até 5 semanas. Só é aberta para recuperar dados depois de um problema grave (DEC-075, DEC-078).
- A pessoa pode excluir a própria conta, o que apaga todos os seus dados e vínculos do app na hora. Nas cópias de segurança, eles expiram em até 5 semanas; se uma cópia for restaurada, as contas excluídas depois dela são apagadas de novo (DEC-077). A exclusão é confirmada com a senha, derruba todas as sessões abertas e gera um e-mail neutro avisando que a conta foi excluída e o prazo das cópias. A janela de excluir lembra ao paciente com vínculo ativo que, para só dar um tempo, basta desfazer o vínculo.
- Nenhum dado real em seeds, fixtures ou testes.

## Tom e interface
- Interface calma e acolhedora, sem aparência clínica, com modo claro e escuro. Exceção: o RPD usa termos clínicos suaves (DEC-039).
- Textos acolhedores ("Conta como foi?"), sem gamificação nem mensagens que gerem culpa.
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
- Mais de uma terapeuta por paciente
- Verificação de CRP
