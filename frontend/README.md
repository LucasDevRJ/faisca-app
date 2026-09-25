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
- em produção, o `vercel.json`, que repassa `/api/*` para o Railway.

Assim o cookie de sessão é first-party e não cai no bloqueio de cookies de terceiros.
**No deploy:** troque `CHANGE-ME.up.railway.app` no `vercel.json` pela URL real da API.

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
├─ components/ui/  componentes visuais básicos (Button, Card)
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
