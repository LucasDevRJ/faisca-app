# Cópia de segurança do banco (DEC-075). O pg_dump precisa ser da mesma versão do Postgres do
# Railway (18) ou mais nova.
# Imagem fixada pelo digest: uma troca no registro não muda o que roda com leitura no banco todo.
FROM postgres:18-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5

RUN apk add --no-cache age curl

WORKDIR /app
COPY backup.sh age-recipient.txt ./
RUN chmod +x backup.sh

USER postgres
ENTRYPOINT ["/app/backup.sh"]
