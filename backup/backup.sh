#!/bin/sh
# Cópia de segurança do banco (DEC-075): pg_dump com o faisca_backup (só leitura), conferência da
# cópia, criptografia com age e envio para o Cloudflare R2. Roda como cron no Railway, pela rede
# privada. O log mostra só nomes, tamanhos e o SHA-256, nunca dados (regra 7).
#
# A conexão vem das variáveis do libpq (PGHOST, PGUSER, PGPASSWORD, PGDATABASE), e não de uma URL
# nos argumentos: assim a senha não aparece na linha de comando dos processos.
set -eu

: "${PGHOST:?falta PGHOST}"
: "${PGUSER:?falta PGUSER}"
: "${PGPASSWORD:?falta PGPASSWORD}"
: "${PGDATABASE:?falta PGDATABASE}"
RECIPIENT_FILE="${AGE_RECIPIENT_FILE:-/app/age-recipient.txt}"

if [ -z "${BACKUP_OUTPUT_DIR:-}" ]; then
  : "${R2_ENDPOINT:?falta R2_ENDPOINT}"
  : "${R2_BUCKET:?falta R2_BUCKET}"
  : "${R2_ACCESS_KEY_ID:?falta R2_ACCESS_KEY_ID}"
  : "${R2_SECRET_ACCESS_KEY:?falta R2_SECRET_ACCESS_KEY}"
fi

# Uma chave só, e no formato do age: uma linha a mais mandaria a cópia também para outra pessoa.
if [ "$(grep -c . "$RECIPIENT_FILE")" != "1" ] || ! grep -qE '^age1[0-9a-z]+$' "$RECIPIENT_FILE"; then
  echo "backup: $RECIPIENT_FILE precisa ter exatamente uma chave pública age1..." >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

stamp=$(date -u +%Y-%m-%dT%H%MZ)
name="faisca-$stamp.dump.age"

# A rede privada do Railway pode levar alguns segundos para responder quando o cron sobe.
tries=0
until pg_isready -q; do
  tries=$((tries + 1))
  if [ "$tries" -ge 15 ]; then
    echo "backup: o banco não respondeu" >&2
    exit 1
  fi
  sleep 2
done

# A cópia sai do pg_dump direto para o age: em texto claro, ela nunca toca o disco. Uma cópia do
# fluxo passa inteira por um pg_restore que não grava nada, para conferir que ela abre (uma cópia
# que não abre não é cópia). O cat esvazia o resto, para o tee nunca travar. Sem pipefail no sh,
# cada etapa guarda o próprio resultado.
mkfifo "$work/check"
{
  pg_restore --file=/dev/null 2> /dev/null
  status=$?
  cat > /dev/null
  exit "$status"
} < "$work/check" &
check=$!
{
  # Sem dono nem permissões: a restauração cria tudo com quem estiver restaurando.
  pg_dump --format=custom --no-owner --no-privileges || echo fail > "$work/dump-failed"
} | tee "$work/check" | age --encrypt --recipients-file "$RECIPIENT_FILE" --output "$work/$name"

if [ -e "$work/dump-failed" ]; then
  echo "backup: o pg_dump falhou" >&2
  exit 1
fi
if ! wait "$check"; then
  echo "backup: a cópia não abriu no pg_restore" >&2
  exit 1
fi

size=$(($(wc -c < "$work/$name")))
sum=$(sha256sum "$work/$name" | cut -d ' ' -f 1)

if [ -n "${BACKUP_OUTPUT_DIR:-}" ]; then
  # Modo de teste (CI): guarda na pasta em vez de mandar para o R2.
  cp "$work/$name" "$BACKUP_OUTPUT_DIR/"
  echo "backup: $name ($size bytes, sha256 $sum) em $BACKUP_OUTPUT_DIR"
  exit 0
fi

upload() {
  # A chave do R2 vai pela entrada padrão, e não na linha de comando, para não aparecer no ps.
  printf 'user = "%s:%s"\n' "$R2_ACCESS_KEY_ID" "$R2_SECRET_ACCESS_KEY" |
    curl --config - --fail --silent --show-error --retry 3 --proto =https --tlsv1.2 \
      --aws-sigv4 "aws:amz:auto:s3" \
      --header "Content-Type: application/octet-stream" \
      --upload-file "$work/$name" \
      "$R2_ENDPOINT/$R2_BUCKET/$1/$name"
  # O SHA-256 no log permite conferir, antes de restaurar, que a cópia do R2 é a que saiu daqui.
  echo "backup: $1/$name ($size bytes, sha256 $sum) enviado"
}

# Antes do aviso de privacidade que conta da cópia: só a pasta de teste, sem trava, apagada logo
# depois do teste de restauração (DEC-075).
if [ "${BACKUP_TEST_ONLY:-}" = "1" ]; then
  upload test
  exit 0
fi

# 7 diárias e 4 semanais: a expiração e a trava de cada pasta ficam no R2 (docs/DEPLOY.md).
upload daily
if [ "$(date -u +%u)" = "7" ]; then
  upload weekly
fi
