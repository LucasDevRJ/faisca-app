---
name: nova-decisao
description: Guia para registrar uma decisão no docs/DECISIONS.md do Faísca — quando precisa de DEC, como achar o próximo número sem colidir com PRs abertos, o formato (Decisão, Motivo, Limite conhecido), nunca editar uma DEC antiga e o que acompanha (SPEC, Adiado/Em aberto, aviso de privacidade). Use sempre que uma mudança envolver regra de negócio, comportamento de produto, arquitetura, schema, privacidade ou deploy, ou quando pedirem "registra a decisão", "cria a DEC", "atualiza o DECISIONS".
---

# Nova decisão (DEC)

O `docs/DECISIONS.md` guarda o **porquê** de cada escolha; a `docs/SPEC.md` guarda o **o quê**. O
CLAUDE.md manda: requisito mudou → SPEC; decisão mudou → nova entrada no DECISIONS.

## 1. Precisa de DEC?
**Sim:** regra de negócio ou comportamento que a pessoa vê; arquitetura ou contrato da API;
schema do banco; privacidade e LGPD; deploy e processo de produção; textos com peso clínico.

**Não:** ferramenta de desenvolvimento (skill, hook, subagente, CI que não muda o app), refatoração
sem mudança de comportamento, correção de bug que só faz o código cumprir uma DEC que já existe.

Na dúvida, pergunte ao usuário. Se o que vai ser decidido **não está definido** na SPEC nem nas
DECs, debata antes (opções, prós e contras, recomendação) e só escreva depois da aprovação.

## 2. O próximo número
```bash
grep -o "^## DEC-[0-9]*" docs/DECISIONS.md | tail -1
gh pr list --state open --json number,title,headRefName
```
Uma etapa grande reserva números na proposta (ex.: DEC-054 para a API e DEC-055 para as telas).
Confira se algum PR aberto já usa o próximo número (`gh pr diff <n> -- docs/DECISIONS.md`) antes de
pegá-lo.

## 3. Formato
A entrada vai **antes de `## Adiado`**, em pt-BR:
```markdown
## DEC-0xx — Título curto e concreto
- **Decisão:**
  - o que foi decidido, em tópicos, com nomes de rota, campo ou tela quando ajudar (issue #N);
  - o comportamento nas bordas (o que acontece quando…);
  - o que esta DEC muda numa anterior: "muda o detalhe X da DEC-040".
- **Motivo:** por que esta opção, e não as outras; o que pesou (o usuário, a psicóloga, a LGPD,
  o custo).
- **Limite conhecido:** (se houver) o que fica de fora ou o caso que ainda escapa.
```
- **Nunca edite uma DEC antiga**, nem para corrigir: a nova diz o que mudou e cita a anterior.
  O histórico é parte do TCC.
- Não atribua a escolha ao usuário quando ela foi uma recomendação aceita: descreva o motivo.

## 4. O que acompanha
- **SPEC:** o requisito novo ou alterado, citando a DEC entre parênteses.
- **Adiado / Em aberto** (fim do DECISIONS): tire o que foi resolvido; acrescente o que ficou para
  depois.
- **Dado novo coletado:** nova versão do aviso de privacidade, com área própria se for o caso
  (`backend/src/modules/auth/privacy.ts` e `frontend/src/pages/privacy-page.tsx`, DEC-042).
- **Issue:** cite-a na DEC; o PR fecha a issue com `Closes #N`.

## 5. Fechar
A DEC vai **no mesmo PR** da mudança, nunca depois. Siga a skill `finalizar-mudanca`.
