---
name: nova-tela
description: Guia para criar ou alterar telas do front do Faísca (frontend/src) — página, janela (Dialog), formulário ou cartão — com quem vê cada coisa (paciente ou terapeuta só leitura), aceite do aviso de privacidade, tokens e paletas, acessibilidade, celular, testes de tela e conferência no navegador com as contas fictícias. Use sempre que for mexer no que a pessoa vê, mesmo que o pedido não diga "tela" — por exemplo "mostra X para a psicóloga", "coloca um botão para…", "a pessoa precisa conseguir…", "muda o texto de…".
---

# Nova tela

Siga os passos em ordem. As regras vêm do AGENTS.md e do frontend/CLAUDE.md; em caso de dúvida,
eles prevalecem sobre esta skill.

## 1. Antes de codar
- Leia a seção da `docs/SPEC.md` e as DECs do assunto. Comportamento não definido → pergunte.
- Decida **quem vê**: paciente, terapeuta ou os dois. A visão da terapeuta é **só leitura**: sem
  botão que mude dado do paciente; a única ação dela é o "Lido" (DEC-057). A interface não é
  barreira de segurança: o 403 é da API.
- Área nova com dado de saúde precisa do **aceite** do aviso de privacidade: `PrivacyConsentGate`
  (no lugar da área, ou numa janela com `onCancel`) e `PrivacyUpdateBanner`
  (`features/auth/privacy-consent.tsx`). Texto novo no aviso → versão nova (DEC-042), exceto
  dado que não é de saúde (DEC-055, DEC-061).

## 2. Onde fica cada coisa
- `pages/`: a rota; `features/<area>/`: componentes, `<area>-api.ts` e `use-<area>.ts`;
  `components/ui/`: peças comuns.
- Rota nova no `app/router.tsx`, dentro do `RequireProfile` certo (paciente ou terapeuta).
- Modelos: `features/actions/` e `pages/actions-page.tsx` (paciente); `pages/patient-page.tsx`
  (terapeuta).

## 3. Dados da API
- Chamadas pelo `api` de `lib/api.ts` (cookie httpOnly). Nunca guarde token nem dado de saúde
  no aparelho; `localStorage` só para preferência visual (tema, paleta).
- O front nunca manda id de usuário: a API usa a sessão.
- TanStack Query com uma chave por área; toda gravação recarrega a lista, mesmo depois de erro
  (`useActionMutation` em `features/actions/use-actions.ts`). 403 não é repetido
  (`retryUnlessForbidden`).
- Erros com `getApiError(error).message`; erro de campo em `.fields`.

## 4. Visual
- Só tokens (`bg-surface`, `text-muted`, `text-primary-text`...). Nada de cor solta: as cinco
  paletas e os dois temas trocam só os tokens (DEC-063, DEC-068).
- Campos: `TextField`/`TextAreaField` (com `limit` em texto longo, sem `maxLength`),
  `fieldClasses`, `choiceCardClasses` e `FieldError` (DEC-059). Botões: `Button`/`buttonClasses`.
- Janelas: `Dialog` + `DialogFooter`; `size="wide"` só para conteúdo grande (ex.: foto).
- Notas 0–10 numa cor só, nunca vermelho e verde. Texto livre longo nos cartões: `LongText`.

## 5. Tom
- Acolhedor e sem culpa: "Conta como foi?", "Tudo bem, quer contar o que aconteceu?".
- Nada de cobrança, contador ou "faltam X" (frontend/CLAUDE.md). Parabéns por algo cumprido só
  entra com a #107, que muda essa regra com uma DEC nova.

## 6. Acessibilidade
- Todo campo com rótulo; grupo de opções em `fieldset`/`legend`.
- Aviso com `role="status"` (sempre montado, troca o texto); erro com `role="alert"`.
- Foco no lugar certo: ao abrir janela, depois de salvar, remover ou aceitar (o botão que abriu
  pode sumir).
- Imagem decorativa com `alt=""`; ícone ao lado de texto com `aria-hidden`.
- Alvo de toque com 44 px (`min-h-11`); cursor de clique vem do `index.css`.
- Animação respeita "menos movimento" (`motion-reduce:`).

## 7. Celular
- Confira em 375 px: sem rolagem lateral, `break-words` em nome e texto do usuário.
- Vários botões: grade de 2 colunas no celular (o `DialogFooter` já faz).

## 8. Testes de tela (Vitest)
- `renderRoute('/caminho')` e o MSW de `test/server.ts` (`loggedIn`, `fakeUser`, `server.use`).
- Busque por papel e nome (`getByRole('button', { name })`), não por classe.
- Casos: o fluxo principal; sem o aceite; paciente e terapeuta, se os dois veem; erro da API.
- Dados fictícios (regra 5). Campo novo num tipo → atualize todas as fixtures que o usam.

## 9. Conferir no navegador
- Suba API e front pelo `.claude/launch.json` (`npm run db:deploy` antes, se houver migration).
- Teste como **paciente** e como **terapeuta**, com as contas fictícias de
  `backend/scripts/seed-dev.ts`, no computador e no celular, no tema claro e no escuro.
- Nunca entre nas contas reais em produção: passe ao usuário um roteiro do que testar.

## 10. Fechamento
- `revisor-telas` (e `revisor-regras` se mexeu no backend); aplique ou discuta as ressalvas.
- Siga a skill `finalizar-mudanca`. Funcionalidade nova no ar → atualize `docs/APRESENTACAO.md`.

## Armadilhas conhecidas
- O MSW não lê `File`/`Blob` do jsdom: no envio de arquivo, espie a chamada do `api`
  (`vi.spyOn(api, 'post')`).
- Suíte cheia com os servidores locais ligados estoura o tempo de alguns testes: rode o arquivo
  sozinho antes de concluir que é erro, e relate como instabilidade.
- `setState` direto num `useEffect` quebra o lint (`react-hooks/set-state-in-effect`): mude o
  estado no evento (ex.: `onSuccess`) e use o efeito só para o DOM (foco).
- Texto `sr-only` dentro de link ou botão: busque o nome com expressão regular no teste.
- Componente de biblioteca que não roda no jsdom (ex.: recorte de imagem): troque por um falso
  com `vi.mock` que chama o callback **uma vez só**, senão a tela entra em ciclo.
