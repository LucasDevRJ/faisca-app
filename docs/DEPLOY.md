# Deploy do Faísca

Passo a passo para colocar o Faísca no ar (DEC-001, DEC-023, DEC-037). Os passos 1 a 6 são feitos
**uma vez**, nos painéis. Depois disso, cada merge na `main` faz o deploy sozinho, depois do CI verde.

```
celular ──► minhafaisca.com.br (Vercel: front + PWA)
                 │  /api/*  (rewrite do vercel.json)
                 ▼
            api.minhafaisca.com.br (Railway: API)  ──►  Postgres (Railway, rede privada)
                 │
                 └──► Resend (e-mails, remetente @minhafaisca.com.br)
```

- **Domínio:** `minhafaisca.com.br` (Registro.br). O app fica na raiz, e a API em `api.`.
- **Região:** US East (Virgínia), no Railway e no Resend, como diz o aviso de privacidade.
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
2. **Backups:** na aba *Backups* do Postgres, ligue os backups automáticos (diários, se o plano
   permitir) e anote a **retenção**. Ela entra no aviso de privacidade (DEC-036).
3. **Usuários do banco (DEC-003).** O Railway entrega um superusuário, usado **só aqui**, uma vez,
   e nunca pela aplicação. Na aba *Variables* do Postgres, copie o `DATABASE_PUBLIC_URL` e abra o
   `psql` pelo Docker (não precisa instalar nada além do Docker):

   ```sh
   docker run --rm -it postgres:17 psql "<DATABASE_PUBLIC_URL>"
   ```

   Rode, com as senhas do passo 1 (o banco padrão do Railway se chama `railway`):

   ```sql
   CREATE ROLE faisca_migrator LOGIN PASSWORD '<senha do migrator>';
   CREATE ROLE faisca_app LOGIN PASSWORD '<senha do app>';
   ALTER DATABASE railway OWNER TO faisca_migrator;
   REVOKE ALL ON DATABASE railway FROM PUBLIC;
   GRANT CONNECT ON DATABASE railway TO faisca_app;
   ```

   Saia com `\q`. O resto das permissões vem da migration `0000_init_privileges`, no primeiro deploy.

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
   | `NODE_ENV` | `production` |
   | `LOG_LEVEL` | `info` |
   | `FRONTEND_URL` | `https://minhafaisca.com.br` |
   | `DATABASE_URL` | `postgresql://faisca_app:<senha do app>@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/railway` |
   | `MIGRATION_DATABASE_URL` | `postgresql://faisca_migrator:<senha do migrator>@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/railway` |
   | `JWT_SECRET` | segredo do passo 1 |
   | `LINK_CODE_SECRET` | outro segredo do passo 1 |
   | `RESEND_API_KEY` | chave de produção do passo 4 |
   | `EMAIL_FROM` | `Faísca <nao-responda@minhafaisca.com.br>` |
   | `TRUST_PROXY_HOPS` | `2` por enquanto; confirmado no passo 7 |

   O `PORT` é o próprio Railway que define. O `${{Postgres.RAILWAY_PRIVATE_DOMAIN}}` é uma
   referência do Railway: a API fala com o banco pela rede privada, sem sair para a internet.
4. Em *Settings → Networking → Custom Domain*, adicione `api.minhafaisca.com.br`. O Railway mostra um
   **CNAME** (e às vezes um TXT de verificação): anote para o passo 5.

## 4. Resend: domínio e chave

1. Em [resend.com](https://resend.com) → *Domains → Add Domain*: `minhafaisca.com.br`, região
   **North Virginia (us-east-1)**. O Resend mostra os registros de DNS (DKIM e SPF, em
   `resend._domainkey` e `send`): anote para o passo 5.
2. Depois que o domínio aparecer como **Verified**, crie uma chave em *API Keys* com permissão
   **Sending access**, restrita ao domínio `minhafaisca.com.br`. Ela é o `RESEND_API_KEY` do passo 3.
   A chave de dev continua só no seu `backend/.env`.

## 5. Registro.br: DNS

No [registro.br](https://registro.br), no domínio → *DNS → Configurar zona DNS* (se pedir, ative o
modo avançado e aguarde alguns minutos). Crie os registros, usando **exatamente** os valores que cada
painel mostrou:

| Nome | Tipo | Valor | Para quê |
|---|---|---|---|
| `api` | CNAME | o destino do Railway (passo 3.4) | API |
| (vazio / `@`) | A | o IP que a Vercel mostrar (passo 6) | app |
| `www` | CNAME | o destino que a Vercel mostrar (passo 6) | app, com redirecionamento para a raiz |
| `resend._domainkey` | TXT | o valor do Resend | DKIM (e-mails) |
| `send` | MX e TXT | os valores do Resend | SPF (e-mails) |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | recomendação para e-mail |

A propagação leva de minutos a algumas horas. O Railway, a Vercel e o Resend mostram quando o domínio
foi reconhecido.

## 6. Vercel: front

1. Em [vercel.com](https://vercel.com) → *Add New → Project → faisca-app*.
2. **Root Directory:** `frontend`. O framework (Vite), o build (`npm run build`) e a saída (`dist`)
   são detectados sozinhos. Não há variáveis de ambiente: o front chama sempre `/api` (DEC-023).
3. Em *Settings → Domains*, adicione `minhafaisca.com.br` e `www.minhafaisca.com.br`, com o `www`
   redirecionando para a raiz. Os registros que a Vercel mostrar vão para o passo 5.

O `frontend/vercel.json` já cuida do resto:
- `/api/*` vai para `api.minhafaisca.com.br`;
- os caminhos da SPA vão para o `index.html`;
- os cabeçalhos de segurança;
- `ignoreCommand`: **só a `main` gera build**. Um preview de PR usaria a API e o banco de produção.

## 7. Conferir que está tudo certo

- [ ] `https://minhafaisca.com.br/api/health` responde `{"status":"ok",...}`.
- [ ] **`TRUST_PROXY_HOPS`:**
  1. no Railway, mude `LOG_LEVEL` para `debug`;
  2. abra o app no celular e entre;
  3. nos logs da API, procure `Proxies na frente da API` nas requisições que **não** são do
     healthcheck. O `xForwardedForEntries` delas é o valor certo do `TRUST_PROXY_HOPS`;
  4. ajuste a variável e volte o `LOG_LEVEL` para `info`.

  Com o valor errado, o rate limit trata todo mundo como uma pessoa só.
- [ ] Cadastro com o seu e-mail: o link de confirmação chega e aponta para `https://minhafaisca.com.br`.
- [ ] No navegador (DevTools → Application → Cookies), o cookie `faisca_session` está com
      `HttpOnly`, `Secure` e `SameSite=Lax`.
- [ ] O aviso de privacidade (`/privacidade`) diz a retenção real dos backups (passo 2.2). Se não
      disser, ajuste o texto e a versão (DEC-036).
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
