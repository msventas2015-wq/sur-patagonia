#!/bin/zsh
set -euo pipefail
umask 077

qr_root='/Users/marianosylvester/Downloads/sur-patagonia-main 2/_codex_blindaje_qr_v19_final'
qr_volume='/Volumes/QR-QA-2026-09-29'
qr_image='/Users/marianosylvester/Documents/SurPatagonian/QR-Backup-QA-2026-09-29/qr-qa-2026-09-29.dmg'
qr_output="$qr_volume/qr-ledger-qa-2026-09-29.json"
qr_partial="$qr_output.partial"
qr_error="$qr_volume/qr-ledger-qa-2026-09-29.error-$(date +%Y%m%d-%H%M%S).txt"
qr_psql='/Applications/Postgres.app/Contents/Versions/latest/bin/psql'
qr_dsn='postgresql://postgres.rsjwqmpseknvydistgfr@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require'

if [[ ! -d "$qr_volume" ]] || ! hdiutil info | grep -F "image-path      : $qr_image" > /dev/null; then
  print -u2 'ERROR: la imagen cifrada exacta no está montada. No se exportó nada.'
  exit 1
fi
if [[ -e "$qr_output" || -e "$qr_partial" || -e "$qr_error" ]]; then
  print -u2 'ERROR: ya existe un archivo de exportación o parcial. No se sobrescribió.'
  exit 1
fi
if [[ ! -x "$qr_psql" ]]; then
  print -u2 'ERROR: no se encontró psql. No se exportó nada.'
  exit 1
fi

trap 'if [[ -e "$qr_partial" ]]; then rm -- "$qr_partial"; fi' EXIT
print 'Destino: volumen cifrado QR-QA-2026-09-29. Origen: BASE DE DATOS QA rsjwqmpseknvydistgfr.'
print 'Ahora psql pide la contraseña de la BASE QA. NO es API key ni contraseña del archivo cifrado.'
"$qr_psql" -X -qAt -W -v ON_ERROR_STOP=1 -d "$qr_dsn" \
  -f "$qr_root/scripts/export-qr-ledger-qa.sql" > "$qr_partial" 2> >(tee "$qr_error" >&2)

/usr/bin/jq -e 'type == "object" and (keys | length) == 27 and ([.[] | type] | all(. == "array")) and (.canales | length) > 0 and (.referencias | length) > 0 and (.qr_ingresos_v1 | length) > 0' "$qr_partial" > /dev/null
mv -- "$qr_partial" "$qr_output"
rm -- "$qr_error"
/usr/bin/shasum -a 256 "$qr_output"
/usr/bin/jq -r 'to_entries | sort_by(.key) | .[] | "\(.key)=\(.value | length)"' "$qr_output"
print 'EXPORT_QA_CIFRADO_PASS. No se escribió en QA ni fuera del volumen cifrado.'
print 'Presioná Enter para cerrar esta ventana.'
read -r
