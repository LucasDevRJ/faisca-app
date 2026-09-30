# Deploy do Faísca

Passo a passo para colocar o Faísca no ar (DEC-001, DEC-023, DEC-037, DEC-038). Seguido pela
primeira vez em 30/09/2026: os avisos abaixo vêm do que deu errado nesse dia.

Os passos 1 a 6 são feitos **uma vez**, nos painéis. Depois disso, cada merge na `main` faz o deploy
sozinho, depois do CI verde.

```
celular ──► minhafaisca.com.br (Vercel: front + PWA)
                 │  /api/*  (rewrite do vercel.json)
                 ▼
            api.minhafaisca.com.br (Railway: API)  ──►  Postgres (Railway, rede privada)
                 │
                 └──► Resend (e-mails, remetente @minhafaisca.com.br)
```

- **Domínio:** `minhafaisca.com.br` (Registro.br). O app fica na raiz, e a API em `api.`.
- **Região:** US East (Virgínia) no Railway. O Resend escolhe a região sozinho; o nosso ficou em
  São Paulo, como diz o aviso de privacidade.
- **Segredos:** nunca vão para o repositório (regra 4). Guarde-os num gerenciador de senhas.

## 1. Gerar os segredos

Rode no terminal, uma vez para cada valor. Só letras e números: nada que precise de escape numa URL.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Gere quatro: a senha do `faisca_migrator`, a senha do `faisca_app`, o `JWT_SECRET` e o
`LINK_CODE_SECRET`.

## 2. Railway: banco

