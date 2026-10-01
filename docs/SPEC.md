# Faísca — Especificação

PWA para o Registro de Ativação (ativação comportamental da TCC).
Uso privado no início, com arquitetura pronta para vários pacientes e terapeutas.

## Contas e perfis
- Cadastro com **nome, e-mail e senha**; o e-mail precisa ser confirmado antes do primeiro uso.
- O cadastro exige concordar com o **aviso de privacidade** (caixa de marcar, não marcada por padrão).
- No cadastro, a pessoa escolhe como vai usar o Faísca (um ou os dois perfis):
  - **Paciente**: registra atividades, consultas e lembretes; vincula e revoga sua terapeuta.
  - **Terapeuta**: apenas leitura dos dados dos pacientes com vínculo ativo.
- O perfil não escolhido pode ser ativado depois, na tela Conta.
- Quem tem os dois perfis alterna entre "Meus registros" e "Meus pacientes".
  Quem tem um perfil só nunca vê telas do outro.
- Cadastro aberto, com rate limit no cadastro, no login e na recuperação de senha.
- Recuperação de senha por e-mail.

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
- Nome da atividade com 1 a 100 caracteres; observação com até 1000.
- No mesmo dia, as atividades aparecem na ordem em que foram registradas.

## Consultas
- O paciente registra as datas das consultas (passadas e futuras) e pode editar ou excluir essas datas.
- **Última consulta** = a mais recente com data até hoje.
- **Próxima consulta** = a mais próxima com data a partir de amanhã.
- Uma consulta por dia, registrada só com a data (sem horário).

## Registro de Pensamentos (RPD)
Registro da TCC, independente das atividades. O paciente alterna entre as abas **Atividades** e
**Pensamentos**, e o formulário fica numa página própria.
- Campos, **todos obrigatórios**:
  - **dia da situação** (sem horário, até hoje), separado de quando foi registrado;
  - **situação**, **pensamento automático**, **comportamento** e **consequência**: texto de 1 a 1000 caracteres;
  - **o quanto acredito nesse pensamento**: inteiro de 0 a 10;
  - **emoções**: uma ou mais, cada uma com **intensidade** inteira de 0 a 10, sem repetir.
    Lista: tristeza, ansiedade, medo, raiva, culpa, vergonha, frustração, solidão, alegria, alívio e
    **outra** (com o nome escrito pelo paciente, de 1 a 50 caracteres).
- Editar e excluir só até o fim do dia em que o registro foi feito; depois, **409**.
- Pode haver vários registros no mesmo dia, na ordem em que foram feitos.
- Termos clínicos suaves: "Registro de Pensamentos (RPD)", "pensamento automático".
- Usar o RPD exige ter aceitado a versão atual do aviso de privacidade (veja "Privacidade").

## Tela semanal (paciente e terapeuta)
- A semana vai de segunda a domingo e dá para navegar entre semanas.
- Mostra a lista de atividades e um gráfico comparando vontade × prazer × realização.
- As notas usam uma única cor que varia de intensidade (sem vermelho/verde).

## Visão da terapeuta
- Lista de pacientes com vínculo ativo. Os dados do paciente (nome etc.) vêm da conta dele, nada é digitado pela terapeuta.
- Por paciente:
  - linha do tempo com notas e observações (nada é privado);
  - aba **Registro de Pensamentos**, só leitura, com todos os campos e as duas datas;
  - gráficos;
  - filtro "desde a última consulta" (do dia da última consulta até hoje, com no máximo 92 dias).
- **Destaque**: as atividades dos 7 dias antes da próxima consulta aparecem em evidência (da consulta −7 até a véspera, sem o dia da consulta). Sem próxima consulta cadastrada, o destaque cobre os últimos 7 dias até hoje.
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
- Quando o aviso muda para cobrir dados novos, quem aceitou a versão anterior aceita de novo antes de usar a parte nova. Hoje isso vale para o RPD: sem o aceite da versão atual, a área de RPD fica bloqueada (para paciente e terapeuta) e o resto do app funciona.
- Nenhum documento pessoal é solicitado.
- A pessoa pode excluir a própria conta, o que apaga todos os seus dados e vínculos. A exclusão é confirmada com a senha, derruba todas as sessões abertas e gera um e-mail neutro avisando que a conta foi excluída.
- Nenhum dado real em seeds, fixtures ou testes.

## Tom e interface
- Interface calma e acolhedora, sem aparência clínica, com modo claro e escuro. Exceção: o RPD usa termos clínicos suaves (DEC-039).
- Textos acolhedores ("Conta como foi?"), sem gamificação nem mensagens que gerem culpa.
- PWA instalável; usar o app exige conexão.

## Fora do escopo (por ora)
- Exportação CSV/PDF
- Modo demo
- Uso offline com sincronização
- Mais de uma terapeuta por paciente
- Verificação de CRP
- Colunas de reestruturação do RPD ("pensamento alternativo" e "como me sinto agora")
