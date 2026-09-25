# Faísca — Especificação

PWA para o Registro de Ativação (ativação comportamental da TCC).
Uso privado no início, com arquitetura pronta para vários pacientes e terapeutas.

## Contas e perfis
- Cadastro com **nome, e-mail e senha**; o e-mail precisa ser confirmado antes do primeiro uso.
- No cadastro, a pessoa escolhe como vai usar o Faísca (um ou os dois perfis):
  - **Paciente**: registra atividades, consultas e lembretes; vincula e revoga sua terapeuta.
  - **Terapeuta**: apenas leitura dos dados dos pacientes com vínculo ativo.
- O perfil não escolhido pode ser ativado depois, em Configurações.
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

## Consultas
- O paciente registra as datas das consultas (passadas e futuras) e pode editar ou excluir essas datas.
- **Última consulta** = a mais recente com data até hoje.
- **Próxima consulta** = a mais próxima com data a partir de amanhã.

## Tela semanal (paciente e terapeuta)
- A semana vai de segunda a domingo e dá para navegar entre semanas.
- Mostra a lista de atividades e um gráfico comparando vontade × prazer × realização.
- As notas usam uma única cor que varia de intensidade (sem vermelho/verde).

## Visão da terapeuta
- Lista de pacientes com vínculo ativo. Os dados do paciente (nome etc.) vêm da conta dele, nada é digitado pela terapeuta.
- Por paciente:
  - linha do tempo com notas e observações (nada é privado);
  - gráficos;
  - filtro "desde a última consulta".
- **Destaque**: as atividades dos 7 dias antes da próxima consulta aparecem em evidência. Sem próxima consulta cadastrada, o destaque cobre os últimos 7 dias até hoje.
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
- Quando um vínculo é criado, o paciente é avisado e vê o **nome e o e-mail** de quem se vinculou.
- O paciente revoga a qualquer momento e o acesso cai na hora. O registro do vínculo é mantido (`revokedAt`).

## Autorização (regra inviolável)
- No papel de terapeuta: somente requisições GET, e apenas de pacientes com vínculo ativo.
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
- Nenhum documento pessoal é solicitado.
- A pessoa pode excluir a própria conta, o que apaga todos os seus dados e vínculos.
- Nenhum dado real em seeds, fixtures ou testes.

## Tom e interface
- Interface calma e acolhedora, sem aparência clínica, com modo claro e escuro.
- Textos acolhedores ("Conta como foi?"), sem gamificação nem mensagens que gerem culpa.
- PWA instalável; usar o app exige conexão.

## Fora do escopo (por ora)
- Exportação CSV/PDF
- Modo demo
- Uso offline com sincronização
- Mais de uma terapeuta por paciente
- Verificação de CRP
