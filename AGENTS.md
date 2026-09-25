# Faísca — guia para agentes

PWA do Registro de Ativação (TCC). Requisitos em `docs/SPEC.md`; decisões e motivos
em `docs/DECISIONS.md`. Leia os dois antes de mudanças que envolvam regra de negócio.

## Stack
- **frontend/**: React 19, Vite, TypeScript, Tailwind CSS v4, React Router, TanStack Query, Recharts, Axios, PWA
- **backend/**: Node.js, Express, TypeScript, Zod, Prisma, PostgreSQL, JWT (cookie httpOnly), Resend, web-push, node-cron
- **tests/**: Playwright (API e E2E), com foco em autorização
- CI no GitHub Actions; deploy do front na Vercel e do back no Railway

## Estrutura
- `backend/`, `frontend/` e `tests/` têm `package.json` próprios (sem workspaces).
- `docs/`: SPEC e DECISIONS.

## Comandos
Backend (rodar dentro de `backend/`; detalhes em `backend/README.md`):
- `npm run dev`: API em modo dev (porta 3333)
- `npm run lint` · `npm run typecheck` · `npm test`: rodar ao terminar uma mudança
- `npm run build`: compila para `dist/`
- `npm run db:up`: sobe o Postgres local (Docker)
- `npm run db:migrate`: nova migration em dev · `npm run db:deploy`: aplica as pendentes

Frontend (rodar dentro de `frontend/`; detalhes em `frontend/README.md`):
- `npm run dev`: app em http://localhost:5173, com `/api` repassado para a API (DEC-023)
- `npm run lint` · `npm run typecheck` · `npm test`: rodar ao terminar uma mudança
- `npm run build` · `npm run preview`: build com service worker e servidor local para testá-lo

`tests/`: preencher quando for criado.

## Regras invioláveis
1. **Autorização no backend.** No contexto de terapeuta, só GET e só de pacientes com vínculo
   ativo; qualquer outro caso retorna 403. No contexto de paciente, só os próprios dados.
   Toda rota nova com dado de paciente precisa de teste de autorização (caso permitido e negado).
2. **Registros finais são imutáveis.** Editar ou excluir atividade CONCLUIDA ou NAO_REALIZADA retorna 409.
3. **Notificações neutras.** Push e e-mail de lembrete nunca contêm nome de atividade, notas ou observações.
4. **Sem segredos no repositório.** Nunca commitar `.env`. Variável nova vai para o `.env.example`
   com placeholder.
5. **Sem dados reais.** Seeds, fixtures e testes usam apenas dados fictícios.
6. **Menor privilégio no banco.** A API usa `faisca_app` (DML); migrações usam `faisca_migrator` (DDL).
   Nunca o superusuário.
7. **Logs sem dados sensíveis.** Não logar senhas, tokens, códigos de vínculo, nomes de atividade,
   notas ou observações.
8. **Segredos de vínculo só como hash.** Tokens de convite e códigos de vínculo nunca são guardados em texto.

## Convenções
- Identificadores de código em inglês (`Activity`, `activityDate`); valores de estado do domínio
  como na SPEC (`PLANEJADA`, `CONCLUIDA`...); textos de interface em pt-BR.
- Documentação, comentários e commits em pt-BR.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), commits pequenos.
- Uma branch por etapa (`feat/...`, `fix/...`, `docs/...`) e PR para a `main`.
- Fuso America/Sao_Paulo; timestamps em UTC; `activityDate` como DATE.
- Requisito mudou → atualize `docs/SPEC.md`. Decisão mudou → nova entrada em `docs/DECISIONS.md`.
