// Presentación del admin. No modifica inventarios, atribución ni registros.
export function canalVisible(canal, estado = 'activo') {
  if (!estado) return true
  return estado === 'inactivo' ? canal?.activo === false : canal?.activo === true
}

// Una consulta directa o sin atribución verificable no se considera archivada.
export function registroVisible(canal, estado = 'activo') {
  if (!canal) return estado !== 'inactivo'
  return canalVisible(canal, estado)
}

// La vista de contenidos recibe totales sin vigencia del canal. Se resume desde
// sus períodos. Los cerrados conservan sus visitas y consultas; la cobertura
// de QR y canales corresponde a las asignaciones actuales.
export function resumirContenidoVisible(base, detalle, canalesPorId, estado = 'activo') {
  // «Todos» conserva exactamente los totales históricos del RPC original.
  if (!estado) return { ...base }
  const periodos = new Map()
  for (const fila of detalle) {
    if (!fila.canal_id || !canalesPorId.has(fila.canal_id)
        || !fila.asignacion_id || !fila.referencia_id
        || typeof fila.referencia_activa !== 'boolean'
        || !Object.hasOwn(fila, 'vigente_hasta')
        || !['activo','pasivo'].includes(fila.canal_clase)
        || !['visitas','consultas'].every(campo => fila[campo] != null && Number.isFinite(Number(fila[campo])) && Number(fila[campo]) >= 0)) {
      throw new Error('El detalle QR no cumple el contrato de lectura; no se pueden verificar sus totales')
    }
    if (!canalVisible(canalesPorId.get(fila.canal_id), estado)) continue
    periodos.set(`${fila.asignacion_id}:${fila.referencia_id}`, fila)
  }
  const filas = [...periodos.values()]
  const actuales = filas.filter(f => f.vigente_hasta == null)
  const ids = new Set(actuales.map(f => f.canal_id))
  const activos = new Set(actuales.filter(f => f.referencia_activa === true).map(f => f.referencia_id))
  const inactivos = new Set(actuales.filter(f => f.referencia_activa === false).map(f => f.referencia_id))
  const provincias = [...new Set(actuales.map(f => f.provincia).filter(Boolean))].sort()
  const ciudades = [...new Set(actuales.map(f => f.ciudad).filter(Boolean))].sort()
  const pasivos = new Set(actuales.filter(f => f.canal_clase === 'pasivo').map(f => f.canal_id))
  return { ...base, puntos_qr: activos.size, puntos_qr_inactivos: inactivos.size,
    canales: ids.size, canales_pasivos: pasivos.size, canales_activos: ids.size - pasivos.size,
    provincias: provincias.length, ciudades: ciudades.length, lista_provincias: provincias, lista_ciudades: ciudades,
    visitas: filas.reduce((n,f) => n + Number(f.visitas || 0), 0),
    consultas: filas.reduce((n,f) => n + Number(f.consultas || 0), 0),
    observado_desde: actuales.map(f => f.observado_desde).filter(Boolean).sort()[0] || null,
    desde_backfill: actuales.length > 0 && actuales.every(f => f.desde_backfill === true) }
}

// Evita abanicos ilimitados y comparte lecturas en curso entre filtros rápidos.
export function crearLectorConCache(limite = 4) {
  const cache = new Map(), pendientes = []
  let activos = 0
  function avanzar() {
    while (activos < limite && pendientes.length) {
      const { clave, tarea, resolve, reject } = pendientes.shift()
      activos++
      Promise.resolve().then(tarea).then(resolve, error => { cache.delete(clave); reject(error) })
        .finally(() => { activos--; avanzar() })
    }
  }
  return function leer(clave, tarea) {
    if (!cache.has(clave)) {
      const resultado = new Promise((resolve,reject) => pendientes.push({clave,tarea,resolve,reject}))
      cache.set(clave,resultado)
      avanzar()
    }
    return cache.get(clave)
  }
}
