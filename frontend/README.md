# Faísca — frontend

PWA do Faísca: React 19, Vite 8, TypeScript, Tailwind CSS 4, React Router 8, TanStack Query e Axios.
Regras de segurança, visual e tom em [`CLAUDE.md`](CLAUDE.md); requisitos em [`../docs/SPEC.md`](../docs/SPEC.md).

## Rodando localmente

Pré-requisito: Node 24 e a API rodando (ver [`../backend/README.md`](../backend/README.md)).

```bash
cp .env.example .env     # o padrão já aponta para a API em localhost:3333
npm install
npm run dev              # http://localhost:5173
```

## Como o front fala com a API (DEC-023)

O front chama sempre **`/api/...` no próprio domínio**. Quem repassa para a API é:
- em dev, o proxy do Vite (`vite.config.ts`, destino em `API_PROXY_TARGET`);
- em produção, o `vercel.json`, que repassa `/api/*` para `api.minhafaisca.com.br` (Railway).

Assim o cookie de sessão é first-party e não cai no bloqueio de cookies de terceiros.
O `vercel.json` também define os cabeçalhos de segurança e só gera build da `main`.
Passo a passo do deploy: `docs/DEPLOY.md`.

## Sessão e telas de conta (DEC-025, DEC-027)

- Quem está logado vem de `useSession()` (`GET /api/auth/me`); `data` é `null` sem sessão.
- `RequireAuth` protege as telas de quem entrou; `GuestOnly`, as de entrar, cadastro e "esqueci a senha".
  Eles só evitam telas vazias: quem protege os dados é o backend.
- Rotas em pt-BR: `/entrar`, `/cadastro`, `/verifique-seu-email`, `/confirmar-email`,
  `/esqueci-a-senha` e `/redefinir-senha`. As duas com token são as dos links dos e-mails.
- Para testar o cadastro de verdade em dev, a API precisa da chave do Resend no `backend/.env`.
  Sem domínio próprio, o e-mail só chega para o dono da conta do Resend.

## Atividades e consultas (DEC-028, DEC-029, DEC-030)

- `/` leva a `/registros` (paciente) ou a `/pacientes` (só terapeuta). `RequireProfile` guarda
  cada tela pelo perfil; só quem tem os dois perfis vê a alternância no topo.
- `/registros?semana=AAAA-MM-DD` é a semana de segunda a domingo. Sem `semana`, a semana atual.
- Tudo de atividades fica em `src/features/activities/`: chamadas à API, hooks do TanStack Query
  (toda gravação recarrega as semanas em memória), cálculo da semana no fuso de São Paulo,
  card, dialogs e gráfico.
- Formulários em `<dialog>` nativo (`components/ui/dialog.tsx`); notas no `ScoreField` (slider
  de 0 a 10 que começa sem valor escolhido).
- Consultas (DEC-030) em `src/features/appointments/`: card de próxima/última consulta no topo de
  `/registros`, página `/consultas` e selo "consulta" no dia da semana.

## Vínculo (DEC-031, DEC-032)

- Tudo em `src/features/links/`: chamadas a `/link` e `/links`, hooks, a seção "Minha terapeuta",
  os dialogs de convite e de desfazer, o aviso de novo vínculo e o campo de código.
- `/conta`: "Minha terapeuta" (só para quem é paciente) e "Perfis". `/pacientes`: campo de código e
  lista de vinculados. `/convite`: aberta pelo link do e-mail, com ou sem sessão.
- O token do convite passa por `/convite`, `/entrar` e `/cadastro` no state da navegação
  (`features/links/invite-state.ts`), nunca na URL nem no storage.
- Para ver os dois lados em dev, use a terapeuta fictícia do `npm run db:seed-dev` (backend/README).

## Scripts

| Script | O que faz |
|---|---|
| `dev` | servidor de desenvolvimento com o proxy de `/api` |
| `build` / `preview` | build de produção (com o service worker) e servidor local para testá-lo |
| `lint` / `typecheck` | ESLint e checagem de tipos (app, configs e service worker) |
| `test` / `test:watch` | Vitest + Testing Library, com a API simulada pelo MSW |
| `icons` | regera os PNGs do PWA a partir do `public/icon.svg` |

## Estrutura

```
src/
├─ app/            router, providers (Query + tema), contexto do tema
├─ components/ui/  componentes visuais básicos (Button, Card, TextField, Alert, Dialog, ScoreField)
├─ features/       código por funcionalidade (hooks de dados, componentes)
├─ lib/            cliente HTTP (api.ts) e QueryClient
├─ pages/          telas ligadas às rotas
├─ styles/         index.css com os tokens do @theme
├─ test/           setup do Vitest e servidor MSW
└─ sw.ts           service worker do PWA
```

## Tema e tokens

- As cores ficam só em `src/styles/index.css`. A paleta padrão do Tailwind está desligada
  (`--color-*: initial`), então classes como `bg-red-500` não existem. Use `bg-surface`,
  `text-muted`, `bg-primary`, `bg-score-0`…`bg-score-10` etc.
- Cada cor usa `light-dark(claro, escuro)`. Sem escolha salva, segue o tema do sistema;
  o `ThemeSwitcher` grava `light`/`dark` no `localStorage` (só a preferência visual).
- O contraste WCAG AA foi conferido nos dois temas. Ao mudar uma cor, confira de novo.

## PWA

- O `src/sw.ts` faz precache **só do shell** (JS, CSS, HTML, ícones e fontes latinas) e
  nunca guarda respostas de `/api`. O Web Push entra nesse arquivo na etapa de lembretes.
- O service worker só existe no build (`npm run build && npm run preview`), não no `dev`.
- O ícone atual é provisório. Para trocar, substitua o `public/icon.svg` e rode `npm run icons`.

## Observações de versões

- **TypeScript fixado em `~6.0`**, pelo mesmo motivo do backend (typescript-eslint).
- **`allowScripts`**: o script de instalação do `msw` está negado. Ele só copia um worker para
  uso no navegador, e aqui o MSW roda apenas nos testes (Node).
