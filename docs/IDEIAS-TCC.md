# Ideias de atividades da TCC para evolução do Faísca

Este documento reúne técnicas clássicas da **Terapia Cognitivo-Comportamental (TCC)** planejadas para entrar no Faísca em etapas futuras, conectando cada uma com a estrutura atual do aplicativo (**Ciclo da consulta**, grade 2×2 de abas no celular, visão somente leitura da psicóloga com **"Para ler"**, acessibilidade e as 8 regras invioláveis do `AGENTS.md`).

> **Importante:** nada neste documento está em produção ainda. Quando uma funcionalidade começar a ser implementada, suas regras definitivas devem ir para `docs/SPEC.md` e `docs/DECISIONS.md` (e, quando entrar no ar, para `docs/APRESENTACAO.md` e `docs/BRIEFING-IA.md`).

---

## Como todas as 7 se encaixam sem poluir a tela

Hoje a tela de registros tem **4 abas principais** (grade 2×2 no celular: **Atividades | Pensamentos | Tensão | Ação**). Para manter a interface calma, acolhedora e acessível, as 7 técnicas se dividem em **3 grupos**:

1. **Grupo 1 — Evoluções das abas que já existem** (sem criar aba nova no ciclo);
2. **Grupo 2 — Ferramentas permanentes de apoio** (consultadas/atualizadas aos poucos, como o *"Sobre mim"*, fora das abas diárias);
3. **Grupo 3 — Exercícios estruturados sob demanda** (acionados quando surge uma situação específica no ciclo).

