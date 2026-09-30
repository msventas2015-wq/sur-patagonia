#!/bin/zsh
set -euo pipefail
umask 077

qr_root='/Users/marianosylvester/Downloads/sur-patagonia-main 2/_codex_blindaje_qr_v19_final'
qr_volume='/Volumes/QR-QA-2026-09-29'
qr_image='/Users/marianosylvester/Documents/SurPatagonian/QR-Backup-QA-2026-09-29/qr-qa-2026-09-29.dmg'
qr_source="$qr_volume/qr-ledger-qa-2026-09-29.json"
qr_restored="$qr_volume/qr-ledger-qa-2026-09-29.restored.json"
qr_psql='/Applications/Postgres.app/Contents/Versions/latest/bin/psql'
qr_dsn='postgresql://postgres.ouxuqvelqofvkxcejoez@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require'

if [[ ! -f "$qr_source" ]] || [[ -e "$qr_restored" ]] ||
   ! hdiutil info | grep -F "image-path      : $qr_image" > /dev/null; then
  print -u2 'ERROR: falta el respaldo cifrado o ya existe una restauración. No se modificó el proyecto temporal.'
  exit 1
fi
if [[ ! -x "$qr_psql" ]] ||
   ! /usr/bin/jq -e 'type == "object" and (keys | length) == 27 and ([.[] | type] | all(. == "array"))' "$qr_source" > /dev/null; then
  print -u2 'ERROR: no se pudo validar el respaldo. No se modificó el proyecto temporal.'
  exit 1
fi

print 'Destino: proyecto TEMPORAL ouxuqvelqofvkxcejoez, esquema aislado qr_recovery_20260929.'
print 'psql pide la contraseña de la BASE DEL PROYECTO TEMPORAL. NO es la de QA, API key ni la del archivo cifrado.'
"$qr_psql" -X -qAt -W -v ON_ERROR_STOP=1 -d "$qr_dsn" \
  -f "$qr_root/scripts/restore-qr-ledger-qa.sql"

if ! cmp -s -- "$qr_source" "$qr_restored"; then
  print -u2 'ERROR: el archivo recuperado no coincide byte por byte con el respaldo.'
  exit 1
fi
/usr/bin/shasum -a 256 "$qr_source" "$qr_restored"
print 'RESTORE_LEDGER_QA_PASS: 27 colecciones restauradas y bytes idénticos.'
print 'Presioná Enter para cerrar esta ventana.'
read -r
