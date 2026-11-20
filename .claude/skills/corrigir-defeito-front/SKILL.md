---
name: corrigir-defeito-front
description: Corrige defeitos de layout responsivo no Faísca depois de identificar a causa, preservando comportamento, acessibilidade e regras visuais do projeto. Use para texto, badges, botões, cartões ou grades que escapam, colidem ou ficam mal dimensionados.
---

# Corrigir defeito visual no front

## Antes da edição
- Leia `AGENTS.md`, `frontend/CLAUDE.md`, a parte relevante de `docs/SPEC.md`/`docs/DECISIONS.md` e, se disponível, o diagnóstico da skill `diagnosticar-defeito-front`.
- Preserve regras e comportamento da tela. Se a correção pedir mudança de regra, atualize SPEC/DECISIONS conforme o fluxo do projeto.
- Use componentes e tokens existentes; não introduza cor, largura ou breakpoint solto sem justificativa.

## Corrigir pela causa
- Corrija o modelo de dimensionamento responsável pelo defeito. Em grid/flex, confira `min-w-0`, largura intrínseca, `shrink`, `wrap`, gaps e padding dos filhos.
- Quando rótulo e contador disputarem uma coluna estreita, deixe o texto ocupar sua própria área e mova o contador para outra linha no celular ou organize-os em colunas com espaço mínimo suficiente.
- Mantenha rótulo e valor legíveis. Não resolva com `overflow-hidden`, corte, elipse, fonte ilegível ou deslocamento fora do cartão sem preservar o conteúdo acessível.
- Preserve nome acessível, foco e alvo de toque de pelo menos 44 px. Badges decorativos continuam `aria-hidden`; o significado do contador fica acessível em texto.

## Conferir a correção
- Confira o menor viewport aplicável (320/360 px), 375/390 px e desktop, com o maior rótulo e contador realistas.
- Confira estado selecionado e não selecionado, tema claro/escuro e texto ampliado quando aplicáveis.
- Adicione ou atualize teste de comportamento sem acoplar o teste a classes CSS. Para geometria e overflow, prefira conferência visual no navegador em vez de alegar que jsdom calculou layout.
- Rode as verificações do pacote conforme `finalizar-mudanca`; relate testes não executados e falhas preexistentes sem escondê-los.
- Atualize as orientações de diagnóstico quando a correção revelar uma classe recorrente de defeito; não replique regras em vários arquivos se um link para a skill bastar.
