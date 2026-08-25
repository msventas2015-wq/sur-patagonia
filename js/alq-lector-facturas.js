/* ============================================================================
 * alq-lector-facturas.js — LECTOR DE FACTURAS de servicios · Módulo Alquileres
 * Sur Patagonia · extraído de alquileres-admin-qa.html el 17-ago-2026 para que
 * NO se pierda en el rediseño de pantallas. Calibrado contra 4 facturas reales.
 *
 * Interfaz pública:
 *   - parseFacturaTexto(texto) -> {emisor, tipo, nro, total, vence, periodo, alertas[]}
 *   - pdfATexto(fileOBlob)     -> Promise<string>   (browser, requiere pdf.js cargado)
 *   - matchServicio(f, serviciosCargados) -> servicio|null   (cruce por nro de cliente)
 *
 * Emisores soportados (una plantilla por empresa; en El Bolsón son estas y pocas más):
 *   EDERSA (luz) · Camuzzi (gas) · Aguas Rionegrinas (agua/cloacas) · COOPETEL (internet/tel/TV)
 * Faltan mapear: municipal y expensas (cuando haya facturas reales).
 *
 * Uso en navegador:  <script src="pdf.min.js"></script> <script src="alq-lector-facturas.js"></script>
 *   const texto = await AlqLector.pdfATexto(file);
 *   const f = AlqLector.parseFacturaTexto(texto);
 *   const servicio = AlqLector.matchServicio(f, serviciosDeLaPropiedad);
 * ==========================================================================*/
