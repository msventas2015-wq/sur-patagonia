#!/bin/zsh
unsetopt xtrace verbose
setopt pipefail
trap 'unset PGPASSWORD QR_QA_SERVICE_ROLE_KEY qr_db_password qr_service_key' EXIT
cd '/Users/marianosylvester/Downloads/sur-patagonia-main 2/_codex_blindaje_qr_v19_final' || exit 1
echo 'BLINDAJE QR — PRUEBA HTTP EN QA. NO REINSTALA LA BASE.'
echo 'Proyecto: rsjwqmpseknvydistgfr. No pegues credenciales de producción.'
read -rs 'qr_db_password?1/2 · Contraseña de la base QA (oculta): '
echo
read -rs 'qr_service_key?2/2 · Clave API service_role o sb_secret de QA (oculta; NO anon): '
echo
if [[ -z "$qr_db_password" || -z "$qr_service_key" ]]; then
  echo 'Falta un dato. No se inició ninguna prueba.'
  read 'qr_close?Presioná Enter para cerrar.'
  exit 2
fi
export PGPASSWORD="$qr_db_password" QR_QA_SERVICE_ROLE_KEY="$qr_service_key"
unset qr_db_password qr_service_key
'/Users/marianosylvester/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' scripts/start-qr-qa-runtime.mjs 2>&1 | tee /private/tmp/qr-v19-http-runtime.log
qr_status=$?
unset PGPASSWORD QR_QA_SERVICE_ROLE_KEY
read 'qr_close?Proceso detenido. Presioná Enter para cerrar.'
exit $qr_status
