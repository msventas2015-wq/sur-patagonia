export async function cargarEstadoHistorial(supabase) {
  const { data, error } = await supabase.rpc('admin_historial_errores_pendientes')

  if (error) {
    console.error('[historial-destinos] no se pudo verificar el estado', error)
    return {
      verificado: false,
      total: null,
      canalIds: new Set(),
      masReciente: null,
    }
  }

  const fila = Array.isArray(data) ? data[0] : data
  const total = Number(fila?.total ?? 0)
  const ids = Array.isArray(fila?.canal_ids)
    ? fila.canal_ids.filter(id => typeof id === 'string' && id.length > 0)
    : []

  if (!Number.isSafeInteger(total) || total < 0) {
    console.error('[historial-destinos] respuesta inválida del control', fila)
    return {
      verificado: false,
      total: null,
      canalIds: new Set(),
      masReciente: null,
    }
  }

  return {
    verificado: true,
    total,
    canalIds: new Set(ids),
    masReciente: fila?.mas_reciente || null,
  }
}

export function textoAdvertenciaHistorial(estado, formatearFecha) {
  if (!estado.verificado) {
    return 'No se pudo verificar la integridad del historial de destinos. No asumas que los datos históricos están completos.'
  }
  if (estado.total === 0) return ''

  const canales = estado.canalIds.size
  const afectados = canales
    ? `${canales} canal${canales === 1 ? '' : 'es'} identificado${canales === 1 ? '' : 's'}`
    : 'sin canal identificable'
  const reciente = estado.masReciente && typeof formatearFecha === 'function'
    ? ` · Último fallo: ${formatearFecha(estado.masReciente)}`
    : ''

  return `El historial de destinos tiene ${estado.total} fallo${estado.total === 1 ? '' : 's'} sin resolver (${afectados})${reciente}. Los datos afectados pueden estar incompletos.`
}