| # | Técnica da TCC | Onde se encaixa no Faísca | Issue |
|---|---|---|---|
| 1 | **Experimento Comportamental** | Integrado a **Ação** (ou conectado ao **RPD**) | [#156](https://github.com/LucasDevRJ/faisca-app/issues/156) |
| 2 | **Evidências a favor/contra e Seta Descendente** | Passo opcional dentro de **Pensamentos (RPD)** | [#157](https://github.com/LucasDevRJ/faisca-app/issues/157) |
| 3 | **Registro de Dados Positivos** | Registro rápido do dia junto a **Atividades / Ação** | [#161](https://github.com/LucasDevRJ/faisca-app/issues/161) |
| 4 | **Plano de Autocuidado e Prevenção de Recaída** | Ferramenta permanente em **Conta** (junto ao *"Sobre mim"*) | [#162](https://github.com/LucasDevRJ/faisca-app/issues/162) |
| 5 | **Cartões de Enfrentamento (*Coping Cards*)** | Ferramenta permanente de consulta rápida + atalho a partir do **RPD** | [#158](https://github.com/LucasDevRJ/faisca-app/issues/158) |
| 6 | **Escada de Enfrentamento (Exposição Gradual)** | Lista permanente de degraus + tentativas registradas no **Ciclo** | [#160](https://github.com/LucasDevRJ/faisca-app/issues/160) |
| 7 | **Resolução de Problemas Passo a Passo** | Exercício guiado sob demanda no **Ciclo** | [#159](https://github.com/LucasDevRJ/faisca-app/issues/159) |

---

## Grupo 1 — Evoluções diretas das abas existentes

### 1. Experimento Comportamental (#156)
- **Base na TCC:** testar na prática a validade de um pensamento ou previsão negativa/ansiosa.
- **Como funciona:**
  - **Antes (planejar):** qual situação vou enfrentar, qual é a minha previsão (o que receio que aconteça) e **o quanto acredito nessa previsão antes** (0 a 10).
  - **Depois (contar como foi):** o que realmente aconteceu, como lidei com a situação, **o quanto acredito naquela previsão agora** (0 a 10) e o que aprendi (ou **"Não deu desta vez"**, sem culpa).
- **Onde entra:** como um modo ou 4º tipo dentro de **Ação** (ao lado de *Prazer*, *Conexão* e *Realização*) ou vinculado a um **RPD**.

### 2. Evidências a favor e contra + Seta Descendente no RPD (#157)
- **Base na TCC:** quando a pessoa trava para encontrar uma **Explicação alternativa** no RPD, examinar as evidências e o significado do pensamento ajuda a destravar a reestruturação cognitiva.
- **Como funciona:**
  - Campos **100% opcionais** (expansíveis antes da explicação alternativa):
    - *Fatos que apoiam esse pensamento*;
    - *Fatos que mostram outro lado / O que eu diria a um amigo querido*;
    - *Se esse pensamento fosse verdade, o que significaria para mim?* (seta descendente).
- **Onde entra:** dentro do formulário de **Pensamentos (RPD)** e no fluxo de adicionar a explicação alternativa até a próxima consulta (DEC-054).

### 3. Registro de Dados Positivos (#161)
- **Base na TCC:** treinar a atenção para notar pequenos fatos neutros ou positivos do dia que costumam ser ignorados pelo viés negativo na depressão e na ansiedade (Beck).
- **Como funciona:**
  - Registro curto de fim de dia: **O que aconteceu hoje?** (1 a 3 pequenos fatos) e **O que isso mostra sobre mim ou sobre o meu dia?** (opcional).
  - Sem meta diária, sem contagem de dias seguidos (*streaks*) e sem cobrança.
- **Onde entra:** integrado à visão do dia/ciclo em **Atividades** ou **Ação**.

---

## Grupo 2 — Ferramentas permanentes (sempre à mão)

### 4. Plano de Autocuidado e Prevenção de Recaída (#162)
- **Base na TCC:** mapear precocemente os sinais de que a saúde emocional está oscilando e ter à mão estratégias protetoras já validadas em terapia.
- **Como funciona:**
  - Três campos opcionais de texto livre (até 2.000 caracteres cada), editáveis a qualquer momento:
    1. **Meus sinais de alerta** (ex.: mudança no sono, isolamento, irritação);
    2. **O que costuma me fazer bem / me ajudar**;
    3. **Pessoas ou apoios a quem posso recorrer** (com lembrete ético do apoio profissional e do CVV — 188).
- **Onde entra:** em **Conta** (seguindo o mesmo padrão arquitetural do **"Sobre mim"**, DEC-081).

### 5. Cartões de Enfrentamento — *Coping Cards* (#158)
- **Base na TCC:** cartões curtos escritos em momentos de calma para serem lidos quando a ansiedade, a tensão ou o desânimo apertam (quando não é prático preencher um formulário longo).
- **Como funciona:**
  - Cada cartão tem: **Quando eu pensar ou sentir...**, **Quero me lembrar de que...** e **O que posso fazer agora** (opcional).
  - Pode ser criado do zero ou com um toque a partir de uma **Explicação alternativa** salva num RPD.
- **Onde entra:** atalho rápido de leitura em *Meus registros* / *Conta*, com visualização somente leitura para a psicóloga vinculada.

### 6. Escada de Enfrentamento — Exposição Gradual (#160)
- **Base na TCC:** dividir situações evitadas por medo ou ansiedade em degraus ordenados pelo desconforto esperado (0 a 10), enfrentando um degrau por vez até a habituação.
- **Como funciona:**
  - **A escada (permanente):** lista de degraus com nota de desconforto esperado (0 a 10).
  - **Cada tentativa (no ciclo):** registra o degrau praticado no dia, com desconforto **antes**, **máximo na hora** e **depois** (0 a 10) e observação opcional (ou *"Não deu desta vez"*).

---

## Grupo 3 — Exercício estruturado sob demanda

### 7. Resolução de Problemas Passo a Passo (#159)
- **Base na TCC:** transformar problemas práticos que causam paralisia em etapas concretas e testáveis.
- **Como funciona (encaixe direto com "Uma coisa por vez"):**
  1. Qual é o problema?
  2. Ideias do que fazer (sem julgar);
  3. Pontos a favor e pontos difíceis de cada opção (opcional);
  4. Qual pequeno passo vou testar neste ciclo?
  5. Depois: contar como foi (ou registrar que não deu desta vez, sem culpa).

---

## Checklist obrigatório para quando formos implementar qualquer uma delas

- [ ] **Validar os textos com a psicóloga** antes de construir as telas.
- [ ] **Regra 1 (Autorização):** escrita apenas pelo paciente; terapeuta com vínculo ativo tem acesso estritamente `GET` (`403` para qualquer outro método ou sem vínculo), com testes de autorização permitidos e negados.
- [ ] **Regra 2 (Imutabilidade):** registros de ciclo finalizados (concluídos/avaliados ou não realizados) retornam `409` em tentativa de edição ou exclusão.
- [ ] **Regra 3 e 7 (Notificações e Logs):** nunca expor textos dos registros em logs nem em notificações.
- [ ] **Marcação de leitura (DEC-057):** integrar ao **"Para ler"** e ao botão **"Lido"** da terapeuta.
- [ ] **Acessibilidade (DEC-076, DEC-087):** textos com par para **Linguagem direta**, passos divididos para **Uma coisa por vez**, respeito a **Sem pressão de tempo**, **Leitura confortável** e **Menos movimento**.
- [ ] **Privacidade (LGPD, DEC-078):** avaliar versão do aviso de privacidade e matriz de consentimento.
