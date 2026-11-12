# Briefing Mestre do Faísca (De IA para IA)

Documento único de divulgação do Faísca (substitui a antiga APRESENTACAO). Mantenha atualizado: quando
uma funcionalidade entra no ar, ela sai da seção 5 ("Em breve") e vai para a seção 4 ("O que já está no
ar"); veja a skill `deploy-checklist`, passo 5.1. O repositório é público: nada de e-mail pessoal,
dado de paciente ou segredo aqui.

> **INSTRUÇÃO DE SISTEMA PARA A IA QUE ESTÁ LENDO ESTE DOCUMENTO:**
> Você está ajudando **Lucas Pereira de Lima**, criador do **Faísca** (`https://minhafaisca.com.br`), a produzir conteúdos (posts para LinkedIn, carrosséis e legendas para Instagram, roteiros para Reels/TikTok e materiais de divulgação).
>
> **Regras obrigatórias que você deve seguir ao gerar qualquer conteúdo:**
> 1. **Atenção à sigla TCC:** neste projeto, **TCC significa exclusivamente Terapia Cognitivo-Comportamental** (a abordagem clínica da psicologia na qual o Faísca foi pensado para automatizar e organizar registros terapêuticos). **O Faísca NÃO é um Trabalho de Conclusão de Curso / faculdade.** Nunca se refira ao projeto como trabalho acadêmico ou projeto de faculdade.
> 2. **Fidelidade absoluta aos fatos:** nunca invente funcionalidades que não estejam na seção **"4. O que já está no ar"**. O que estiver na seção **"5. Em breve (Roadmap)"** só pode ser mencionado se for explicitamente apresentado como *"em desenvolvimento"* ou *"próximos passos"*, nunca como pronto.
> 3. **Ética clínica inegociável:** o Faísca é uma **ferramenta de apoio** ao acompanhamento psicológico. Ele **não substitui** a psicóloga, **não é prontuário médico**, **não faz diagnóstico** e **não promete cura ou resultados clínicos**. Em qualquer conteúdo que toque em sofrimento intenso ou crise, inclua a orientação de procurar ajuda profissional e o **CVV (ligue 188, gratuito, 24h)**.
> 4. **Zero depoimentos ou números inventados:** há uso real por paciente e psicóloga, mas nunca invente histórias de pacientes reais, nomes que pareçam reais ou estatísticas fictícias ("90% dos pacientes melhoraram"). Quando der exemplos de telas ou registros, deixe claro que são exemplos ilustrativos.
> 5. **Respeite o vocabulário do Faísca:** consulte a tabela da seção **"6. Tom de voz e vocabulário"** antes de escrever. Nunca associe o Faísca a *streaks* (ofensivas), foguinhos, pontuação, ranking, cobrança ou culpa.

---

## 1. Quem é o autor e o que é o Faísca

- **Nome do projeto:** Faísca
- **Endereço oficial:** https://minhafaisca.com.br
- **Autor:** Lucas Pereira de Lima (contato do projeto: `suporte@minhafaisca.com.br`)
- **O que é:** produto digital independente criado para digitalizar e acolher atividades essenciais da **Terapia Cognitivo-Comportamental (TCC)** no dia a dia entre as sessões. O Faísca **entrou em produção em 30/09/2026**, está em **uso real e contínuo por paciente e psicóloga**, e tem **cadastro aberto e gratuito**, sem anúncios e sem pedir documentos pessoais.
- **Formato técnico:** **PWA (Progressive Web App)** — funciona direto no navegador (celular, tablet ou computador) e pode ser instalado na tela inicial do celular (Android e iPhone) como aplicativo, sem precisar de loja de apps.
- **Base teórica:** pensado especificamente para a **Terapia Cognitivo-Comportamental (TCC)**, começando pela técnica de **Ativação Comportamental** (o *Registro de Ativação*) e pelo **Registro de Pensamentos (RPD)** (Beck, 2022).

---

## 2. O problema que o Faísca resolve

Entre uma sessão de terapia e outra passam-se **7 ou 14 dias**. Nesse intervalo, muita coisa acontece: atividades que a pessoa planejou fazer, momentos em que faltou energia, pensamentos automáticos difíceis, picos de tensão no corpo e pequenas conquistas.

Na prática clínica tradicional:
- Anotar em caderno de papel ou notas soltas no celular faz com que a pessoa esqueça de registrar na hora ou perca o contexto;
- Mandar tudo solto por mensagem para a psicóloga desorganiza o acompanhamento;
- Apps genéricos de hábitos usam **gamificação punitiva** (foguinhos de sequência/*streaks*, alertas vermelhos de "tarefa atrasada", metas rígidas), o que **gera culpa e ansiedade** justamente em quem está em sofrimento ou passando por uma semana difícil;
- Na hora da sessão, os primeiros 15 a 20 minutos acabam gastos tentando lembrar *"o que aconteceu desde a última consulta?"*.

**A resposta do Faísca:**
1. Organiza todos os registros pelo **Ciclo da consulta** (o período exato desde o dia seguinte à última sessão até o dia da próxima sessão);
2. Registra **tanto o que foi feito quanto o que não deu para fazer**, sem julgamento e sem culpa;
3. Compara **o que a pessoa esperava sentir antes** com **o que realmente sentiu depois** (mostrando na prática que muitas vezes agir trouxe mais prazer ou realização do que a mente previa);
4. Permite que a **psicóloga acompanhe tudo em modo somente leitura**, com o consentimento do paciente, sabendo exatamente o que é novo desde a última vez que leu.

---

## 3. Públicos do Faísca

1. **Pacientes em terapia (principalmente TCC):** pessoas que querem registrar suas atividades, pensamentos, episódios de tensão, ações e agenda de consultas num ambiente calmo, acolhedor e acessível (inclusive pessoas neurodivergentes: TEA, TDAH, dislexia, ansiedade).
2. **Psicólogas e psicólogos clínicos:** profissionais que querem acompanhar os registros dos pacientes entre as sessões, organizar o que ainda falta ler antes do atendimento e publicar avisos gerais (férias, feriados, agenda) num mural ético e seguro.
3. **Psiquiatras:** acompanham, por 1, 2 ou 3 meses, como o paciente passou o período entre uma consulta e outra (as consultas psiquiátricas costumam ser mais espaçadas).
4. **Quem usa os dois perfis:** uma mesma conta pode ter o perfil de paciente, o de terapeuta ou ambos (alternando no topo entre *"Meus registros"* e *"Meus pacientes"*).

---

## 4. O que já está no ar (Funcionalidades em produção)

### 4.1. Para o Paciente

- **Atividades (Registro de Ativação):**
  - Planejar atividades para os dias da semana/ciclo (`PLANEJADA`), registrar quanta **vontade antes** tem de fazer de 0 a 10 (`PENDENTE`) e, a partir do dia da atividade, contar como foi (`CONCLUIDA`) dando notas de 0 a 10 para **prazer** e **sensação de realização**, além de uma observação opcional (até 5.000 caracteres).
  - Se não conseguiu fazer, marca **"Não aconteceu"** (`NAO_REALIZADA`) com o diálogo acolhedor *"Tudo bem, quer contar o que aconteceu?"* e observação opcional.
  - Também permite criar registro retroativo de algo já feito.
  - Exibe um **gráfico comparativo** (*Vontade antes × Prazer × Realização*) em barras horizontais no celular e colunas lado a lado no tablet/computador, usando uma única cor em três intensidades (nunca vermelho/verde).

- **Registro de Pensamentos (RPD):**
  - Termos clínicos suaves: *"Registro de Pensamentos"*, *"Pensamento automático"*.
  - Campos do momento: **dia da situação**, **situação** (até 5.000 caracteres), **pensamento automático** (até 5.000 caracteres), **o quanto acredito nesse pensamento** (0 a 10), **emoções** (lista com *Tristeza, Ansiedade, Medo, Raiva, Culpa, Vergonha, Frustração, Solidão, Alegria, Alívio* e *Outra*, cada uma com intensidade de 0 a 10), **comportamento** (o que fez) e **consequência** (o que aconteceu depois).
  - **Reestruturação cognitiva (Explicação alternativa + Como me sinto agora):**
    - A pessoa pode escrever uma **explicação alternativa** (outro jeito de olhar para a situação) e reavaliar a intensidade de cada emoção (**"Como me sinto agora"**), vendo no cartão o antes e o depois (`8 → 4`) e a alternativa destacada num bloco suave cor pêssego.
    - Como na vida real muitas vezes só conseguimos pensar numa alternativa quando a emoção baixa, o Faísca permite **adicionar a explicação alternativa depois do dia do registro, uma única vez, até o horário da próxima consulta agendada**.

- **Episódios de tensão:**
  - Para registrar momentos de tensão física/emocional ou tiques vocais/de ansiedade.
  - Campos: **dia**, **hora** (opcional, para quem não lembra a hora exata), **situação**, **tensão no corpo** (0 a 10), **vontade de vocalizar** (0 a 10 — falar, gritar ou se movimentar para expressar a ansiedade), **o que fez** e **o que aconteceu depois**.
  - No fim da tela, um **gráfico de linha** mostra a evolução da tensão e da vontade de vocalizar ao longo do período, marcando os dias em que houve consulta.

- **Ação (Prazer, Conexão e Realização):**
  - Ações intencionais que a pessoa escolhe fazer no ciclo, divididas em três categorias claras:
    1. **Prazer:** algo que se gosta de fazer (ex.: ouvir música, tomar sol, cozinhar algo gostoso);
    2. **Conexão:** aproximar-se de alguém (ex.: mandar mensagem para um amigo, tomar café com alguém querido);
    3. **Realização:** algo que dá sensação de propósito ou dever cumprido (ex.: arrumar uma gaveta, caminhar 15 minutos, resolver uma pendência).
  - Ao escolher a categoria, o campo já mostra exemplos práticos para ajudar quem trava na hora de pensar no que fazer.
  - Guarda a **expectativa antes** (0 a 10: o quanto espera gostar) e, depois, o **prazer** e a **realização** (0 a 10), mostrando lado a lado no cartão: `Esperava 3 · Prazer 7 · Realização 6`.
  - **Meta visual sem cobrança:** mostra espaços visuais por categoria que se preenchem conforme as ações são feitas, sem escrever *"faltam N"* e sem cor de alerta.
  - **Repetir do ciclo passado:** ações do ciclo anterior viram atalhos de um toque para planejar de novo.
  - **Fotos da Ação:** em uma ação avaliada, o paciente pode adicionar **até 10 fotos** (até a próxima consulta) para guardar a memória visual daquele momento bom; a psicóloga vinculada também vê.

- **Agenda de consultas e Ciclo da consulta:**
  - O paciente configura sua agenda recorrente (**semanal** ou **quinzenal**, dia e horário), além de poder criar **consulta avulsa**, **desmarcar** (ou registrar falta) e **remarcar** informando o motivo, **pausar** a terapia (com ou sem data de volta) ou **encerrar**.
  - Pode baixar um arquivo `.ics` para colocar as sessões no **calendário do celular** (com o título neutro `"Consulta"`, sem expor motivos).
  - **Ciclo da consulta automático:** as abas de Atividades, Pensamentos, Tensão e Ação abrem no período exato entre a última sessão realizada e a próxima sessão agendada (com alternância `Ciclo | Semana`), mostrando um resumo neutro do ciclo (quantos dias, atividades feitas, pensamentos, episódios e ações).

- **Meus Planos:**
  - Planos de ação combinados com a psicóloga, como *"Quando surgir vontade de ___, registrar: …"*, com até 10 perguntas próprias (há um modelo de 6 perguntas para começar, inserido por um botão).
  - A cada vez que a situação acontece, o paciente registra as respostas; o registro guarda as perguntas como estavam, e o plano pode ser encerrado e reaberto.
  - A aba só aparece quando existe algum plano.

- **Lembretes de manhã e de noite:**
  - Por e-mail ou como notificação no aparelho (Web Push), quando há atividades ou ações planejadas, sempre com **texto 100% neutro** (nunca mostram o que a pessoa escreveu), horário de silêncio e opção de pausar.

- **"Sobre mim" (em Conta):**
  - Três campos opcionais de texto livre (até 2.000 caracteres cada) para dar contexto à psicóloga:
    1. **Sobre mim** (quem sou, rotina, coisas importantes);
    2. **O que eu gostaria de trabalhar** (com chips de sugestão tocáveis — *Ansiedade, Tristeza ou desânimo, Autoestima, Relacionamentos, Socializar, Trabalho ou estudos, Sono, Rotina e organização, Lidar com a raiva, Luto* — que inserem texto editável, sem gravar rótulos clínicos fechados);
    3. **Hábitos que quero deixar (ou já deixei)**.
  - Sem barra de "perfil X% completo". Apagar tudo apaga o registro.

- **Vínculo com a psicóloga e a psiquiatra ("Quem me acompanha") e Mural de avisos:**
  - O paciente pode ter **uma psicóloga e uma psiquiatra** ao mesmo tempo. Cria cada vínculo de duas formas: enviando um **convite por e-mail** ou gerando um **código de 8 caracteres** (`K7M4-P9QX`, válido por 24h) para a profissional digitar.
  - **O paciente escolhe o que cada uma vê** ("O que [nome] pode ver"): atividades, pensamentos, tensão, Ação e fotos, "Sobre mim", agenda e Meus Planos. Uma profissional nova **começa sem ver nada**, e mudar vale na hora.
  - O paciente pode **desfazer cada vínculo a qualquer momento** em Conta, e o acesso daquela profissional cessa imediatamente.
  - Quando a psicóloga publica um comunicado no mural dela, o paciente vê um cartão discreto no topo de *Meus registros* com o selo `"Novo"` e a página `/avisos`.

### 4.2. Para a Psicóloga e a Psiquiatra

- **Acesso estritamente somente leitura:**
  - Vê a lista de todos os seus pacientes vinculados (com foto, nome, status da agenda se estiver em pausa/encerrada e quantidade de registros para ler).
  - Vê **só as áreas que o paciente liberou para ela**; sem nenhuma, a página explica que ele ainda não liberou nada.
  - A **psicóloga** navega pelo **mesmo Ciclo da consulta** (ou Semana) que o paciente vê, nas abas liberadas (**Atividades**, **Pensamentos**, **Tensão**, **Ação** e **Meus Planos**), além da **Agenda de consultas** (com motivos de desmarcação/remarcação) e do cartão **"Sobre [Nome]"**.
  - A **psiquiatra** vê os mesmos registros por **1, 2 ou 3 meses** (começa em 3), com setas para voltar no tempo.
  - No cadastro ou no convite, a profissional diz se é **psicóloga ou psiquiatra** e, em Conta, pode informar o número do conselho (CRP ou CRM), que aparece para os pacientes.
  - **Regra inviolável de arquitetura:** a terapeuta nunca altera nem apaga nenhum dado do paciente (bloqueado no backend com `403`).

- **Marcação de "Lido" e visão "Para ler":**
  - A profissional pode marcar cada Pensamento, Episódio de tensão, Ação, registro do Meus Planos ou "Sobre mim" como **lido** (ou clicar em **"Marcar todos como lidos"** na lista aberta).
  - Se o paciente editar um registro do dia, adicionar uma explicação alternativa depois ou enviar uma foto nova na Ação, o cartão passa a mostrar o selo **"Atualizado depois que você leu"**.
  - A visão **"Para ler"** reúne tudo o que ainda não foi lido (ou foi atualizado), de qualquer data, do mais antigo para o mais recente — garantindo que um registro feito num ciclo anterior nunca passe despercebido.
  - Em *Meus pacientes*, um card no topo resume o total (`"12 registros para ler, de 2 pacientes"`) e ordena no topo os pacientes com itens pendentes.
  - **Cuidado clínico:** essa marcação é uma ferramenta de organização exclusiva da psicóloga — **o paciente não vê** se um registro foi marcado como lido ou não, evitando ansiedade de *"será que ela leu o que eu escrevi?"*.

- **Mural de avisos (`/mural`):**
  - Permite publicar avisos de até 2.000 caracteres para **todos os pacientes vinculados de uma só vez** (ex.: recesso de fim de ano, feriado, mudança na agenda).
  - É **de mão única e privado**: sem caixa de comentários, nenhum paciente sabe quem mais é paciente daquela psicóloga, e a psicóloga não vê lista de quem visualizou (evitando cobrança).

### 4.3. Para Todos (Personalização, Acessibilidade e Segurança da Conta)

- **Foto de perfil e 5 paletas de cores:**
  - Foto de perfil com recorte circular no próprio navegador antes de enviar (e iniciais quando não há foto).
  - **5 paletas de cores** salvas na conta (valem no celular e no computador), com **prévia na hora** ao tocar:
    1. **Sálvia (padrão):** verde calmo e acolhedor;
    2. **Lavanda:** lilás suave e tranquilo;
    3. **Oceano:** azul sereno e limpo;
    4. **Areia:** terracota quente e aconchegante;
    5. **Alto contraste:** cores mais fortes para leitura nítida (contraste nível WCAG AAA).
  - Combinadas com **Tema Claro, Escuro ou Automático** no rodapé.

- **Acessibilidade (5 ajustes independentes em `Conta → Acessibilidade`):**
  - Abertos a qualquer pessoa (paciente ou terapeuta), sem precisar declarar diagnóstico, e salvos na conta:
    1. **Linguagem direta:** textos objetivos e literais, sem metáforas ou expressões figuradas (troca *"Conta como foi?"* por *"Avaliar atividade"*, *"O que passou pela sua cabeça na hora?"* por *"O que você pensou naquele momento?"*, *"Tudo bem, quer contar o que aconteceu?"* por *"Registrar que não realizou"*).
    2. **Uma coisa por vez:** divide os formulários longos (**Pensamentos** em 5 passos, **Tensão** em 3 passos e **Ação** em 2 ou 3 passos) com indicador *"Passo X de N"*, botões *"‹ Anterior"* e *"Próximo ›"* e validação por passo.
    3. **Leitura confortável:** aumenta o tamanho da fonte (`112.5%`) e o espaçamento entre linhas (`1.75`), letras e palavras (com prévia imediata ao marcar).
    4. **Sem pressão de tempo:** esconde contagens regressivas de dias para a consulta (*"Sua consulta é daqui a N dias"*, *"em N dias"*) e textos de prazo nos cartões (*"até…"*).
    5. **Menos movimento:** desliga todas as animações e transições de tela e gráficos no app, mesmo sem a preferência do sistema operacional ativada (com prévia imediata ao marcar).

- **Segurança em Conta e Novidades:**
  - **Trocar senha:** exige a senha atual, mantém o aparelho em uso conectado, desconecta todos os outros aparelhos imediatamente e envia um e-mail neutro de alerta (sem link, para não servir de isca de *phishing*).
  - **Sair de todos os aparelhos:** confirmado com a senha, invalida todas as sessões abertas.
  - **Verificação em duas etapas (opcional):** além da senha, um código por e-mail ou por app autenticador, com 10 códigos de recuperação. Mesmo que a senha vaze, ninguém entra sem o código.
  - **Aviso de novos acessos:** a cada login, um e-mail neutro (e um push, se ligado) com data, hora e aparelho.
  - **Novidades do Faísca (`/novidades`):** card no topo quando uma melhoria entra no ar e página com o histórico completo de atualizações.

---

## 5. Em breve — Roadmap (NUNCA divulgar como já existente)

Estes itens estão planejados no backlog e **ainda não estão no ar**:
1. **Perfil de saúde opcional (Parte 2 da #87):** pergunta opcional sobre neurodivergência, condições de saúde (TEA, TDAH, Dislexia, Ansiedade, Depressão, TOC, Bipolaridade, Altas habilidades/Superdotação, Outra) com sugestão automática dos ajustes de acessibilidade, lista de remédios em uso e contatos de emergência (visíveis em modo leitura para a psicóloga vinculada, com consentimento próprio).
2. **Lembretes também por WhatsApp (#82):** o e-mail e o Web Push já estão no ar; o WhatsApp é o próximo canal, com o mesmo texto neutro.
3. **Feedback sensorial suave ao salvar:** animação, som e vibração sutis ao concluir um registro, com opção de desligar.
4. **Trava do app (#137) e entrar com passkey.**
5. **Baixar cópia dos próprios dados (portabilidade LGPD, #88).**
6. **Sono e humor (#188)** e **medicação (#171)**, pensados para o acompanhamento com a psiquiatra.
7. **Meus Planos, 2ª parte:** a psicóloga também cria planos para o paciente.

---

## 6. Tom de voz e vocabulário ("Diga X / Nunca diga Y")

O tom do Faísca é **acolhedor, calmo, direto e sem julgamento**. Ele valoriza o ato de observar e registrar a própria rotina, nunca a "produtividade" ou o "desempenho".

| Contexto | Como o Faísca fala (Use isto) | Como o Faísca NUNCA fala (Proibido) |
|---|---|---|
| Avaliar atividade ou ação | *"Conta como foi?"* (ou *"Avaliar atividade"* na Linguagem direta) | *"Concluir tarefa"*, *"Tarefa pendente"*, *"Finalizar meta"* |
| Quando não realizou | *"Não aconteceu"*, *"Não deu desta vez"*, *"Tudo bem, quer contar o que aconteceu?"* | *"Você falhou"*, *"Tarefa atrasada"*, *"Perdeu o prazo"*, *"Incompleta"* |
| RPD | *"Registro de Pensamentos (RPD)"*, *"Pensamento automático"*, *"Explicação alternativa"* | *"Pensamento disfuncional"*, *"Distorção cognitiva"*, *"Erro de pensamento"* |
| Organização da psicóloga | *"Para ler"*, *"12 registros para ler"*, *"Marcar como lido"* | *"Não lidos"*, *"Pendências atrasadas"*, *"Caixa de entrada"* |
| Acompanhamento no ciclo | *"Neste ciclo"*, espaços visuais que se preenchem | *"Faltam 2 ações"*, *"Você só fez 30% da meta"*, *streaks*, foguinhos, pontos |
| Cores de notas (0 a 10) | Uma única cor variando a intensidade, sempre com o número escrito | Semáforo vermelho = ruim / verde = bom |

---

## 7. Identidade Visual (Referência para Canva, Carrosséis e Artes)

- **Estética:** acolhedora, editorial, orgânica, limpa, com bastante espaço de respiro, cantos arredondados suaves e sombras leves. Sem aparência hospitalar ou fria.
- **Tipografia:**
  - **Títulos:** `Nunito` (arredondada, amigável, em negrito/seminegrito).
  - **Texto corrido e interface:** `Inter` (alta legibilidade em telas pequenas).
- **Paleta padrão (Sálvia) — Hexadecimais exatos:**
  - **Tema Claro:**
    - Fundo da página (`bg`): `#faf7f2` (off-white quente / papel creme suave)
    - Superfície de cartões (`surface`): `#ffffff`
    - Texto principal (`text`): `#1f2d27` (verde-escuro quase carvão)
    - Texto secundário (`muted`): `#52635b`
    - Cor principal (`primary` — botões e destaques): `#4a6b5b` (verde-sálvia)
    - Texto/links na cor principal (`primary-text`): `#365346`
    - Destaque pontual (`accent` — ex.: explicação alternativa): `#d98a5f` (pêssego/âmbar suave)
    - Borda de cartões (`border`): `#e5dfd5`
  - **Tema Escuro:**
    - Fundo da página (`bg`): `#132026` (azul-petróleo profundo)
    - Superfície de cartões (`surface`): `#1b2c34`
    - Texto principal (`text`): `#eae6df`
    - Texto secundário (`muted`): `#a3b3b8`
    - Cor principal (`primary`): `#6b9080` (sálvia luminoso)
    - Destaque pontual (`accent`): `#e29578`
- **As outras 4 paletas disponíveis na conta:**
  - **Lavanda:** principal `#665687` (claro) / `#9f8ec4` (escuro), fundo `#f9f7fc` / `#191625`
  - **Oceano:** principal `#35657e` (claro) / `#6fa3be` (escuro), fundo `#f5f8fa` / `#121e27`
  - **Areia:** principal `#88543b` (claro) / `#c88d70` (escuro), fundo `#fbf7f2` / `#221915`
  - **Alto contraste (WCAG AAA):** principal `#173f2c` (claro) / `#9fe0be` (escuro), fundo `#ffffff` / `#0a0f0d`

---

## 8. Bastidores de Engenharia, Segurança e LGPD (Para posts técnicos no LinkedIn)

O Faísca trata registros psicológicos como **dados pessoais sensíveis de saúde (LGPD)** desde o primeiro dia. Pontos técnicos reais que rendem excelentes conteúdos de Engenharia de Software e Segurança:

1. **Stack moderna:**
   - **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4 (tokens em `@theme` com `light-dark()`), React Router, TanStack Query, Recharts, PWA.
   - **Backend:** Node.js, Express, TypeScript, validação estrita com Zod, Prisma ORM, PostgreSQL.
   - **Testes e CI:** Vitest + Testing Library no front, testes de integração no backend e suíte E2E/API no Playwright focada em autorização, rodando no GitHub Actions. Deploy na Vercel (front) e Railway (API + banco).
2. **Regras invioláveis de segurança e privacidade:**
   - **Autorização rígida no backend:** no papel de terapeuta, um middleware (`onlyReads`) barra na porta qualquer método que não seja `GET`, e valida o vínculo ativo antes de tocar no banco. Esconder botão no front é tratado apenas como conforto visual, nunca como segurança.
   - **Imutabilidade de registros finais (`409 Conflict`):** atividades concluídas ou não realizadas e ações avaliadas não podem ser alteradas nem excluídas; pensamentos e episódios de tensão só podem ser editados no próprio dia em que foram criados.
   - **Menor privilégio no banco de dados (PostgreSQL):** a API em produção conecta com a role `faisca_app` (que só tem permissão de leitura/escrita `DML`, sem poder dar `DROP` ou `ALTER`), enquanto as migrations rodam separadas no pre-deploy com a role `faisca_migrator` (`DDL`). O superusuário nunca é usado pela aplicação.
   - **Proteção de imagens e remoção de metadados (`sharp`):** fotos de perfil e fotos da Ação têm os *magic bytes* conferidos antes de abrir, passam por uma fila de processamento para não derrubar a memória do servidor e são regravadas em WebP **sem nenhum metadado EXIF/GPS** (removendo a localização de onde a foto foi tirada). Fotos da Ação usam `Cache-Control: no-store` para não ficarem gravadas no disco de aparelhos compartilhados.
   - **Segredos de vínculo nunca salvos em texto:** tokens de convite e códigos de 8 caracteres são guardados no banco apenas como hash (`HMAC-SHA256`).
   - **Logs limpos (`redact`):** senhas, tokens, códigos, nomes de atividades, pensamentos, emoções, notas e observações são filtrados e nunca aparecem nos logs do servidor.
   - **O paciente decide o que cada profissional vê:** cada vínculo (psicóloga ou psiquiatra) guarda as áreas liberadas, e a API responde `403` para qualquer área fechada; uma profissional nova começa sem ver nada.
   - **Verificação em duas etapas e aviso de novos acessos:** código por e-mail ou app autenticador, códigos de recuperação de uso único e um e-mail neutro (sem link) a cada login.
   - **Consentimento granular por versão do aviso de privacidade:** cada área nova que coleta dados de saúde (Pensamentos, Tensão, Agenda, Ação, Fotos da Ação, Sobre mim) exige aceite explícito da versão correspondente do aviso de privacidade; quem ainda não aceitou uma versão nova continua usando o resto do app sem perder acesso ao que já usava.
   - **Backups diários criptografados (`age` + Cloudflare R2) e direito ao esquecimento:** todo dia um serviço isolado gera um dump do banco e o **criptografa com `age` (chave pública) antes de sair do servidor**, guardando no Cloudflare R2 com retenção de até 5 semanas. Quando alguém exclui a conta, tudo some do app na hora, e o ID aleatório entra numa tabela `DeletedAccount` por 35 dias para que, mesmo se um backup precisar ser restaurado após um desastre, as contas excluídas sejam apagadas novamente.
   - **Deploy sem janela de quebra (`DEC-056`):** como a Vercel publica o front em ~1 minuto e o Railway publica a API + migrations em ~8 minutos, mudanças de contrato sempre sobem em dois PRs separados (primeiro a API retrocompatível, confirmada pelo commit no `/health`, e só depois o front).
   - **Desenvolvimento assistido por IA com governança:** uso de agentes (Claude Code e Antigravity/Gemini) com regras invioláveis no repositório, hooks automáticos de proteção (bloqueando edição de `.env`, `prisma db push`, force push ou alteração de migrations já aplicadas) e **3 subagentes revisores independentes** antes de cada PR (`revisor-regras`, `revisor-telas` para contraste WCAG/tom/acessibilidade e `revisor-seguranca`).

---

## 9. Modelos de Conteúdo por Rede (Como estruturar quando o Lucas pedir)

### A. LinkedIn (Voz: Lucas em 1ª pessoa — foco em Engenharia, Produto, Acessibilidade e Saúde Mental / TCC)
- **Tom:** profissional, reflexivo, técnico mas humano, mostrando decisões reais de arquitetura e produto tomadas num app em produção voltado para a Terapia Cognitivo-Comportamental (TCC).
- **Estrutura recomendada:**
  1. **Gancho concreto (1–2 linhas):** um problema real que surgiu na construção do Faísca (ex.: *"O que acontece se você restaurar um backup de ontem, mas um usuário excluiu a conta hoje de manhã?"* ou *"Por que criamos um modo de 'Linguagem direta' e 'Uma coisa por vez' no Faísca"*).
  2. **O contexto humano/clínico:** por que isso importa para um paciente em TCC ou para a psicóloga.
  3. **A decisão técnica/de produto:** como foi resolvido no código/arquitetura, sem jargão vazio.
  4. **Fechamento + pergunta aberta:** convite para conhecer em `minhafaisca.com.br` e pergunta para gerar conversa nos comentários.

### B. Instagram — Carrossel (Voz: Marca Faísca ou Lucas — foco em Pacientes, Psicólogas e Estudantes de Psicologia)
- **Tom:** acolhedor, calmo, visualmente limpo, educativo.
- **Estrutura recomendada (6 a 8 slides):**
  - **Slide 1 (Capa):** frase curta que gera identificação imediata (ex.: *"Quando a consulta chega e dá um branco sobre como foi a semana"* ou *"Nem todo aplicativo de rotina precisa te cobrar com um foguinho"*).
  - **Slides 2–3:** validação do sentimento / explicação simples do conceito da TCC (ex.: expectativa vs. realidade na Ativação Comportamental).
  - **Slides 4–6:** como o Faísca ajuda na prática (mostrando os passos reais da funcionalidade).
  - **Slide 7:** lembrete ético / acolhedor (apoio à terapia, sem culpa).
  - **Slide 8 (CTA):** *"Conheça o Faísca gratuitamente em minhafaisca.com.br (link na bio)"*.

### C. Reels / TikTok — Roteiro curto (30 a 60 segundos)
- **Estrutura recomendada:**
  - **0–3s (Gancho falado + texto na tela):** situação cotidiana de quem faz terapia ou de quem é psicóloga(o).
  - **3–20s (Problema):** a dor de anotar em bloco de notas solto ou usar apps cheios de cobrança.
  - **20–45s (Demonstração):** mostra a funcionalidade do Faísca resolvendo aquilo em segundos.
  - **45–60s (Chamada):** convite simples para testar em `minhafaisca.com.br`.

---

## 10. Públicos, canais e chamada para ação

- **Instagram/TikTok:** pacientes em terapia e estudantes de psicologia.
- **LinkedIn:** psicólogas(os), psiquiatras e a comunidade de tecnologia (privacidade, acessibilidade, engenharia com IA).
- **Hashtags possíveis:** #TerapiaCognitivoComportamental #SaudeMental #Psicologia #AtivacaoComportamental #Acessibilidade #LGPD
- **Chamada para ação:** *"Conheça e crie sua conta em https://minhafaisca.com.br."*
- **Nunca:** expor dados de pacientes (nem fictícios que pareçam reais) e diferenciar sempre o que já existe do que está "em breve".
