#!/bin/zsh
set -euo pipefail
umask 077

qr_root='/Users/marianosylvester/Downloads/sur-patagonia-main 2/_codex_blindaje_qr_v19_final'
qr_image='/Users/marianosylvester/Documents/SurPatagonian/QR-Backup-PROD-2026-09-29/qr-prod-2026-09-29.sparsebundle'
qr_volume='/Volumes/SP-QR-PROD-2026-09-29'
qr_backup="$qr_volume/qr-prod-baseline-2026-09-29.dump"
qr_manifest="${qr_backup}.sha256"
qr_cycle_file="$qr_volume/qr-prod-cycle-v19.txt"
qr_psql='/Applications/Postgres.app/Contents/Versions/latest/bin/psql'
qr_restore='/Applications/Postgres.app/Contents/Versions/latest/bin/pg_restore'
qr_dsn='postgresql://postgres@db.wajkfydxutptcvvfwrvq.supabase.co:5432/postgres?sslmode=require'

if [[ ! -d "$qr_volume" ]] || ! hdiutil info | grep -F "image-path      : $qr_image" >/dev/null \
  || ! hdiutil info | grep -F -A12 "image-path      : $qr_image" | grep -F 'image-encrypted : TRUE' >/dev/null; then
  print -u2 'ERROR: el volumen productivo exacto no está montado y cifrado.'
  exit 1
fi
if [[ ! -f "$qr_backup" || ! -f "$qr_manifest" || -e "$qr_cycle_file" ]]; then
  print -u2 'ERROR: falta el respaldo base verificado o ya se ejecutó un ciclo; no se instaló nada.'
  exit 1
fi
if ! /usr/bin/shasum -a 256 -c "$qr_manifest" >/dev/null; then
  print -u2 'ERROR: la huella del respaldo no coincide.'
  exit 1
fi
"$qr_restore" -l "$qr_backup" >/dev/null
for qr_table in canales referencias visitas contactos personas crm_eventos mensajes destino_asignaciones; do
  if ! "$qr_restore" -l "$qr_backup" | grep -E "TABLE DATA public ${qr_table} " >/dev/null; then
    print -u2 "ERROR: el respaldo no contiene la tabla de datos ${qr_table}."
    exit 1
  fi
done

qr_keyset=$(security find-generic-password -a marianosylvester -s 'surpatagonian-qr-prod-runtime-v19' -w)
qr_kid=$(print -r -- "$qr_keyset" | /usr/bin/jq -er '.kid')
qr_assertion=$(print -r -- "$qr_keyset" | /usr/bin/jq -er '.assertion')
unset qr_keyset
if [[ ! "$qr_kid" =~ '^[A-Za-z0-9_-]{1,32}$' || ! "$qr_assertion" =~ '^[0-9a-f]{64}$' ]]; then
  print -u2 'ERROR: claves productivas inválidas; no se instaló nada.'
  exit 1
fi

print 'Respaldo cifrado validado. Se preparará exclusivamente wajkfydxutptcvvfwrvq en modo compatible.'
print 'Ingresá la contraseña de la BASE DE DATOS de producción; no es la API key.'
read -s 'qr_db_password?Contraseña de base producción: '
print
if [[ -z "$qr_db_password" ]]; then
  print -u2 'ERROR: contraseña vacía; no se instaló nada.'
  exit 1
fi
export PGPASSWORD="$qr_db_password" PGCONNECT_TIMEOUT=20 PGAPPNAME='qr-prod-v19-forward'
unset qr_db_password
trap 'unset PGPASSWORD qr_assertion qr_secret_sql' EXIT

qr_cycle_id=$(/usr/bin/uuidgen | /usr/bin/tr 'A-F' 'a-f')
if [[ ! "$qr_cycle_id" =~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' ]]; then
  print -u2 'ERROR: no se pudo generar un identificador v4.'
  exit 1
fi

# El secreto viaja a psql solo por stdin, nunca por argumentos ni por archivos.
qr_secret_name="qr_worker_assertion_v1/prod/${qr_kid}"
qr_secret_sql="DO \$qr_vault\$ BEGIN
  IF EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='${qr_secret_name}') THEN
    IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='${qr_secret_name}' AND decrypted_secret='${qr_assertion}') THEN
      RAISE EXCEPTION 'QR_PROD_ASSERTION_SECRET_CONFLICT';
    END IF;
  ELSE
    PERFORM vault.create_secret('${qr_assertion}','${qr_secret_name}','Blindaje QR producción v1.9');
  END IF;
END \$qr_vault\$;"
print -r -- "$qr_secret_sql" | "$qr_psql" -X -w -q -v ON_ERROR_STOP=1 \
  -v VERBOSITY=terse -v SHOW_CONTEXT=never -d "$qr_dsn" >/dev/null
unset qr_assertion qr_secret_sql

"$qr_psql" -X -w -v ON_ERROR_STOP=1 -d "$qr_dsn" \
  -v qr_project_ref='wajkfydxutptcvvfwrvq' -v qr_environment='prod' \
  -v "qr_cycle_id=${qr_cycle_id}" -v "qr_assertion_kid=${qr_kid}" \
  -f "$qr_root/worker/qr/sql/package-prod-forward.sql"

print -r -- "$qr_cycle_id" > "$qr_cycle_file"
unset PGPASSWORD
print "PROD_FORWARD_COMPATIBILITY_PASS cycle=${qr_cycle_id}"
print 'El frontend público NO se activó; el QR anterior sigue vigente hasta fusionar el PR.'