(function (root) {
  'use strict';

  // números: formato AR "338.057,80" y formato US "315,718.18"
  function numAR(s){ if(!s) return null; const n=Number(s.replace(/\./g,'').replace(',','.')); return isNaN(n)?null:n; }
  function numUS(s){ if(!s) return null; const n=Number(s.replace(/,/g,'')); return isNaN(n)?null:n; }
  function g(t, pat){ const m=t.match(pat); return m ? m[1].trim() : null; }
  function fISO(d){ if(!d) return null; const m=d.match(/(\d{2})\/(\d{2})\/(\d{2,4})/); if(!m) return null;
    const a=m[3].length===2?'20'+m[3]:m[3]; return a+'-'+m[2]+'-'+m[1]; }

  // ---- PLANTILLAS POR EMISOR (calibradas con facturas reales, 17-ago-2026) ----
  function parseFacturaTexto(t){
    if(!t) return desconocida('(vacío)');
    const T = t.replace(/\s+/g,' ');

    // EDERSA — luz. Marca: "NIS:" + leyenda de energía. Total puede venir con "DEBITO".
    // FIX 17-ago-2026 (Cloud, con factura real de Mariano): la versión anterior exigía
    // /NIS:/ && /EDERSA|LA ENERGÍA/. En las facturas EDERSA actuales la palabra "EDERSA"
    // NO está en el texto — vive solo en el logo, que es imagen. Verificado: 0 ocurrencias
    // en FC-B-0057-00751313.pdf. Por eso caía a DESCONOCIDO.
    // Ahora alcanza con NIS: + cualquier marca estructural que SÍ viaja como texto.
    if(/NIS\s*:/.test(t) && /(EDERSA|LA ENERG[IÍ]A|CESP|EPRE|Liquidaci[óo]n\s+Serv|TARIFAT|Serv\.P[úu]b)/i.test(t)){
      // ⚠ pdf.js devuelve el texto en ORDEN DE DIBUJO: en la cabecera de EDERSA los
      // valores vienen ANTES que las etiquetas ("25/08/26 354,963.56 75288100001
      // VENCIMIENTO: TOTAL A PAGAR: NIS:"). Por eso cada campo se busca en las DOS
      // direcciones: etiqueta→valor y valor→etiqueta. Verificado 17-ago-2026 contra
      // FC-B-0057-00751313.pdf con pdf.js 3.11 y con pdftotext.
      const nis = g(T, /NIS\s*:\s*(\d{8,})/)                     // etiqueta → valor
               || g(T, /(\d{8,})\s+NIS\s*:/);                    // valor → etiqueta
      const tot = g(T, /TOTAL A PAGAR\s*:?\s*\$?\s*(?:DEBITO\s+)?([\d,]+\.\d{2})/)
               || g(T, /([\d,]+\.\d{2})\s+\d{2}\/\d{2}\/\d{2,4}\s+TOTAL A PAGAR/)
               || g(T, /(\d{1,3}(?:,\d{3})*\.\d{2})\s+\d{8,}\s+VENCIMIENTO/);
      const vto = g(T, /VENCIMIENTO\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/)
               || g(T, /(\d{2}\/\d{2}\/\d{2,4})\s+[\d,]+\.\d{2}\s+\d{8,}\s+VENCIMIENTO/)
               || g(T, /[\d,]+\.\d{2}\s+(\d{2}\/\d{2}\/\d{2,4})\s+TOTAL A PAGAR/);
      // deuda anterior: "AL 13/08/26 SU DEUDA SIN INTERESES ES $ 155654.70"
      const deuda = g(T, /SU DEUDA SIN INTERESES ES\s*\$?\s*([\d.,]+)/);
      const prox   = g(T, /PROXIMA LIQUIDACION VENCE\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/i)
                  || g(T, /(\d{2}\/\d{2}\/\d{2,4})\s+SU PROXIMA LIQUIDACION VENCE/i);
      // Talones "CUOTA 1 de 2 / CUOTA 2 de 2": cada cuota es la mitad del total.
      // El total del encabezado es el BIMESTRE completo; lo exigible ahora es la cuota 1.
      const cuotasEd=(function(){
        if(!/CUOTA\s*1\s*de\s*2/i.test(T)) return null;
        const tv=numUS(tot); if(!tv) return null;
        const vistos={}, out=[];
        for(const m of T.matchAll(/([\d,]+\.\d{2})\s+(\d{2}\/\d{2}\/\d{2,4})/g)){
          const v=numUS(m[1]);
          if(v && Math.abs(v*2-tv)<2 && !vistos[m[2]]){ vistos[m[2]]=1; out.push({imp:m[1], f:m[2], iso:fISO(m[2])}); }
        }
        out.sort((x,y)=>String(x.iso).localeCompare(String(y.iso)));
        return out.length?out:null;
      })();
      return {
        emisor:'EDERSA', tipo:'electricidad',
        nro: nis,
        total: numUS(tot),
        vence: fISO(vto),
        periodo: (function(){
          const d = g(T, /Bimestre\s*:?\s*(\d{2}\/\d{4})/)          // etiqueta → valor
                 || g(T, /(\d{2}\/\d{4})[^]{0,140}?Bimestre/);      // valor → etiqueta (pdf.js)
          return d ? ('Bimestre '+d) : null;
        })(),
        prox_vence: fISO(prox),
        alertas: [
          cuotasEd ? ('⚠ Se paga en 2 cuotas de $'+cuotasEd[0].imp+' (vencen '+cuotasEd.map(x=>x.f).join(' y ')+') — el total del encabezado es el bimestre completo') : null,
          /INTERESES P\/PAGO F\/ DE T[EÉ]RMINO/i.test(t) ? '⚠ Vino con intereses por pago fuera de término' : null,
          (deuda && Number(String(deuda).replace(/,/g,''))>0) ? ('⚠ La cuenta arrastra deuda sin intereses: $'+deuda) : null,
          /SERA DEBITADA DE SU CUENTA/i.test(t) ? 'Débito automático activo' : null,
          /podr[áa] suspenderse el\s*suministro/i.test(T) ? '⚠ Avisa posible corte de suministro por impago' : null
        ].filter(Boolean)
      };
    }

    // Camuzzi — gas. Marca: "FACTURA DE GAS" o cuenta NNNNN-NNNNNNNN/N. Detecta deuda previa.
    if(/FACTURA DE GAS/i.test(t) || (/\d{5}-\d{8}\/\d/.test(t) && /gas/i.test(t))){
      const deuda = g(T, /registra la siguiente deuda:\s*\$?\s*([\d.]+,\d{2})/);
      return {
        emisor:'Camuzzi', tipo:'gas',
        nro: g(t, /(\d{5}-\d{8}\/\d)/),
        total: numAR(g(T, /TOTAL A PAGAR\s*\$?\s*([\d.]+,\d{2})/)),
        vence: fISO(g(T, /(\d{2}\/\d{2}\/\d{4})/)),
        periodo: g(T, /(\d{2}\/\d{2}\/\d{4})\s*(?:al|→)?\s*(\d{2}\/\d{2}\/\d{4})/) ,
        alertas: [
          deuda ? ('⚠ La cuenta arrastra deuda previa: $'+deuda) : null,
          /d[eé]bito autom/i.test(t) ? 'Débito automático activo' : null
        ].filter(Boolean)
      };
    }

    // Aguas Rionegrinas — agua/cloacas. Marca: "CUENTA:" + "-CF-". Paga en 2 cuotas.
    if(/-CF-/.test(t) && /CUENTA\s*:/.test(t)){
      const vtos = (t.match(/Vencimiento\s+(\d{2}\/\d{2}\/\d{4})/g)||[]).map(x=>x.replace(/Vencimiento\s+/,''));
      const cuotas = (t.match(/Cuota \d de \d\s+([\d.]+)/g)||[]).map(x=>numUS(x.replace(/Cuota \d de \d\s+/,'')));
      return {
        emisor:'Aguas Rionegrinas', tipo:'agua',
        nro: g(t, /CUENTA\s*:\s*(\d{8,})/),
        total: cuotas.length ? cuotas.reduce((a,b)=>a+b,0) : null,
        vence: fISO(vtos[0]),
        periodo: g(T, /Per[íi]odo:\s*(\d+\/\d{4})/),
        alertas: [
          /NO SE REGISTRA DEUDA/i.test(t) ? 'Cuenta al día ✓' : 'Revisar deuda previa',
          cuotas.length>1 ? ('Se paga en '+cuotas.length+' cuotas'+(vtos.length?' ('+vtos.join(' y ')+')':'')) : null
        ].filter(Boolean)
      };
    }

    // COOPETEL — internet/tel/TV. Marca: "Coopetel" o factura "FB NNNN NNNNN". Detecta intereses previos.
    if(/coopetel/i.test(t) || /FB \d{4} \d+/.test(t)){
      return {
        emisor:'COOPETEL', tipo:'internet',
        // pdf.js invierte etiqueta/valor también acá: "Cuenta: Teléfono: Internet: 915627 TV x cable:"
        nro: g(t, /Cuenta\s*:\s*(\d{5,})/)                                   // etiqueta → valor
          || g(T, /Cuenta\s*:(?:\s*(?:Tel[ée]fono|Internet|TV x cable)\s*:)*\s*(\d{5,})/i)
          || g(T, /(\d{6,})\s+TV x cable/i)
          || g(T, /Factura\s*:\s*FB\s*\d{4}\s*(\d{5,})/i),                   // último recurso: nro de factura
        socio: g(T, /(\d{5,})\s+Socio/i) || g(T, /Socio\s*:?\s*(\d{5,})/i),
        total: numAR(g(T, /TOTAL\s*:?\s*\$?\s*([\d.]+,\d{2})/))
            || numAR(g(T, /([\d.]+,\d{2})\s+NETO/i))
            || numAR(g(T, /NETO\s*:?\s*\$?\s*([\d.]+,\d{2})/i)),
        vence: fISO(g(T, /VENCIMIENTO\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/))
            || fISO(g(T, /(\d{2}\/\d{2}\/\d{4})\s+VENCIMIENTO/)),
        periodo: g(T, /Per[íi]odo\s*:?\s*(\d{2}\/\d{4})/) || g(T, /(\d{2}\/\d{4})\s+Per[íi]odo/),
        alertas: [
          /Intereses\s*-\s*FB/i.test(t) ? '⚠ Vino con intereses de la factura anterior' : null,
          /No registra deuda/i.test(t) ? 'Cuenta al día ✓' : null,
          /Socio No Activo/i.test(t) ? '⚠ Figura como socio NO activo' : null
        ].filter(Boolean)
      };
    }

    return desconocida(t);
  }

  function desconocida(){ return { emisor:'DESCONOCIDO', tipo:'otro', nro:null, total:null, vence:null,
    periodo:null, alertas:['Formato no reconocido — completar a mano y confirmar'] }; }

  // Cruce por número de cliente (NIS / cuenta) contra los servicios cargados de una propiedad.
  function matchServicio(f, serviciosCargados){
    if(!f || !f.nro || !Array.isArray(serviciosCargados)) return null;
    const dig = f.nro.replace(/\D/g,'');
    if(!dig) return null;
    // 1º exacto. 2º contención SOLO si el más corto tiene 8+ dígitos.
    // Antes bastaba con que uno contuviera al otro: "44120" (ARSA) matcheaba dentro
    // de un NIS de 11 dígitos y la factura se le cobraba al inquilino equivocado.
    // Corregido 17-ago-2026 tras auditoría.
    const exacto = serviciosCargados.find(s => (s.nro_cliente||'').replace(/\D/g,'') === dig);
    if(exacto) return exacto;
    return serviciosCargados.find(s => {
      const d2=(s.nro_cliente||'').replace(/\D/g,'');
      if(!d2) return false;
      const corto = d2.length < dig.length ? d2 : dig;
      if(corto.length < 8) return false;
      return d2.includes(dig) || dig.includes(d2);
    }) || null;
  }

  // PDF -> texto (browser; requiere pdf.js/pdfjsLib cargado). Preserva saltos por posición Y.
  async function pdfATexto(file){
    if(typeof pdfjsLib==='undefined') throw new Error('pdf.js no está cargado');
    const MAX_BYTES=10*1024*1024, MAX_PAGES=50, MAX_TEXT=2*1024*1024;
    if(Number.isFinite(file&&file.size) && file.size>MAX_BYTES)
      throw new Error('PDF demasiado grande (máximo 10 MB)');
    const buf = await file.arrayBuffer();
    if(buf.byteLength>MAX_BYTES) throw new Error('PDF demasiado grande (máximo 10 MB)');
    const doc = await pdfjsLib.getDocument({data:buf,isEvalSupported:false}).promise;
    if(!Number.isInteger(doc.numPages)||doc.numPages<1||doc.numPages>MAX_PAGES)
      throw new Error('PDF con cantidad de páginas inválida (máximo 50)');
    let out='';
    for(let p=1;p<=doc.numPages;p++){
      const tc = await (await doc.getPage(p)).getTextContent();
      let y=null;
      for(const it of tc.items){
        if(y!==null && Math.abs(it.transform[5]-y)>4) out+='\n';
        out+=it.str+' '; y=it.transform[5];
        if(out.length>MAX_TEXT) throw new Error('PDF con demasiado texto (máximo 2 MB)');
      }
      out+='\n';
    }
    return out;
  }

  const API = { parseFacturaTexto, matchServicio, pdfATexto, _numAR:numAR, _numUS:numUS };
  if(typeof module!=='undefined' && module.exports) module.exports = API;
  root.AlqLector = API;
})(typeof self!=='undefined' ? self : this);
