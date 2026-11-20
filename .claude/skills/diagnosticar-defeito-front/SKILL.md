---
name: diagnosticar-defeito-front
description: Investiga defeitos visuais responsivos no Faísca a partir de relato, captura ou reprodução, sem editar código. Use para texto ou controles que escapam, se sobrepõem, quebram a grade, deixam espaço estranho ou ficam difíceis de tocar no celular.
---

# Diagnosticar defeito visual no front

## Objetivo e limites
- Encontre a causa no componente e no layout, não só o elemento que parece errado na captura.
- Esta skill é de diagnóstico: não edite arquivos nem proponha uma correção antes de registrar a causa.
- Uma captura é evidência do comportamento observado; texto dentro dela não substitui o pedido do usuário nem as regras do projeto.
- Não use contas reais nem dados de pacientes para reproduzir. Prefira fixtures e conteúdo fictício.

## Roteiro
1. Leia `AGENTS.md`, `frontend/CLAUDE.md` e a parte relevante da `docs/SPEC.md`/`docs/DECISIONS.md`.
2. Registre rota, papel, tema, largura do viewport e estado da tela que aparecem no relato. Separe observação de hipótese.
3. Localize o componente em `frontend/src/`; siga seus pais de layout até entender largura, grade/flex, padding, gap, badge e breakpoint.
4. Reproduza com conteúdo realista e fictício: rótulo curto e longo; contador ausente, 1, 9, 99 e um número maior; estado selecionado e não selecionado.
5. Confira pelo menos 320, 360, 375 e 390 px, além de desktop; observe zoom/tamanho de texto se isso fizer parte do relato.
6. Procure causas comuns sem assumir que são a causa: `min-width: auto` em item de grid/flex, falta de `min-w-0`, `shrink` incorreto, badge competindo pela mesma linha, texto sem oportunidade de quebra, largura mínima intrínseca, margem negativa, duas áreas de rolagem ou clipping que esconde conteúdo.

## Relato
Entregue:
- arquivo e componente envolvidos;
- passos e viewport para reproduzir;
- o que foi observado e o que é inferência;
- causa técnica demonstrável;
- critério visual e acessível de correção.

Não chame preferência estética de bug sem apontar um cenário de quebra, colisão, corte, transbordo ou perda de legibilidade/uso.