1. Em [railway.com](https://railway.com), crie um projeto e adicione um **PostgreSQL**
   (*New → Database → PostgreSQL*). Em *Settings → Region* do Postgres, escolha **US East**.
2. **Backups:** no plano Hobby, o Railway **não tem backups** (só no Pro). O Faísca segue sem
   backup, e o aviso de privacidade diz isso (DEC-038). Se um dia o plano mudar, ligue os backups
   e atualize o aviso e a versão dele.
3. **Usuários do banco (DEC-003).** O Railway entrega um superusuário (`postgres`), usado **só
   aqui**, uma vez, e nunca pela aplicação.
   1. Em *Settings → Networking → Public Networking* do Postgres, crie um **TCP Proxy** para a porta
      `5432`. Ele gera um endereço como `xxxxx.proxy.rlwy.net:48213`.
   2. Abra o `psql` pelo Docker, com o endereço e a **porta do proxy** (não a 5432). A senha é o
      valor de `POSTGRES_PASSWORD` em *Variables*; o `PGPASSWORD` e o `DATABASE_PUBLIC_URL` mostram
      só referências (`${{...}}`), não o valor.

      ```sh
      docker run --rm -it postgres:17 psql -h xxxxx.proxy.rlwy.net -p 48213 -U postgres -d railway
      ```

      O banco do Railway é Postgres 18. O aviso de versão do `psql` 17 pode ser ignorado.
   3. Rode, com as senhas do passo 1 (o banco padrão do Railway se chama `railway`):

   ```sql
   CREATE ROLE faisca_migrator LOGIN PASSWORD '<senha do migrator>';
   CREATE ROLE faisca_app LOGIN PASSWORD '<senha do app>';
   ALTER DATABASE railway OWNER TO faisca_migrator;
   REVOKE ALL ON DATABASE railway FROM PUBLIC;
   GRANT CONNECT ON DATABASE railway TO faisca_app;
   ```

   4. Confira com `\du` (aparecem `faisca_app` e `faisca_migrator`) e saia com `\q`.
   5. **Remova o TCP Proxy.** A API fala com o banco pela rede privada, e o banco não precisa ficar
      aberto na internet.

   O resto das permissões vem da migration `0000_init_privileges`, no primeiro deploy.

## 3. Railway: API

1. No mesmo projeto: *New → GitHub Repo → faisca-app*.
2. Em *Settings* do serviço:
   - **Root Directory:** `/backend`
   - **Config file (Railway Config File):** `/backend/railway.json`. O caminho é absoluto, porque o
     arquivo não segue o Root Directory. Ele define o build, o start, o pre-deploy com as migrations
     (`npm run db:deploy`) e o healthcheck em `/health`.
   - **Region:** US East
   - **Branch:** `main`, com **Wait for CI** ligado
3. Em *Variables*, crie:

   | Variável | Valor |
   |---|---|
   | `PORT` | `3333` (**obrigatória**: é a porta do domínio no item 4) |
   | `NODE_ENV` | `production` |
   | `LOG_LEVEL` | `info` |
   | `FRONTEND_URL` | `https://minhafaisca.com.br` |
   | `DATABASE_URL` | `postgresql://faisca_app:<senha do app>@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/railway` |
   | `MIGRATION_DATABASE_URL` | `postgresql://faisca_migrator:<senha do migrator>@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/railway` |
   | `JWT_SECRET` | segredo do passo 1 |
   | `LINK_CODE_SECRET` | outro segredo do passo 1 |
   | `RESEND_API_KEY` | chave de produção do passo 4 |
   | `EMAIL_FROM` | `Faísca <nao-responda@minhafaisca.com.br>` |
   | `TRUST_PROXY_HOPS` | `2` (Vercel + borda do Railway; confirmado no passo 7) |

   - Sem o `PORT`, o Railway põe a API na 8080. O healthcheck passa, mas o domínio (3333) responde
     **502 "Application failed to respond"**. Foi o que aconteceu no primeiro deploy.
   - O `${{Postgres.RAILWAY_PRIVATE_DOMAIN}}` é uma referência do Railway: a API fala com o banco
     pela rede privada, sem sair para a internet.
   - Sem o `NODE_ENV=production`, a API sobe como dev e o cookie sai sem `Secure`. Para conferir de
     fora: `curl -i -X POST https://api.minhafaisca.com.br/auth/logout` mostra o `Set-Cookie`.
4. Em *Settings → Networking → Custom Domain*, adicione `api.minhafaisca.com.br`, com a porta
   **3333**. O Railway mostra um **CNAME** e um **TXT** de verificação (`_railway-verify.api`):
   anote para o passo 5.

## 4. Resend: domínio e chave

1. Em [resend.com](https://resend.com) → *Domains → Add Domain*: `minhafaisca.com.br`. O Resend
   mostra os registros de DNS: um TXT de DKIM em `resend._domainkey` e dois CNAMEs de envio (SPF),
   `send` e `rsend`. Anote para o passo 5. O nome do destino do `rsend` indica a região (`sae1` =
   São Paulo); se não for São Paulo, ajuste o aviso de privacidade.
2. Depois que o domínio aparecer como **Verified**, crie uma chave em *API Keys* com permissão
   **Sending access**, restrita ao domínio `minhafaisca.com.br`. Ela é o `RESEND_API_KEY` do passo 3.
   A chave de dev continua só no seu `backend/.env`.

## 5. Registro.br: DNS

No [registro.br](https://registro.br), no domínio → *DNS → Configurar zona DNS*. Num domínio
recém-comprado, o Registro.br só libera a edição depois de uns **2 horas** ("servidores DNS em
transição"); dá para adiantar o passo 6 enquanto isso. Crie os registros, usando **exatamente** os
valores que cada painel mostrou:

| Nome | Tipo | Valor | Para quê |
|---|---|---|---|
| `api` | CNAME | o destino do Railway (passo 3.4) | API |
| `_railway-verify.api` | TXT | o valor do Railway (passo 3.4) | verificação do domínio da API |
| (vazio / `@`) | A | o IP que a Vercel mostrar (passo 6) | app |
| `www` | CNAME | o destino que a Vercel mostrar (passo 6) | app, com redirecionamento para a raiz |
| `resend._domainkey` | TXT | o valor do Resend | DKIM (e-mails) |
| `send` e `rsend` | CNAME | os destinos do Resend | SPF (e-mails) |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | recomendação para e-mail |

A propagação leva de minutos a algumas horas. O Railway, a Vercel e o Resend mostram quando o domínio
foi reconhecido.

## 6. Vercel: front

1. Em [vercel.com](https://vercel.com) → *Add New → Project → faisca-app*.
2. **Root Directory:** `frontend`. O framework (Vite), o build (`npm run build`) e a saída (`dist`)
   são detectados sozinhos. Não há variáveis de ambiente: o front chama sempre `/api` (DEC-023).
3. Em *Settings → Domains*, adicione `minhafaisca.com.br` e `www.minhafaisca.com.br`. Confira o
   sentido: a **raiz em Production** e o **`www` redirecionando para a raiz**. A Vercel pode sugerir
   o contrário. Os registros que ela mostrar vão para o passo 5.
4. O certificado HTTPS do domínio sai alguns minutos depois de o DNS propagar. Até lá, o navegador
   dá erro de conexão segura.

O `frontend/vercel.json` já cuida do resto:
- `/api/*` vai para `api.minhafaisca.com.br`;
- os caminhos da SPA vão para o `index.html`;
- os cabeçalhos de segurança;
- `ignoreCommand`: **só a `main` gera build**. Um preview de PR usaria a API e o banco de produção.

## 7. Conferir que está tudo certo

- [ ] `https://minhafaisca.com.br/api/health` responde `{"status":"ok",...}`.
- [ ] **`TRUST_PROXY_HOPS`:**
  1. no Railway, mude `LOG_LEVEL` para `debug`;
  2. acesse `https://minhafaisca.com.br/api/health` algumas vezes;
  3. nos logs da API, procure `Proxies na frente da API` nas requisições que **não** são do
     healthcheck (essas têm `0`). O `xForwardedForEntries` delas é o valor certo do
     `TRUST_PROXY_HOPS`. Em 30/09/2026 deu **2**;
  4. ajuste a variável, se for o caso, e volte o `LOG_LEVEL` para `info`.

  Com o valor errado, o rate limit trata todo mundo como uma pessoa só. Quem chama a API direto
  (`api.`) pode forjar esse cabeçalho; por isso o login também tem limite por e-mail (DEC-038).
- [ ] Cadastro com o seu e-mail: o link de confirmação chega e aponta para `https://minhafaisca.com.br`.
- [ ] No navegador (DevTools → Application → Cookies), o cookie `faisca_session` está com
      `HttpOnly`, `Secure` e `SameSite=Lax`.
- [ ] O aviso de privacidade (`/privacidade`) bate com o deploy: sem backup (passo 2.2) e a região
      do Resend (passo 4). Se não bater, ajuste o texto e a versão (DEC-036).
- [ ] **PWA no celular:**
  - Android: Chrome → menu → *Instalar app*;
  - iPhone: Safari → Compartilhar → *Adicionar à Tela de Início*.

  O app abre em tela cheia, e sem internet mostra a tela do app, não dados antigos.
- [ ] Só então avise quem vai usar.

## Depois do primeiro deploy

- **Merge na `main`:**
  - o Railway espera o CI, roda as migrations no pre-deploy e só troca a versão se o healthcheck
    passar. Se a migration falhar, a versão anterior continua no ar;
  - a Vercel publica o front.
- **Logs:** no Railway, os logs da API são JSON do pino, sem dados sensíveis (regra 7). Dá para
  filtrar por `level`.
- **Nunca** rode `db:seed-dev` nem aponte testes para o banco de produção (regra 5).
