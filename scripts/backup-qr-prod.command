#!/bin/zsh
set -euo pipefail
umask 077

qr_project='wajkfydxutptcvvfwrvq'
qr_image='/Users/marianosylvester/Documents/SurPatagonian/QR-Backup-PROD-2026-09-29/qr-prod-2026-09-29.sparsebundle'
qr_volume='/Volumes/SP-QR-PROD-2026-09-29'
qr_dump='/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump'
qr_restore='/Applications/Postgres.app/Contents/Versions/latest/bin/pg_restore'
qr_dsn="postgresql://postgres.${qr_project}@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require"
qr_label="${1:-baseline}"

if [[ "$qr_label" != 'baseline' && "$qr_label" != 'postcut' ]]; then
  print -u2 'ERROR: etiqueta inválida; usar baseline o postcut.'
  exit 1
fi
if [[ ! -d "$qr_volume" ]] || ! hdiutil info | grep -F "image-path      : $qr_image" >/dev/null; then
  print -u2 'ERROR: el volumen cifrado productivo exacto no está montado.'
  exit 1
fi
if [[ ! -x "$qr_dump" || ! -x "$qr_restore" ]]; then
  print -u2 'ERROR: faltan las herramientas de PostgreSQL.'
  exit 1
fi

qr_output="$qr_volume/qr-prod-${qr_label}-2026-09-29.dump"
qr_partial="${qr_output}.partial"
qr_manifest="${qr_output}.sha256"
if [[ -e "$qr_output" || -e "$qr_partial" || -e "$qr_manifest" ]]; then
  print -u2 'ERROR: ya existe un respaldo con esta etiqueta; no se sobrescribe.'
  exit 1
fi

print "Origen: Supabase producción $qr_project. Destino: volumen CIFRADO $qr_volume."
print 'Ingresá la contraseña de la BASE DE DATOS de producción (no la API key ni la clave del volumen).'
read -s 'qr_db_password?Contraseña de base producción: '
print
if [[ -z "$qr_db_password" ]]; then
  print -u2 'ERROR: contraseña vacía; no se inició la exportación.'
  exit 1
fi
export PGPASSWORD="$qr_db_password"
unset qr_db_password
export PGCONNECT_TIMEOUT=20 PGAPPNAME="qr-prod-backup-${qr_label}"

"$qr_dump" -d "$qr_dsn" -Fc -f "$qr_partial"
"$qr_restore" -l "$qr_partial" >/dev/null
mv -- "$qr_partial" "$qr_output"
/usr/bin/shasum -a 256 "$qr_output" > "$qr_manifest"
unset PGPASSWORD
print "BACKUP_PROD_${qr_label}_PASS"
stat -f 'Archivo verificado: %N · %z bytes' "$qr_output"
print 'El respaldo y su huella están dentro del volumen cifrado; no se copió la base al repositorio.'
