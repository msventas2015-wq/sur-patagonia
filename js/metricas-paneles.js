// Solo para lecturas de paneles. No modifica visitas ni el circuito /r/.
export const esEntradaIdentificada = fila =>
  Boolean(fila?.canal_ref) && ['qr', 'link'].includes(fila?.canal_via)

export const diaArgentina = fecha => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(fecha))

// Supabase puede limitar cada respuesta aunque el cliente pida más filas.
// Un panel no debe convertir una página parcial en un total aparente.
// El corte fijo evita que una fila nueva desplace las páginas durante la lectura.
export async function leerPaginado(crearConsulta, { tamano = 500, corte = new Date().toISOString() } = {}) {
  const filas = []
  let total = null
  for (let pagina = 0; pagina < 1000; pagina++) {
    const { data, count, error } = await crearConsulta()
      .lte('created_at', corte)
      .range(filas.length, filas.length + tamano - 1)
    if (error) throw error
    if (!Number.isInteger(count) || count < 0 || (total !== null && count !== total)) {
      throw new Error('El conteo exacto cambió durante la lectura.')
    }
    total = count
    filas.push(...(data || []))
    if (filas.length === total) return filas
    if (!(data || []).length || filas.length > total) throw new Error('Lectura parcial de métricas.')
  }
  throw new Error('Se agotó el límite de páginas de métricas.')
}

// Una consulta está atendida si algún evento del CRM la llevó a contactado o a
// un estado posterior. El estado actual solo no alcanza: puede haber vuelto a «nueva».
export const ESTADOS_ATENDIDOS = ['contactado', 'visita', 'visita_realizada', 'oferta', 'cerrado']

// Lee crm_eventos en bloques de IDs (evita URL demasiado largas) y cada bloque con
// conteo exacto. Si una parte falla, lanza: el llamador muestra «no disponible», nunca cero.
export async function contactosAtendidos(supabase, ids, { bloque = 100, corte } = {}) {
  const unicos = [...new Set((ids || []).filter(Boolean))]
  const atendidos = new Set()
  for (let i = 0; i < unicos.length; i += bloque) {
    const parte = unicos.slice(i, i + bloque)
    const filas = await leerPaginado(() => supabase.from('crm_eventos')
      .select('id,contacto_id', { count: 'exact' })
      .in('contacto_id', parte)
      .in('estado_nuevo', ESTADOS_ATENDIDOS)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }), { corte })
    filas.forEach(evento => atendidos.add(evento.contacto_id))
  }
  return atendidos
}
