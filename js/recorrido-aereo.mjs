import {findPublicLot} from './recorrido-enlaces.mjs';
import {mediaList, mediaForPolygon, localMediaDraft, openLocalUploader, isLocalMediaHost} from './recorrido-medios.mjs?v=20261110-medios1';
import {alamosInventory} from './recorrido-alamos-fichas.mjs?v=20261117-cierre-venta1';
import {openMediaViewer} from './recorrido-visor-medios.mjs?v=20261110-medios1';
// Recorrido aéreo 360 · adaptador mínimo para usar el componente fuera del lienzo de diseño.
// Soporta lo que usa la herramienta: valores {{ ruta }}, sc-if, sc-for, eventos on*, ref y setState.
const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
const ONE = /^\{\{\s*([^}]+?)\s*\}\}$/;
const BOOL_PROPS = new Set(['disabled', 'readonly', 'checked']);
const PROP_NAME = { readonly: 'readOnly' };

function lookup(scope, path) {
  if (path === 'true') return true;
  if (path === 'false') return false;
  let v = scope;
  for (const k of path.split('.')) { if (v == null) return undefined; v = v[k]; }
  return v;
}
const text = v => (v == null || v === false) ? '' : String(v);
const interpolate = (tpl, scope) => tpl.replace(HOLE, (_, p) => text(lookup(scope, p)));

class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; this.__pending = []; this.__queued = false; }
  setState(patch, cb) {
    if (typeof patch === 'function') patch = patch(this.state);
    this.state = Object.assign({}, this.state, patch || {});
    if (cb) this.__pending.push(cb);
    if (!this.__queued) {
      this.__queued = true;
      queueMicrotask(() => {
        this.__queued = false;
        if (this.__render) this.__render();
        const cbs = this.__pending.splice(0);
        cbs.forEach(f => { try { f.call(this); } catch (e) { console.error(e); } });
      });
    }
  }
}

// Procesa un fragmento clonado y devuelve sus actualizadores.
function bind(root, getScope) {
  const updates = [];
  const walk = node => {
    if (node.nodeType === 3) {
      if (HOLE.test(node.nodeValue)) {
        HOLE.lastIndex = 0;
        const tpl = node.nodeValue;
        updates.push(() => { const t = interpolate(tpl, getScope()); if (node.nodeValue !== t) node.nodeValue = t; });
      }
      HOLE.lastIndex = 0;
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'sc-if' || tag === 'sc-for') {
      const anchor = document.createComment(tag);
      const tplFrag = document.createDocumentFragment();
      while (node.firstChild) tplFrag.appendChild(node.firstChild);
      node.replaceWith(anchor);
      if (tag === 'sc-if') {
        const path = (node.getAttribute('value') || '').match(ONE)?.[1] || 'false';
        let mounted = null;
        updates.push(() => {
          const on = !!lookup(getScope(), path);
          if (on && !mounted) {
            const frag = tplFrag.cloneNode(true);
            const sub = bind(frag, getScope);
            mounted = { nodes: [...frag.childNodes], sub };
            anchor.parentNode.insertBefore(frag, anchor);
            sub.forEach(u => u());
          } else if (!on && mounted) {
            mounted.nodes.forEach(n => n.remove()); mounted = null;
          } else if (on && mounted) mounted.sub.forEach(u => u());
        });
      } else {
        const path = (node.getAttribute('list') || '').match(ONE)?.[1];
        const as = node.getAttribute('as') || 'item';
        let items = [];
        updates.push(() => {
          const list = lookup(getScope(), path) || [];
          if (items.length !== list.length) {
            items.forEach(it => it.nodes.forEach(n => n.remove()));
            items = list.map((_, i) => {
              const frag = tplFrag.cloneNode(true);
              const sub = bind(frag, () => { const s = Object.create(getScope()); s[as] = (lookup(getScope(), path) || [])[i]; return s; });
              const nodes = [...frag.childNodes];
              anchor.parentNode.insertBefore(frag, anchor);
              return { nodes, sub };
            });
          }
          items.forEach(it => it.sub.forEach(u => u()));
        });
      }
      return;
    }
    for (const attr of [...node.attributes]) {
      const name = attr.name, val = attr.value;
      if (name.startsWith('hint-')) { node.removeAttribute(name); continue; }
      const one = val.match(ONE);
      if (name.startsWith('on') && one) {
        node.removeAttribute(name);
        const ev = name.slice(2);
        node.addEventListener(ev, e => { const f = lookup(getScope(), one[1]); if (typeof f === 'function') f(e); }, ev === 'wheel' ? { passive: false } : undefined);
        continue;
      }
      if (name === 'ref' && one) {
        node.removeAttribute(name);
        updates.push(() => { const f = lookup(getScope(), one[1]); if (typeof f === 'function' && !node.__refDone) { node.__refDone = true; f(node); } });
        continue;
      }
      if (!HOLE.test(val)) { HOLE.lastIndex = 0; continue; }
      HOLE.lastIndex = 0;
      if (BOOL_PROPS.has(name) && one) {
        node.removeAttribute(name);
        const prop = PROP_NAME[name] || name;
        updates.push(() => { node[prop] = !!lookup(getScope(), one[1]); });
      } else if (name === 'value' && /^(input|textarea|select)$/.test(tag)) {
        node.removeAttribute(name);
        updates.push(() => { const v = text(one ? lookup(getScope(), one[1]) : interpolate(val, getScope())); if (node.value !== v && document.activeElement !== node) node.value = v; });
      } else {
        node.setAttribute(name, '');
        updates.push(() => { const v = one ? text(lookup(getScope(), one[1])) : interpolate(val, getScope()); if (node.getAttribute(name) !== v) node.setAttribute(name, v); });
      }
    }
    [...node.childNodes].forEach(walk);
  };
  [...root.childNodes].forEach(walk);
  return updates;
}

export function mountComponent(Component, host, template, props) {
  const comp = new Component(props);
  let vals = {};
  const frag = template.content.cloneNode(true);
  const updates = bind(frag, () => vals);
  comp.__render = () => { vals = comp.renderVals() || {}; updates.forEach(u => u()); };
  vals = comp.renderVals() || {};
  host.appendChild(frag);
  updates.forEach(u => u());
  if (comp.componentDidMount) comp.componentDidMount();
  window.addEventListener('pagehide', event => {
    if (!event.persisted) comp.componentWillUnmount?.();
  });
  return comp;
}

export { DCLogic };


// ---------- Componente del recorrido (fuente: tablero Vuelo del lienzo «Álamos 360», 30-oct-2026) ----------
class Component extends DCLogic {
  constructor(...a) {
    super(...a);
    // Prototipo local de continuidad: aún no aprobado en calidad fotográfica.
    this.commonZonePreview = new URLSearchParams(location.search).get('zona') === 'escena-comun';
    // Las 5 fotos correlativas del recorrido (docs/360/RECORRIDO), de sur a norte, con el calce fijado por Mariano (29-oct).
    this.SCENES = [
      { id: 'r1', name: 'Punto 1', url4: '/assets/recorridos/alamos/pano-p1-4k.jpg', url8: '/assets/recorridos/alamos/pano-p1-8k.jpg', x: -111.4, y: -606.0, heading: 87.00, agl: 281.0, dx: 6.00, dy: -5.41, tilt: -0.205, roll: 0.869 },
      { id: 'r2', name: 'Punto 2', url4: '/assets/recorridos/alamos/pano-p2-4k.jpg', url8: '/assets/recorridos/alamos/pano-p2-8k.jpg', x: -100.2, y: -538.4, heading: 100.30, agl: 187.0, dx: 1.00, dy: -3.50, tilt: 0.400, roll: -0.050 },
      { id: 'r3', name: 'Punto 3', url4: '/assets/recorridos/alamos/pano-p3-4k.jpg', url8: '/assets/recorridos/alamos/pano-p3-8k.jpg', x: -84.4, y: -451.0, heading: 100.10, agl: 183.7, dx: -1.47, dy: -3.36, tilt: 0, roll: 0 },
      { id: 'r4', name: 'Punto 4', url4: '/assets/recorridos/alamos/pano-p4-4k.jpg', url8: '/assets/recorridos/alamos/pano-p4-8k.jpg', x: -69.2, y: -369.4, heading: 99.18, agl: 183.0, dx: -8.30, dy: -0.90, tilt: 1.824, roll: -0.063 },
      { id: 'r5', name: 'Punto 5', url4: '/assets/recorridos/alamos/pano-p5-4k.jpg', url8: '/assets/recorridos/alamos/pano-p5-8k.jpg', x: -53.3, y: -284.1, heading: 100.06, agl: 185.0, dx: 0.96, dy: -3.00, tilt: 0, roll: 0 }
    ];
    // GPS conservado; cámara visual ajustada contra calles/edificios de P1–P3.
    // Altura y desplazamientos son parámetros de registro fotográfico, no una mensura.
    this.TOUR_COUNT = this.SCENES.length;
    this.returnPoint = 0;
    [[1278.53,-2123.59,-163.075837,1227.625759,62.932751,106.489386,-0.543272,-2.819081],
     [2031.04,-1675.27,-53.858614,1223.015894,-61.686911,53.048421,1.464561,0.553259],
     [-631.6,-2581.8,10.153805,1152.982521,8.597686,37.108026,0.701952,-0.01997],
     [-1030.09,-2609.42,-127.72833,1182.765635,-23.78775,81.323061,-0.776802,-0.241496]].forEach((p,i) => {
      this.SCENES.push({id:'contexto'+(i+1),name:'Panorámica '+(i+1),context:true,
        url4:'/assets/recorridos/alamos/panoramica-'+(i+1)+'-4k.jpg',
        url8:'/assets/recorridos/alamos/panoramica-'+(i+1)+'-8k.jpg',
        x:p[0],y:p[1],heading:p[2],agl:p[3],dx:p[4],dy:p[5],tilt:p[6],roll:p[7]});
    });
    this.URLD = '/assets/recorridos/alamos/plano-sur.json';
    // Renders fotorrealistas de la zona productiva (Codex, 30-oct: playas conectadas a las calles este-oeste), uno por punto, con la cámara del encuadre.
    this.ZR = [
      { url: '/assets/recorridos/alamos/zona-render-p1.webp', yaw: 11.199, pitch: -36.983, fov: 58, bb: [0.17919921875, 0.39208984375, 0.8271484375, 0.64990234375] },
      { url: '/assets/recorridos/alamos/zona-render-p2.webp', yaw: 10.613, pitch: -31.481, fov: 58, bb: [0.0458984375, 0.38623046875, 0.95703125, 0.68017578125] },
      { url: '/assets/recorridos/alamos/zona-render-p3.webp', yaw: 10.116, pitch: -40.31, fov: 58, bb: [0.0, 0.33203125, 1.0, 0.7841796875] },
      { url: '/assets/recorridos/alamos/zona-render-p4.webp', yaw: 6.825, pitch: -53.535, fov: 58, bb: [0.0, 0.22802734375, 1.0, 0.9619140625] },
      { url: '/assets/recorridos/alamos/zona-render-p5.webp', yaw: 11.333, pitch: -75.423, fov: 58, bb: [0.0, 0.083984375, 1.0, 1.0] }
    ];
    // Grilla del loteo: marco girado 10° (u hacia el norte de la calle central, v hacia el este).
    this.GRID = 10;
    // Las 4 manzanas del norte que pasan a zona productiva (u0, u1, v0, v1 en metros).
    this.ZONE_BLOCKS = [
      { u0: -236, u1: -158.5, v0: -125.5, v1: -12.5, n: [36, 30, 30], s: [66, 30] },
      { u0: -236, u1: -158.5, v0: 3.5, v1: 117, n: [30, 30, 36], s: [30, 66] },
      { u0: -323, u1: -251.5, v0: -125.5, v1: -12.5, n: [46, 46], s: [30, 30, 30] },
      { u0: -323, u1: -251.5, v0: 3.5, v1: 117, n: [30, 62], s: [46, 46] }
    ];
    this.ZONE_RECT = { u0: -337, u1: -139, v0: -140, v1: 133 };
    // Rutas y accesos. RN40 corregida con las panorámicas 1 y 3: relieve visual aproximado, no mensura.
    // Acceso RN40 unido a la ruta; RP16 conserva las marcas de Mariano en el punto 1.
    // k: 0 Ruta 40, 1 Ruta 16 / Av. San Martín, 2 acceso (va de la ruta hacia el loteo).
    this.ROUTES = [
      { id: 'r40', k: 0, pts: [[977.64,666.11,28.0],[975.29,650.39,27.94],[971.96,628.15,27.81],[968.09,602.26,27.71],[964.07,575.59,27.74],[960.32,551.0,28.0],[956.62,528.48,28.58],[952.69,506.13,29.41],[948.87,483.95,30.35],[945.49,461.97,31.26],[942.89,440.2,32.0],[940.8,418.34,32.59],[938.99,396.37,33.14],[937.87,374.75,33.58],[937.84,353.94,33.89],[939.3,334.38,34.0],[942.96,315.92,33.82],[948.54,298.26,33.39],[954.99,281.63,32.85],[961.25,266.26,32.34],[966.25,252.37,32.0],[969.7,240.87,31.84],[972.3,231.6,31.76],[974.5,223.21,31.76],[976.74,214.34,31.84],[979.44,203.64,32.0],[982.44,191.26,32.27],[985.45,178.11,32.66],[988.72,163.96,33.1],[992.51,148.55,33.57],[997.07,131.66,34.0],[1002.48,112.69,34.43],[1008.56,91.8,34.9],[1015.22,69.88,35.34],[1022.34,47.82,35.73],[1029.82,26.51,36.0],[1038.04,6.02,36.13],[1047.08,-14.25,36.14],[1056.36,-34.39,36.1],[1065.3,-54.51,36.03],[1073.33,-74.68,36.0],[1080.48,-94.81,35.94],[1087.13,-114.84,35.81],[1093.25,-134.92,35.71],[1098.78,-155.21,35.74],[1103.69,-175.87,36.0],[1108.02,-196.86,36.45],[1111.81,-218.08,37.02],[1114.98,-239.58,37.78],[1117.46,-261.4,38.75],[1119.19,-283.61,40.0],[1120.04,-306.36,41.62],[1120.06,-329.62,43.57],[1119.44,-353.15,45.71],[1118.35,-376.69,47.9],[1117.0,-400.0,50.0],[1115.56,-422.85,51.84],[1113.9,-445.42,53.52],[1111.77,-468.02,55.28],[1108.87,-491.0,57.36],[1104.95,-514.69,60.0],[1099.77,-539.46,63.46],[1093.51,-565.09,67.57],[1086.52,-591.02,71.95],[1079.15,-616.68,76.22],[1071.76,-641.53,80.0],[1064.17,-665.53,83.28],[1056.15,-689.06,86.32],[1047.95,-712.15,89.12],[1039.86,-734.84,91.68],[1032.12,-757.17,94.0],[1024.81,-779.02,96.0],[1017.76,-800.38,97.68],[1010.86,-821.4,99.16],[1004.0,-842.27,100.56],[997.09,-863.15,102.0],[990.11,-884.04,103.48],[983.12,-904.83,104.92],[976.16,-925.52,106.32],[969.23,-946.12,107.68],[962.36,-966.64,109.0],[955.31,-987.87,110.33],[948.06,-1009.8,111.66],[940.98,-1031.25,112.94],[934.43,-1051.01,114.07],[928.76,-1067.9,115.0],[923.96,-1081.87,115.69],[919.79,-1093.7,116.18],[916.28,-1103.49,116.54],[913.46,-1111.28,116.79],[911.35,-1117.14,117.0]] },
      { id: 'r16', k: 1, pts: [[-493.2, -522.3, 0], [-441.1, -226.9, 0], [-389.0, 68.6, 0], [-345.6, 314.8, 0]] },
      { id: 'a40', k: 2, pts: [[979.44,203.64,32.0],[922.77,193.47,28.29],[918.12,192.72,28.51],[913.56,192.08,28.73],[909.0,191.74,28.94],[904.34,191.49,29.16],[899.79,191.45,29.38],[895.23,191.61,29.59],[792.2,196.86,21.98],[787.64,196.92,22.2],[783.08,196.78,22.41],[778.53,196.44,22.63],[773.97,195.8,22.85],[769.31,194.95,23.07],[764.75,193.91,23.28],[753.86,191.06,20.2],[749.3,189.82,20.42],[744.64,188.77,20.64],[740.09,187.73,20.85],[735.53,186.69,21.07],[730.97,185.75,21.29],[726.31,184.9,21.51],[616.05,164.65,13.64],[611.49,163.91,13.85],[606.93,163.57,14.07],[602.38,163.43,14.29],[597.8,163.8,14.4],[593.3,164.7,14.4],[588.8,165.9,14.4],[491.2,195.0,2.6],[486.8,196.3,2.6],[482.2,197.5,2.6],[477.7,198.5,2.6],[473.1,199.3,2.6],[468.5,200.1,2.6],[463.9,200.7,2.6],[337.5,215.5,0.0],[332.9,216.0,0.0],[328.3,216.6,0.0],[323.6,217.1,0.0],[319.0,217.7,0.0],[314.4,218.2,0.0],[309.7,218.8,0.0],[190.4,233.2,0.0],[186.1,233.4,0.0],[182.4,232.6,0.0],[179.3,231.1,0.0],[176.9,228.6,0.0],[175.1,225.3,0.0],[173.9,221.2,0.0],[100.2,-169.0,0.0]] },
      { id: 'a16', k: 2, pts: [[-405.5, -25.0, 0], [-287.3, -45.8, 0], [-284.4, -46.6, 0], [-282.0, -47.9, 0], [-280.4, -49.6, 0], [-279.3, -51.7, 0], [-279.0, -54.3, 0], [-279.2, -57.4, 0], [-285.3, -91.9, 0], [-285.5, -94.9, 0], [-285.2, -97.5, 0], [-284.1, -99.7, 0], [-282.5, -101.4, 0], [-280.1, -102.6, 0], [-277.2, -103.4, 0], [-162.0, -123.8, 0]] }
    ];
    // Lugares de la zona (x este, y norte en metros desde la base; h sobre el loteo). Ubicaciones aproximadas a confirmar.
    this.POIS = [{"n": "Cerro Piltriquitrón", "x": 5696, "y": 2348, "h": 1950, "i": "cerro"}, {"n": "Refugio Piltriquitrón", "x": 4774, "y": 687, "h": 1190, "i": "refugio"}, {"n": "Lago Puelo", "x": -5380, "y": -8700, "h": -110, "i": "lago"}, {"n": "El Hoyo", "x": 1218, "y": -8323, "h": -50, "i": "pueblo"}];
    // Oficina Sur Patagonian, Av. San Martín 3229 (El Bolsón). UBICACIÓN APROXIMADA: punto de la dirección en Google Maps
    // (lat -41.9591174, lon -71.533981, que el propio mapa marca como no preciso). Se ajusta cuando llegue el pin exacto.
    // Origen de la escena: E 1538486.02, N 5351831.61 en POSGAR 2007 / Argentina faja 1 (meridiano -72°, FE 1 500 000,
    // ordenada desde el polo sur), que es la posición GPS del dron en la foto docs/360/LOCALES ED LA CASONA .jpg
    // (lat -41.9855369, lon -71.5355864); las cámaras salen de los GPS de docs/360/RECORRIDO/*.jpg en el mismo marco.
    this.OFFICE = { n: 'Oficina Sur Patagonian', dir: 'Av. San Martín 3229', x: 148.8, y: 2933.1, h: 0, aprox: true };
    // Encuadre del render por punto: más abierto en los puntos cercanos para que entre toda la zona.
    this.AIMFOV = [58, 58, 76, 88, 88];
    // Marca Sur Patagonian pintada en el pasto de algunas manzanas (centro u, v y ancho en metros).
    this.BRAND = [{ u: -374, v: -66, w: 100 }, { u: -461, v: 60, w: 100 }, { u: -548, v: -66, w: 100 }, { u: -615.5, v: 0, w: 165 }];
    this.BRAND_URL = '/assets/recorridos/alamos/logo-pasto.png';
    this.BANNER_URL = '/assets/recorridos/alamos/bandera.png';
    // Sol medido en las fotos: azimut 344°, altura 63°.
    this.SUN = { az: 344, el: 63 };
    var cals = {};
    try { cals = JSON.parse(window.localStorage.getItem('alamos-vuelo-cal2') || '{}') || {}; } catch (e) { cals = {}; }
    this.state = {
      cur: 0, cals: cals, panel: false, loading: true, loadTxt: 'Cargando recorrido…', started: false,
      dir: 'norte · 10°', flying: false, zone: false, zoneBusy: false, acc: true, signs: true,
      pending: null, hint: '', saveTxt: '', showJson: false,
      sel: null, lot: null, lotMedia: 'sector', locatorOpen: false, entorno: false, layersOpen: false, helpDone: false, status: '', speed: 1, playing: false, near: 0, skyOn: true
    };
    // Datos comerciales por lote (disponibilidad, precio, tipo, FOS, frente, financiación).
    // PENDIENTE: no hay fuente confirmada conectada. Mientras sea null, todo lote figura «Sin información».
    // Formato previsto: { '1-7': { estado: 'disponible' | 'no_disponible', precio, tipo, fos, frente, financiacion } }.
    this.LOT_SOURCE = null;
    // Vuelo continuo: velocidad base en metros por segundo y velo de aire muy leve en el cruce de fotos.
    this.SPEEDS = [{ k: 0.5, t: '0,5×', l: 'lenta' }, { k: 1, t: '1×', l: 'normal' }, { k: 2, t: '2×', l: 'rápida' }];
    this.BASEV = 10; this.HAZE = 0.1;
    try { this.calMode = /[?&]calzar=1/.test(window.location.search); } catch (e) { this.calMode = false; }
    // Todas las entradas de Álamos comparten el cielo inicial y el control Hora azul / Original.
    // Cielo fotográfico esférico ESO/S. Brunier (CC BY 4.0), 6000×3000; orientación y atmósfera recreadas.
    // Máscaras de cielo por foto, calculadas sobre los panoramas (borde real montaña/cielo), en assets/recorridos/alamos.
    // Experimento detenido: conservar sólo para revisión local; no activarlo en QA.
    this.sunsetEntry = ['localhost', '127.0.0.1'].includes(window.location.hostname) && new URLSearchParams(window.location.search).get('ingreso') === 'atardecer';
    this.SKY_URL = '/assets/recorridos/alamos/cielo-via-lactea-eso.jpg';
    this.SKY_HORIZON = 1;
    this.SKY_LOW_URL = '/assets/recorridos/alamos/cielo-hora-azul-prueba.png';
    this.SKY_ROT = 0.25; // Orientación escénica: no representa una fecha/hora astronómica del lugar.
    // Las cinco vistas con máscara propia (borde automático + contornos trazados a mano sobre cada foto; fuente de trabajo:
    // tmp/claude/plano-alamos-360/cielo/contornos-manuales.json). Si una vista no tuviera máscara (null), conserva su cielo
    // original y el cruce se funde sin salto.
    this.SKY_MASKS = [1, 2, 3, 4, 5].map(function (n) { return '/assets/recorridos/alamos/cielo-mascara-p' + n + '.png?v=cielo5'; }).concat([1,2,3,4].map(function(n){return '/assets/recorridos/alamos/cielo-mascara-contexto-'+n+'.png?v=calce1';}));
    this.ICONS = {
      avion: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"></path></svg>',
      cerro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 3 4 8 5-5 5 15H2L8 3z"></path></svg>',
      refugio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V21H3z"></path><path d="M9 21v-6h6v6"></path></svg>',
      lago: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"></path></svg>',
      pueblo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>'
    };
    var me = this;
    this.motionFn = function (now) { me.stepMotion(now); };
    this.onKeyH = function (e) { me.onKey(e); };
    this.onVisH = function () { me.onVis(); };
    this.view = { yaw: 10, pitch: -30, fov: 80 };
    this.cam = { x: 0, y: 0, h: 600 };
    this.mixAB = 0; this.cloud = 1; this.prog = 0; this.zoneT = 0;
    this.A = 0; this.B = 0;
    this.ptrs = new Map(); this.tex = {}; this.raf = 0; this.t0 = performance.now();
    this.setRoot = (el) => { if (el) this.root = el; };
    this.setGl = (el) => { if (el) this.glc = el; };
    this.setOv = (el) => { if (el) this.ovc = el; };
    this.setLocator = (el) => { if (el) { this.locatorEl = el; this.drawLocator(); } };
    this.setMm = (el) => { this.mmc = el; if (el) this.drawMini(); };
    this.setLabels = (el) => { if (el) this.labEl = el; };
    this.setTape = (el) => { if (el) this.tapeEl = el; };
    this.setRail = (el) => { if (el) this.railEl = el; };
    this.setEntList = (el) => { if (el) this.entEl = el; };
    this.setWorld = (el) => { if (el) this.worldEl = el; };
  }

  // ---------- Calibración de cada foto ----------
  calOf(i) {
    var s = this.SCENES[i], c = this.state.cals[s.id] || {};
    function v(k, d) { return c[k] != null ? c[k] : d; }
    return { heading: v('heading', s.heading), agl: v('agl', s.agl), dx: v('dx', s.dx || 0), dy: v('dy', s.dy || 0), tilt: v('tilt', s.tilt || 0), roll: v('roll', s.roll || 0), pairs: c.pairs || [] };
  }
  posOf(i) { var s = this.SCENES[i], c = this.calOf(i); return { x: s.x - c.dx, y: s.y - c.dy, h: c.agl }; }
  matOf(c) {
    var R = Math.PI / 180, H = c.heading * R, t = c.tilt * R, r = c.roll * R;
    var ch = Math.cos(H), sh = Math.sin(H), ct = Math.cos(t), st = Math.sin(t), cr = Math.cos(r), sr = Math.sin(r);
    var Ry = [[ch, 0, sh], [0, 1, 0], [-sh, 0, ch]], Rx = [[1, 0, 0], [0, ct, -st], [0, st, ct]], Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
    function mul(A, B) { var o = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) o[i][j] += A[i][k] * B[k][j]; return o; }
    var W = mul(mul(Ry, Rx), Rz);
    return [[W[0][0], W[1][0], W[2][0]], [W[0][1], W[1][1], W[2][1]], [W[0][2], W[1][2], W[2][2]]];
  }
  mv(M, d) { return [M[0][0] * d[0] + M[0][1] * d[1] + M[0][2] * d[2], M[1][0] * d[0] + M[1][1] * d[1] + M[1][2] * d[2], M[2][0] * d[0] + M[2][1] * d[1] + M[2][2] * d[2]]; }
  mtv(M, d) { return [M[0][0] * d[0] + M[1][0] * d[1] + M[2][0] * d[2], M[0][1] * d[0] + M[1][1] * d[1] + M[2][1] * d[2], M[0][2] * d[0] + M[1][2] * d[1] + M[2][2] * d[2]]; }
  colMajor(M) { return new Float32Array([M[0][0], M[1][0], M[2][0], M[0][1], M[1][1], M[2][1], M[0][2], M[1][2], M[2][2]]); }

  // Marco de la grilla -> plano (x este, y norte).
  uv2xy(u, v) { var A = this.GRID * Math.PI / 180, s = Math.sin(A), c = Math.cos(A); return [u * s + v * c, u * c - v * s]; }
  xy2uv(x, y) { var A = this.GRID * Math.PI / 180, s = Math.sin(A), c = Math.cos(A); return [x * s + y * c, x * c - y * s]; }
  inZone(x, y) { var q = this.xy2uv(x, y), Z = this.ZONE_RECT; return q[0] > Z.u0 + 4 && q[0] < Z.u1 - 4 && q[1] > Z.v0 + 4 && q[1] < Z.v1 - 4; }

  componentDidMount() {
    this.autoInline = window.parent !== window && new URLSearchParams(window.location.search).get('integrado') === '1' && new URLSearchParams(window.location.search).get('miniweb-auto') === '1';
    document.documentElement.toggleAttribute('data-miniweb-embed',this.autoInline);
    var doc = document;
    if (!this.glc) this.glc = doc.querySelector('canvas[data-f="gl"]');
    if (!this.ovc) this.ovc = doc.querySelector('canvas[data-f="ov"]');
    if (!this.root && this.glc) this.root = this.glc.parentNode;
    if (!this.glc || !this.ovc) return;
    if(this.autoInline){
      this.inlineTurn=event=>{var v=this.view,dx=Number(event.detail?.delta)||0,width=Math.max(1,this.cw||1),height=Math.max(1,this.ch||1),fovH=2*Math.atan(Math.tan(v.fov*Math.PI/360)*width/height)*180/Math.PI;v.yaw-=dx*fovH/width;this.req();};
      this.inlineZoom=event=>{this.view.fov=Math.max(15,Math.min(100,this.view.fov*Math.exp((Number(event.detail?.delta)||0)*.001)));this.req();};
      this.ovc.addEventListener('mw-inline-turn',this.inlineTurn);this.ovc.addEventListener('mw-inline-zoom',this.inlineZoom);
      this.inlineNativeWheel=event=>{if(document.documentElement.dataset.mwInlineScroll!=='full'&&!document.fullscreenElement&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey)return;if(event.defaultPrevented||event.target.closest('.hz-pop,.hz-card,.hz-player,.hz-layers'))return;event.preventDefault();this.view.fov=Math.max(15,Math.min(100,this.view.fov*Math.exp(event.deltaY*.001)));this.req();};
      this.root.addEventListener('wheel',this.inlineNativeWheel,{passive:false});
    }
    this.ctx = this.ovc.getContext('2d');
    this.initGL();
    if (this.gl) { this.buildRoutes(); this.buildBrand(); this.buildFlyers(); this.loadSky(); }
    var self = this;
    if (window.ResizeObserver) { this.ro = new ResizeObserver(function () { self.resize(); }); this.ro.observe(this.root); }
    this.onWinResize = function () { self.resize(); };
    window.addEventListener('resize', this.onWinResize);
    this.resize();
    fetch(this.URLD).then(async function (r) {
      if(!r.ok)throw Error('Plano no disponible');const bytes=await r.arrayBuffer();
      self.mediaPlanoVersion=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
      return JSON.parse(new TextDecoder().decode(bytes));
    }).then(function (d) {
      self.data = d; self.buildVerts(); self.buildZone(); self.buildLights(); self.buildBlockInfo(); self.req(); self.drawMini(); self.drawLocator(); self.initMedia();
    }).catch(function () { self.setState({ loadTxt: 'No se pudo cargar el plano.' });if(self.autoInline)window.parent.postMessage({type:'mw-tour-error'},location.origin); });
    var p0 = this.posOf(0);
    this.cam = { x: p0.x, y: p0.y, h: p0.h + 120 };
    this.buildLabels(); this.buildTape(); this.buildEntorno();
    window.addEventListener('keydown', this.onKeyH);
    document.addEventListener('visibilitychange', this.onVisH);
    this.loop();
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.raf); this.dead = true;
    if(this.inlineNativeWheel)this.root?.removeEventListener('wheel',this.inlineNativeWheel);
    if(this.inlineTurn)this.ovc?.removeEventListener('mw-inline-turn',this.inlineTurn);if(this.inlineZoom)this.ovc?.removeEventListener('mw-inline-zoom',this.inlineZoom);
    if (this.ro) this.ro.disconnect();
    window.removeEventListener('resize', this.onWinResize);
    window.removeEventListener('keydown', this.onKeyH);
    document.removeEventListener('visibilitychange', this.onVisH);
    clearTimeout(this.stT);
    this.mediaDialog?.close(); this.localMediaDialog?.close(); this.localMedia?.dispose(); this.mediaEditButton?.remove();
    this.mo = null; this.jump = null; this.pan = null; this.anim = null; this.zAnim = null;
  }

  async initMedia() {
    try {
      if (isLocalMediaHost()) {
        if (new URLSearchParams(location.search).get('editar-medios') !== '1') return;
        this.localMedia = await localMediaDraft('alamos'); if (this.dead) { this.localMedia.dispose(); return; }
        this.mediaSource = {config:this.localMedia.config,projectId:this.localMedia.projectId,lotIds:new Set(this.data.lots.map(l => 'plano:alamos:'+l.m+'-'+l.n)),local:true,planoVersion:this.mediaPlanoVersion};
        const button=document.createElement('button');button.type='button';button.className='rm-local-button';button.textContent='Materiales · borrador local';
        button.onclick=()=>{
          this.pauseForMedia();
          this.localMediaDialog=openLocalUploader({draft:this.localMedia,slug:'alamos',lots:this.data.lots.map(l=>({id:'plano:alamos:'+l.m+'-'+l.n,label:'Manzana '+l.m+' · Lote '+l.n,numero:l.n})),onApply:()=>this.setState({})});
        };
        this.root.append(button);this.mediaEditButton=button;
      } else {this.mediaSource = await alamosInventory();if(this.mediaSource)this.mediaSource.planoVersion=this.mediaPlanoVersion;}
      if (!this.dead) {this.openRequestedLot();this.setState({});}
    } catch { if (!this.dead) this.setStatus('No se pudo cargar el material adicional. El recorrido sigue disponible.',6000); }
  }
  openRequestedLot() {
    const id=new URLSearchParams(location.search).get('lote');
    if (!id || this.processedLot || this.state.loading || !this.mediaSource || !this.data) return;
    this.processedLot=true;
    const source=this.mediaSource,lot=findPublicLot(source.config,source.lots || [],id);
    const card=source.config.lotes?.[lot?.id],ref=card?.recorrido?.plano;
    const index=lot && card?.fichaEnRecorrido!==false && ref?.id==='alamos' && ref.version===this.mediaPlanoVersion
      ? this.data.lots.findIndex(lot=>lot.m+'-'+lot.n===ref.lote) : -1;
    if (index<0){this.setStatus('Este lote ya no está vinculado al recorrido.',8000);return;}
    const camera=this.posOf(0),center=this.data.lots[index].c;
    const east=center[0]-camera.x,north=center[1]-camera.y;
    this.A=0;this.B=0;this.mixAB=0;this.cloud=0;
    this.cam={x:camera.x,y:camera.y,h:camera.h};
    this.view={yaw:Math.atan2(east,north)*180/Math.PI,pitch:Math.atan2(-camera.h,Math.hypot(east,north))*180/Math.PI,fov:this.AIMFOV[0]||58};
    this.setState({started:true,flying:false,playing:false});
    this.settle(0);this.selectLot(index);this.req();
  }
  pauseForMedia() {
    // Dejar el vuelo pausado al cerrar evita reanudar movimiento sin elección del visitante.
    if (this.mo && !this.mo.hold) { this.mo.hold=true;this.mo.v=0;this.setState({playing:false}); }
    this.bgPaused=false;
  }
  openOwnMedia(type, project = false) {
    if (this.jump || this.introOn) { this.setStatus('Espere a que termine el traslado para abrir las imágenes.');return; }
    const source=this.mediaSource;
    let items=[];
    if (source) {
      if (project) items=mediaList(source.config,'',{local:source.local});
      else {const lot=this.data?.lots[this.state.lot];if(lot) items=mediaForPolygon(source.config,lot.m+'-'+lot.n,source);}
    }
    if (type) items=items.filter(item=>item.tipo===type);
    if (!items.length) {
      if (!project) this.setState({lotMedia:type==='panorama'?'360':'fotos'});
      else this.setStatus('Todavía no hay fotos ni panorámicas generales cargadas para este proyecto.',5000);
      return;
    }
    this.pauseForMedia();
    const lot=this.data?.lots[this.state.lot];
    this.mediaDialog=openMediaViewer(items,{context:'recorrido',title:project?'Álamos Productivo · Proyecto':'Manzana '+lot.m+' · Lote '+lot.n,onClose:()=>{this.mediaDialog=null;}});
  }

  // ---------- WebGL: foto 360, zona productiva 3D y partículas ----------
  prog3(vs, fs) {
    var gl = this.gl;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s)); return s; }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.warn(gl.getProgramInfoLog(p));
    var U = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var inf = gl.getActiveUniform(p, i); U[inf.name.replace('[0]', '')] = gl.getUniformLocation(p, inf.name); }
    var A = {}, m = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (var j = 0; j < m; j++) { var ai = gl.getActiveAttrib(p, j); A[ai.name] = gl.getAttribLocation(p, ai.name); }
    return { p: p, U: U, A: A };
  }

  initGL() {
    var gl = this.glc.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) { this.setState({ loadTxt: 'Este navegador no puede mostrar el recorrido 360.' });if(this.autoInline)window.parent.postMessage({type:'mw-tour-error'},location.origin); return; }
    this.gl = gl;
    var NOISE = [
      'float hash(vec3 p){p=fract(p*0.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
      'float noise(vec3 x){vec3 i=floor(x);vec3 g=fract(x);g=g*g*(3.0-2.0*g);',
      'return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),g.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),g.x),g.y),',
      'mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),g.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),g.x),g.y),g.z);}',
      'float fbm(vec3 p){float a=0.5;float s=0.0;for(int k=0;k<5;k++){s+=a*noise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=0.5;}return s;}'
    ].join('\n');
    this.NOISE = NOISE;
    // Foto 360 con nubes.
    this.P = this.prog3('attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}', [
      'precision highp float;varying vec2 v;',
      'uniform sampler2D tA;uniform sampler2D tB;uniform vec3 f;uniform vec3 r;uniform vec3 u;uniform float tx;uniform float ty;',
      'uniform vec3 cam;uniform vec3 cA;uniform vec3 cB;uniform mat3 mA;uniform mat3 mB;uniform float mixAB;uniform float cloud;uniform float time;uniform float prog;',
      'uniform sampler2D zT;uniform vec3 zf;uniform vec3 zr;uniform vec3 zu;uniform float zt;uniform vec4 zbb;uniform float zOn;uniform float zBuild;',
      'uniform sampler2D zT2;uniform vec3 zf2;uniform vec3 zr2;uniform vec3 zu2;uniform float zt2;uniform vec4 zbb2;uniform float zOn2;',
      'uniform sampler2D lowT;uniform sampler2D skyT;uniform sampler2D mkA;uniform sampler2D mkB;uniform float skyOn;uniform float skyRot;uniform float skyAmt;uniform vec2 skySize;',
      NOISE,
      'vec4 samp(sampler2D t,vec3 d,mat3 M){vec3 p=M*d;float lon=atan(p.x,p.z);float lat=asin(clamp(p.y,-1.,1.));',
      'return texture2D(t,vec2(fract(lon/6.2831853+0.5),0.5-lat/3.14159265));}',
      // Reconstrucción cúbica limitada al rango local: conserva detalle sin halos ni enfoque añadido.
      'vec4 skyWeights(float x){float x2=x*x;float x3=x2*x;return vec4(-0.5*x+x2-0.5*x3,1.0-2.5*x2+1.5*x3,0.5*x+2.0*x2-1.5*x3,-0.5*x2+0.5*x3);}',
      'vec3 skySample(vec2 uv){vec2 px=uv*skySize-0.5;vec2 base=floor(px);vec2 f=fract(px);vec4 wx=skyWeights(f.x);vec4 wy=skyWeights(f.y);vec3 sum=vec3(0.0);vec3 lo=vec3(1.0);vec3 hi=vec3(0.0);',
      ' for(int j=0;j<4;j++){for(int i=0;i<4;i++){vec2 q=(base+vec2(float(i-1),float(j-1))+0.5)/skySize;vec3 c=texture2D(skyT,vec2(fract(q.x),clamp(q.y,0.5/skySize.y,1.0-0.5/skySize.y))).rgb;sum+=c*wx[i]*wy[j];if(i>=1&&i<=2&&j>=1&&j<=2){lo=min(lo,c);hi=max(hi,c);}}}return clamp(sum,lo,hi);}',
      'vec3 dirFrom(vec3 d,vec3 c,vec3 o){if(d.y<-0.002){float s=-c.y/d.y;vec3 g=c+d*s;return normalize(g-o);}return d;}',
      'vec3 zov(vec3 col,vec3 dz,sampler2D T,vec3 F,vec3 R,vec3 U,float t,vec4 bb){float cz=dot(dz,F);if(cz<=0.0)return col;',
      ' vec2 pz=vec2(dot(dz,R),dot(dz,U))/(cz*t);vec2 sz=vec2((pz.x+1.0)*0.5,(1.0-pz.y)*0.5);vec2 qz=(sz-bb.xy)/(bb.zw-bb.xy);',
      ' if(qz.x<=0.0||qz.x>=1.0||qz.y<=0.0||qz.y>=1.0)return col;vec4 zc=texture2D(T,qz);float nz=noise(dz*70.0)*0.7+noise(dz*260.0)*0.3;float th=zBuild*1.25-0.12;',
      ' col=mix(col,zc.rgb,zc.a*step(nz,th));float eg=smoothstep(th-0.03,th,nz)*step(zBuild,0.995)*zc.a;return col+vec3(1.0,0.86,0.6)*eg*0.5;}',
      'void main(){vec3 d=normalize(f+r*(v.x*tx)+u*(v.y*ty));',
      'vec3 dA=dirFrom(d,cam,cA);vec3 col=samp(tA,dA,mA).rgb;',
      'if(zOn>0.5)col=zov(col,dA,zT,zf,zr,zu,zt,zbb);',
      'if(mixAB>0.001){vec3 dB=dirFrom(d,cam,cB);vec3 cb=samp(tB,dB,mB).rgb;if(zOn2>0.5)cb=zov(cb,dB,zT2,zf2,zr2,zu2,zt2,zbb2);col=mix(col,cb,mixAB);}',
      // Prueba de cielo: la máscara se lee en las coordenadas de cada foto (igual que la foto); el cielo, en la dirección real.
      'if(skyOn>0.5){vec3 pA=mA*dA;vec4 smA=texture2D(mkA,vec2(fract(atan(pA.x,pA.z)/6.2831853+0.5),0.5-asin(clamp(pA.y,-1.,1.))/3.14159265));float kM=smA.r;float skyGap=smA.a*0.6;',
      ' if(mixAB>0.001){vec3 pB=mB*dirFrom(d,cam,cB);vec4 smB=texture2D(mkB,vec2(fract(atan(pB.x,pB.z)/6.2831853+0.5),0.5-asin(clamp(pB.y,-1.,1.))/3.14159265));kM=mix(kM,smB.r,mixAB);skyGap=mix(skyGap,smB.a*0.6,mixAB);}',
      // Esfera completa: rotación rígida, sin estirar una foto plana sobre el hemisferio.
      ' float high=smoothstep(500.0,1000.0,cam.y);float el=max(-0.20*high,asin(clamp(d.y,-1.,1.)));vec3 sd=vec3((d.x+d.y)*0.70710678,(d.y-d.x)*0.70710678,d.z);',
      ' vec2 suv=vec2(fract(atan(sd.x,sd.z)/6.2831853+skyRot),0.5-asin(clamp(sd.y,-1.,1.))/3.14159265);',
      ' vec3 stars=skySample(suv);float air=exp(-el*2.5);vec3 blue=mix(vec3(0.035,0.07,0.15),vec3(0.18,0.27,0.43),air);',
      // Aire junto al relieve: ninguna estrella en la franja baja; aparición suave entre 3,4° y 18,3° sobre la silueta.
      ' float starFade=smoothstep(0.06,0.32,skyGap)*smoothstep(0.04,0.35,el);',
      // Horizonte luminoso de la imagen aprobada: altura angular común, no una aureola que copie cada cumbre.
      // Sólo la parte baja; las estrellas altas provienen de la fotografía de mayor resolución.
      ' float lx=fract(atan(d.x,d.z)/6.2831853+0.5);float ly=clamp(0.72-(el-0.045)*0.53,0.32,0.72+0.16*high);',
      ' vec3 low=texture2D(lowT,vec2(0.04+lx*0.96,ly)).rgb;',
      ' low=mix(low,texture2D(lowT,vec2(max(0.0,0.04+lx*0.96-0.96),ly)).rgb,smoothstep(0.92,1.0,lx));',
      ' vec3 upper=blue+pow(max(stars-0.015,vec3(0.0)),vec3(1.25))*vec3(0.62,0.67,0.78)*starFade;',
      ' vec3 sk=mix(low,upper,smoothstep(0.15,0.45,el));',
      // Las panorámicas altas tienen cumbres ocultas por nubes reales. Conservar
      // esa franja fotográfica: un cielo despejado hacía parecer cortado el cerro.
      // El fundido ocurre arriba de la cresta, sin inventar relieve ni difuminarlo.
      ' float contextCloud=mix(step(500.0,cA.y),step(500.0,cB.y),mixAB);',
      // Altura angular común: evita columnas/halos que calquen cada pico del contorno.
      ' float cloudFade=smoothstep(0.06,0.48,el);float keepCloud=(1.0-cloudFade)*contextCloud;',
      // Exposición de hora azul, con altas luces comprimidas; la nube mantiene
      // textura y volumen pero pierde el blanco de mediodía de la toma original.
      ' vec3 cloudPhoto=pow(max(col,vec3(0.0)),vec3(1.18))*mix(vec3(0.50,0.58,0.72),vec3(0.35,0.46,0.64),cloudFade);',
      ' sk=mix(sk,cloudPhoto,keepCloud);',
      // La misma exposición cruza suavemente la unión nube/cumbre: no recortar
      // dos iluminaciones diferentes con la máscara de silueta.
      ' vec3 land=mix(col,col*vec3(0.84,0.88,0.97),skyAmt);land=mix(land,cloudPhoto,contextCloud*smoothstep(-0.08,0.10,el));',
      ' col=mix(land,sk,kM);}',
      'if(cloud>0.001){vec3 q=d*2.2+vec3(time*0.03,0.0,time*0.02)+vec3(0.0,0.0,prog*3.5);',
      ' float n=fbm(q*1.6);float n2=fbm(q*4.0+7.0);float dens=smoothstep(0.42,0.78,n*0.75+n2*0.35)*cloud;',
      ' float sun=clamp(dot(d,normalize(vec3(-0.5,0.6,0.3)))*0.5+0.5,0.0,1.0);',
      ' vec3 cc=mix(vec3(0.78,0.82,0.88),vec3(1.0,0.99,0.96),n2*0.6+sun*0.4);col=mix(col,cc,dens);col=mix(col,vec3(0.93,0.95,0.98),cloud*cloud*0.35);}',
      'float vig=1.0-0.35*cloud*dot(v,v)*0.5;col*=vig;gl_FragColor=vec4(col,1.0);}'
    ].join('\n'));
    var VIEW = [
      'uniform vec3 eye;uniform vec3 vr;uniform vec3 vu;uniform vec3 vf;uniform float tx;uniform float ty;',
      'vec4 project(vec3 w){vec3 d=w-eye;float x=dot(d,vr),y=dot(d,vu),z=dot(d,vf);',
      'float N=1.0,F=4000.0;return vec4(x/tx,y/ty,z*(F+N)/(F-N)-2.0*F*N/(F-N),z);}'
    ].join('\n');
    this.VIEW_SRC = VIEW;
    // Galpones, calles y vehículos.
    this.M = this.prog3([
      'attribute vec3 pos;attribute vec3 nrm;attribute vec3 col;attribute float mat;',
      VIEW, 'uniform mat4 sunVP;',
      'varying vec3 vw;varying vec3 vn;varying vec3 vc;varying float vm;varying vec4 vs;',
      'void main(){vw=pos;vn=nrm;vc=col;vm=mat;vs=sunVP*vec4(pos,1.0);gl_Position=project(pos);}'
    ].join('\n'), [
      'precision highp float;',
      'varying vec3 vw;varying vec3 vn;varying vec3 vc;varying float vm;varying vec4 vs;',
      'uniform vec3 sunDir;uniform sampler2D shadow;uniform float build;uniform vec3 eye;uniform vec4 rect;uniform float gridA;uniform float time;',
      'uniform sampler2D tRip;uniform sampler2D tHor;uniform sampler2D tPas;uniform sampler2D tMug;',
      NOISE,
      'float unpack(vec4 c){return dot(c,vec4(1.0,1.0/255.0,1.0/65025.0,1.0/16581375.0));}',
      'float shade(){vec3 p=vs.xyz/vs.w*0.5+0.5;if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0)return 1.0;float s=0.0;',
      'for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){float d=unpack(texture2D(shadow,p.xy+vec2(float(i),float(j))/2048.0));s+=p.z-0.0006>d?0.0:1.0;}return s/9.0;}',
      'uniform vec3 zf;uniform vec3 zr;uniform vec3 zu;uniform float zt;uniform vec4 zbb;uniform float zOn;uniform sampler2D zT;',
      'uniform vec3 zf2;uniform vec3 zr2;uniform vec3 zu2;uniform float zt2;uniform vec4 zbb2;uniform float zOn2;uniform sampler2D zT2;uniform vec3 zcA;uniform vec3 zcB;uniform float zMix;',
      'float zcov(vec3 dz,sampler2D T,vec3 F,vec3 R,vec3 U,float t,vec4 bb){float cz=dot(dz,F);if(cz<=0.0)return 0.0;vec2 pz=vec2(dot(dz,R),dot(dz,U))/(cz*t);',
      ' vec2 sz=vec2((pz.x+1.0)*0.5,(1.0-pz.y)*0.5);vec2 qz=(sz-bb.xy)/(bb.zw-bb.xy);if(qz.x<=0.0||qz.x>=1.0||qz.y<=0.0||qz.y>=1.0)return 0.0;return step(0.5,texture2D(T,qz).a);}',
      'void main(){',
      ' float cov=0.0;if(zOn>0.5)cov+=(1.0-zMix)*zcov(normalize(vw-zcA),zT,zf,zr,zu,zt,zbb);if(zOn2>0.5)cov+=zMix*zcov(normalize(vw-zcB),zT2,zf2,zr2,zu2,zt2,zbb2);if(cov>0.995)discard;',
      ' if(vm>12.5){gl_FragColor=vec4(0.0,0.0,0.0,vc.r*smoothstep(0.3,0.9,build)*(1.0-cov));return;}',
      ' float ca=cos(gridA),sa=sin(gridA);float gu=vw.x*sa+vw.z*ca;float gv=vw.x*ca-vw.z*sa;',
      ' float rise=clamp(vw.y/16.0,0.0,1.0);',
      ' float dn=noise(vw*0.45)*0.65+noise(vw*2.3)*0.35;',
      ' float th=build*1.25-0.12-rise*0.18;',
      ' if(vm>4.5&&vm<7.5){th=build*1.4-0.2;}',
      ' if(dn>th)discard;',
      ' vec3 n=normalize(vn);if(dot(n,eye-vw)<0.0)n=-n;vec3 c=vc;float spec=0.0;float rough=0.8;',
      ' if(vm<1.5){',
      '  float dk=step(dot(vc,vec3(0.33)),0.3);float dd=length(eye-vw);float bk=0.55*clamp(1.0-dd/650.0,0.0,1.0);',
      '  float ph=gv/0.76*6.2831853;vec3 tv=vec3(cos(gridA),0.0,-sin(gridA));n=normalize(n+tv*(sin(ph)*bk));',
      '  float gm=texture2D(tMug,vec2(gu/9.0,gv/7.0)).r;c*=0.78+0.44*gm;',
      '  float sky=(1.0-dk)*step(0.86,fract(gv/7.5))*step(0.04,fract(gu/9.0));c=mix(c,vec3(0.86,0.9,0.92),sky*0.4);',
      '  c*=0.95+0.08*noise(vw*0.5);spec=mix(0.4,0.6,dk);rough=mix(0.3,0.2,dk);',
      ' }else if(vm<2.5){',
      '  bool ax=abs(n.x)>abs(n.z);float tw=ax?vw.z:vw.x;float dd=length(eye-vw);float bk=0.5*clamp(1.0-dd/500.0,0.0,1.0);',
      '  vec3 tt=ax?vec3(0.0,0.0,1.0):vec3(1.0,0.0,0.0);float rib=sin(tw/0.333*6.2831853);n=normalize(n+tt*rib*bk);',
      '  float dark=step(dot(vc,vec3(0.33)),0.3);float gm=texture2D(tMug,vec2(vw.y/8.0,tw/6.0)).r;c*=0.82+0.36*gm;',
      '  c*=1.0-0.06*step(0.985,fract(vw.y/2.9));',
      '  c*=0.96+0.06*noise(vw*vec3(0.4,2.5,0.4));',
      '  c*=1.0-0.18*smoothstep(1.0,0.0,vw.y-0.0);spec=mix(0.15,0.4,dark);rough=mix(0.6,0.3,dark);',
      ' }else if(vm<3.5){',
      '  c*=0.9+0.1*step(0.5,fract(vw.y*3.0));spec=0.1;',
      ' }else if(vm<4.5){',
      '  c=mix(vec3(0.12,0.16,0.19),vec3(0.55,0.65,0.72),0.35+0.3*fract(vw.y/3.2));spec=0.6;rough=0.15;',
      ' }else if(vm<5.5){',
      '  c=texture2D(tRip,vec2(gu,gv)/8.0).rgb*(vc/vec3(0.6,0.57,0.5));c*=0.92+0.12*noise(vw*0.08);',
      ' }else if(vm<6.5){',
      '  c=texture2D(tHor,vec2(gu,gv)/8.0).rgb*(vc/vec3(0.6,0.6,0.58));c*=(1.0-0.08*step(0.985,fract(gu/5.0)))*(1.0-0.08*step(0.985,fract(gv/5.0)));c*=0.94+0.1*noise(vw*0.12);',
      ' }else if(vm<7.5){',
      '  c=texture2D(tPas,vec2(gu,gv)/8.0).rgb*mix(vec3(1.0),vec3(1.1,0.95,0.8),noise(vw*0.03));float gy=dot(c,vec3(0.33));c=mix(vec3(gy),c,0.62)*vec3(0.92,0.9,0.82);',
      ' }else if(vm<8.5){spec=0.7;rough=0.2;',
      ' }else if(vm<9.5){spec=0.2;',
      ' }else if(vm<10.5){float lv=noise(vw*1.6)*0.6+noise(vw*5.0)*0.4;c=vc*(0.7+0.55*lv);',
      ' }else if(vm<11.5){',
      '  vec2 gp=vec2(fract(gv/1.02),fract(vw.y*1.7));float grid=step(0.93,gp.x)+step(0.94,gp.y);c=mix(vec3(0.04,0.07,0.13),vec3(0.55,0.58,0.62),clamp(grid,0.0,1.0)*0.6);spec=0.9;rough=0.08;',
      ' }else{',
      '  float bd=fract((abs(n.x)>abs(n.z)?vw.z:vw.x)*5.0);c=vc*(0.85+0.15*step(0.12,bd))*(0.9+0.15*noise(vw*vec3(0.3,4.0,0.3)));spec=0.05;',
      ' }',
      ' vec3 L=normalize(sunDir);float nl=max(dot(n,L),0.0);float sh=shade();',
      ' vec3 V=normalize(eye-vw);vec3 Hh=normalize(L+V);float sp=pow(max(dot(n,Hh),0.0),mix(80.0,10.0,rough))*spec;',
      ' float fr=pow(1.0-max(dot(n,V),0.0),4.0)*spec*0.5;',
      ' vec3 skyc=vec3(0.6,0.7,0.84);vec3 grd=vec3(0.4,0.38,0.31);',
      ' vec3 amb=mix(grd,skyc,n.y*0.5+0.5)*0.36;',
      ' float ao=0.68+0.32*clamp(vw.y/3.0+0.4,0.0,1.0);',
      ' vec3 lit=c*(amb*ao+vec3(1.0,0.95,0.86)*0.95*nl*sh)+vec3(1.0,0.97,0.9)*sp*sh;',
      ' vec3 Rf=reflect(-V,n);vec3 env=mix(grd*0.8,skyc*1.15,clamp(Rf.y*0.5+0.5,0.0,1.0));lit+=env*fr*1.2+env*spec*0.04;',
      ' float lum=dot(lit,vec3(0.299,0.587,0.114));lit=mix(vec3(lum),lit,0.93);',
      ' float dist=length(eye-vw);lit=mix(lit,vec3(0.68,0.73,0.78),0.015+clamp((dist-150.0)/1600.0,0.0,0.28));',
      ' lit*=1.02;lit=(lit*(2.51*lit+0.03))/(lit*(2.43*lit+0.59)+0.14);',
      ' float edge=smoothstep(th-0.07,th,dn);lit=mix(lit,vec3(1.0,0.82,0.5)*1.6,edge*step(build,0.995));',
      ' float a=1.0;',
      ' if(vm>4.5&&vm<7.5){float eu=min(gu-rect.x,rect.y-gu);float ev=min(gv-rect.z,rect.w-gv);a=clamp(min(eu,ev)/4.0,0.0,1.0);}',
      ' gl_FragColor=vec4(lit,a*(1.0-cov));}'
    ].join('\n'));
    // Sombra (profundidad vista desde el sol).
    this.SH = this.prog3('attribute vec3 pos;uniform mat4 sunVP;varying float dz;void main(){vec4 p=sunVP*vec4(pos,1.0);dz=p.z*0.5+0.5;gl_Position=p;}', [
      'precision highp float;varying float dz;',
      'vec4 pack(float d){vec4 e=vec4(1.0,255.0,65025.0,16581375.0)*d;e=fract(e);e-=e.yzww*vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0);return e;}',
      'void main(){gl_FragColor=pack(dz);}'
    ].join('\n'));
    // Partículas que arman y desarman los galpones.
    this.PT = this.prog3([
      'attribute vec3 tgt;attribute vec4 rnd;', VIEW,
      'uniform float build;uniform float time;uniform float dirSign;varying float va;varying float vt;',
      'void main(){float d=rnd.w;float p=clamp((build*1.55-d*0.55),0.0,1.0);float e=p*p*(3.0-2.0*p);',
      ' float ang=(1.0-e)*(2.5+rnd.x*2.0);float R=(1.0-e)*(40.0+rnd.y*90.0);',
      ' vec3 off=vec3(cos(ang+rnd.z*6.28)*R,(1.0-e)*(120.0+rnd.x*160.0),sin(ang+rnd.z*6.28)*R);',
      ' vec3 w=tgt+off+vec3(0.0,sin(time*2.0+rnd.z*20.0)*(1.0-e)*3.0,0.0);',
      ' vec4 c=project(w);gl_Position=c;float z=max(c.w,1.0);',
      ' gl_PointSize=clamp(900.0/z,1.5,7.0)*(0.6+rnd.y*0.8);',
      ' va=sin(3.14159*p)*(0.55+0.45*rnd.x);vt=rnd.y;}'
    ].join('\n'), [
      'precision highp float;varying float va;varying float vt;',
      'void main(){vec2 q=gl_PointCoord-0.5;float r=length(q);float g=exp(-r*r*18.0);if(g<0.02)discard;',
      'vec3 c=mix(vec3(1.0,0.86,0.55),vec3(0.75,0.88,1.0),vt);gl_FragColor=vec4(c*g*1.4,g*va);}'
    ].join('\n'));
    // Plano de lotes como luz: líneas de grosor fijo en pantalla, color por etapa, lote resaltado.
    this.LG = this.prog3([
      'attribute vec3 base;attribute vec3 dir;attribute vec4 aux;attribute vec2 sl;', VIEW, 'uniform float pxk;',
      'varying float vSide;varying float vAlong;varying float vLen;varying float vKind;varying vec3 vW;varying float vOff;varying float vHW;varying float vPx;',
      'void main(){float kind=aux.w;vec3 p=base;vKind=kind;vLen=sl.x;vOff=sl.y;vSide=aux.x;vAlong=aux.z;vHW=0.0;vPx=1.0;',
      ' if(kind<1.5||(kind>4.5&&kind<5.5)){float z=max(dot(base-eye,vf),1.0);float mpp=z*pxk;',
      '  float wpx=kind>4.5?16.0:(kind>0.5?14.0:8.0);float w=wpx*mpp;',
      '  vec3 pr=normalize(vec3(-dir.z,0.0,dir.x));p+=pr*aux.x*w*0.5+dir*aux.y*w*0.5;vAlong=aux.z+aux.y*w*0.5;vHW=w*0.5;vPx=mpp;}',
      ' vW=p;gl_Position=project(p);}'
    ].join('\n'), [
      'precision highp float;',
      'varying float vSide;varying float vAlong;varying float vLen;varying float vKind;varying vec3 vW;varying float vOff;varying float vHW;varying float vPx;',
      'uniform float time;uniform vec2 camXZ;uniform float reveal;uniform float fade;uniform float zoneT;uniform vec4 rect;uniform float gridA;',
      'void main(){',
      ' float st=floor(vOff/1000.0+0.001);',
      ' vec3 sc=st<1.5?vec3(1.0,0.78,0.38):(st<2.5?vec3(0.45,0.95,0.76):vec3(0.55,0.75,1.0));',
      ' float r=length(vW.xz-camXZ);float rev=1.0-smoothstep(reveal-50.0,reveal,r);',
      ' float front=exp(-pow((r-reveal)/16.0,2.0))*step(reveal,2500.0);',
      ' float ca=cos(gridA),sa=sin(gridA);float gu=vW.x*sa+vW.z*ca;float gv=vW.x*ca-vW.z*sa;',
      ' float inz=step(rect.x+3.0,gu)*step(gu,rect.y-3.0)*step(rect.z+3.0,gv)*step(gv,rect.w-3.0);float zm=1.0-inz*zoneT*(vKind>3.5?0.35:1.0);',
      ' vec3 col=sc;float I=0.0;',
      ' if(vKind<1.5||(vKind>4.5&&vKind<5.5)){',
      '  float d=abs(vSide)*vHW;float ex=max(0.0,-vAlong)+max(0.0,vAlong-vLen);float dpx=length(vec2(d,ex))/vPx;',
      '  bool blk=vKind>0.5&&vKind<1.5;bool hov=vKind>4.5;',
      '  float cw=hov?1.1:(blk?0.75:0.4);',
      '  float core=1.0-smoothstep(cw-0.7,cw+0.7,dpx);',
      '  float glow=exp(-dpx*dpx/(hov?14.0:(blk?8.0:4.0)))*(hov?0.45:(blk?0.2:0.09));',
      '  I=core*(hov?1.35:(blk?0.9:0.55))+glow;',
      '  if(blk){float ph=fract((vAlong+fract(vOff/1000.0)*997.0)/48.0-time*0.05);float dt=exp(-pow((ph-0.5)*48.0/1.6,2.0));I+=dt*(core*1.6+glow*3.0);}',
      '  I+=front*(core*1.4+glow*2.0);',
      '  col=mix(sc,vec3(1.0),core*(hov?0.55:0.3));',
      ' }else if(vKind<2.5){',
      '  I=0.018+front*0.08;',
      ' }else if(vKind>3.5&&vKind<4.5){',
      '  I=0.07+0.02*sin(time*2.5);col=mix(sc,vec3(1.0),0.25);',
      ' }',
      ' gl_FragColor=vec4(col*I*rev*fade*zm,1.0);}'
    ].join('\n'));
    // Marca en el pasto: logo blanco, gastado como pintura sobre césped.
    this.BR = this.prog3([
      'attribute vec3 pos;attribute vec2 uv;', VIEW, 'varying vec2 vUv;varying vec3 vW;',
      'void main(){vUv=uv;vW=pos;gl_Position=project(pos);}'
    ].join('\n'), [
      'precision highp float;uniform sampler2D tL;uniform float fade;varying vec2 vUv;varying vec3 vW;', NOISE,
      'void main(){float a=texture2D(tL,vUv).a;',
      ' gl_FragColor=vec4(vec3(1.0),a*0.78*fade);}'
    ].join('\n'));
    // Rutas y accesos: banda ancha y suave con tránsito de luz (rutas) o flechas que avanzan hacia el loteo (accesos).
    this.RT = this.prog3([
      'attribute vec3 pos;attribute vec2 off;attribute vec4 aux;', VIEW, 'uniform float pxk;',
      'varying float vS;varying float vA;varying float vK;varying float vL;varying float vHW;varying float vPx;',
      'void main(){float k=aux.z;float z=max(dot(pos-eye,vf),1.0);float mpp=z*pxk;',
      ' float W=k<0.5?9.0:(k<1.5?7.0:5.0);float mn=k<0.5?4.0:(k<1.5?3.5:3.0);float hw=max(W,mn*mpp);',
      ' vec3 p=pos+vec3(off.x,0.0,off.y)*aux.x*hw;vS=aux.x;vA=aux.y;vK=k;vL=aux.w;vHW=hw;vPx=mpp;gl_Position=project(p);}'
    ].join('\n'), [
      'precision highp float;uniform float time;uniform float fade;',
      'varying float vS;varying float vA;varying float vK;varying float vL;varying float vHW;varying float vPx;',
      'void main(){float at=abs(vS);',
      ' vec3 col=vK<0.5?vec3(1.0,0.92,0.78):(vK<1.5?vec3(0.6,0.78,1.0):vec3(1.0,0.7,0.32));',
      ' float epx=(1.0-at)*vHW/vPx;float body=smoothstep(0.0,1.6,epx);',
      ' float I=0.15*body+exp(-pow((at-0.84)/0.09,2.0))*0.42*body;',
      ' if(vK<1.5){float lane=vS<0.0?1.0:-1.0;float lc=exp(-pow((at-0.45)/0.2,2.0));',
      '  float sp=55.0;float q=(vA-lane*time*(vK<0.5?20.0:14.0))/sp;float cl=floor(q);float fq=fract(q);',
      '  float rn=fract(sin(cl*12.9898+lane*78.233)*43758.5453);float L=max(6.0,vPx*3.0)/sp;',
      '  float bl=exp(-pow((fq-0.5)/L,2.0))*step(0.35,rn);',
      '  vec3 hc=lane>0.0?vec3(1.0,0.97,0.9):vec3(1.0,0.5,0.32);',
      '  I+=bl*lc*2.2;col=mix(col,hc,clamp(bl*lc,0.0,1.0)*0.7);',
      ' }else{float sp=max(16.0,vPx*14.0);float q=(vA+at*vHW*0.9-time*max(8.0,vPx*6.0))/sp;float fq=fract(q);',
      '  float ch=smoothstep(0.0,0.07,fq)*(1.0-smoothstep(0.24,0.32,fq));I+=ch*1.1*body*(1.0-smoothstep(0.78,0.95,at));}',
      ' float ef=smoothstep(0.0,30.0,vA)*smoothstep(0.0,30.0,vL-vA);if(vK>1.5)ef=smoothstep(0.0,30.0,vL-vA);',
      ' gl_FragColor=vec4(col*I*fade*ef,1.0);}'
    ].join('\n'));
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.quadBuf = b;
    this.blank = this.mkTex();
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    // Mapa de sombras.
    this.shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.shTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2048, 2048, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shTex, 0);
    var rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 2048, 2048);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    var self = this;
    // Texturas de materiales (repetibles, con mipmaps).
    this.mtex = {};
    [['tRip', '/assets/recorridos/alamos/tex-ripio.jpg'], ['tHor', '/assets/recorridos/alamos/tex-hormigon.jpg'], ['tPas', '/assets/recorridos/alamos/tex-pasto.jpg'], ['tMug', '/assets/recorridos/alamos/tex-mugre.jpg']].forEach(function (e) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128]));
      self.mtex[e[0]] = t;
      var img = new Image();
      img.onload = function () {
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        var an = gl.getExtension('EXT_texture_filter_anisotropic');
        if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        self.req();
      };
      img.src = e[1];
    });
    this.zrTex = this.ZR.map(function (z) {
      var o = { t: gl.createTexture(), ready: false };
      gl.bindTexture(gl.TEXTURE_2D, o.t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      var img = new Image();
      img.onload = function () {
        gl.bindTexture(gl.TEXTURE_2D, o.t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        o.ready = true; self.req();
      };
      img.src = z.url;
      return o;
    });
    this.ensureTex(0, function () {
      self.setState({ loading: false });
      if(self.autoInline){var point=self.posOf(0);self.cam={x:point.x,y:point.y,h:point.h};self.cloud=0;self.setState({started:true,helpDone:true});self.req();window.parent.postMessage({type:'mw-tour-ready'},location.origin)}
      self.openRequestedLot();
    });
  }

  // Cielo común: recorte a resolución nativa, sin reescalado intermedio; una máscara por foto.
  loadSky() {
    var gl = this.gl, self = this; if (!gl) return;
    var img = new Image();
    img.onload = function () {
      if (self.dead) return;
      var cv = document.createElement('canvas'), limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      var sw = img.naturalWidth, sh = Math.round(img.naturalHeight * self.SKY_HORIZON), scale = Math.min(1, limit / sw, limit / sh);
      cv.width = Math.max(1, Math.round(sw * scale)); cv.height = Math.max(1, Math.round(sh * scale));
      cv.getContext('2d').drawImage(img, 0, 0, sw, sh, 0, 0, cv.width, cv.height);
      self.skySize = [cv.width, cv.height];
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, cv);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // Sin mipmaps implícitos: atan/fract salta en la unión angular y generaba una raya intermitente.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      self.skyTex = t; self.req();
    };
    img.onerror = function () { if (!self.dead) self.setStatus('No se pudo cargar el cielo de prueba.', 5000); };
    img.src = this.SKY_URL;
    var lowImg = new Image();
    lowImg.onload = function () {
      if (self.dead) return;
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, lowImg);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      self.skyLowTex = t; self.req();
    };
    lowImg.onerror = function () { if (!self.dead) self.setStatus('No se pudo cargar el horizonte del cielo.', 5000); };
    lowImg.src = this.SKY_LOW_URL;
    this.skyMk = this.SKY_MASKS.map(function (u) {
      var o = { t: null, real: !!u };
      if (!u) {   // sin máscara: textura negra de 1 px (cielo original)
        o.t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, o.t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([0]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return o;
      }
      var im = new Image();
      im.onload = function () {
        if (self.dead) return;
        // Fundido atmosférico sobre TODO el contorno, calculado una vez al cargar.
        // Luminancia: máscara suavizada hacia el relieve; alfa: distancia al contorno.
        // Se mantienen los PNG originales y las nubes animadas independientes.
        var mc = document.createElement('canvas'); mc.width = im.naturalWidth; mc.height = im.naturalHeight;
        var cx = mc.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0);
        var pixels = cx.getImageData(0, 0, mc.width, mc.height).data;
        // Extender los extremos evita una costura de desenfoque en los 0/360 grados.
        var sigma = mc.height / 1024 * 1.5, pad = Math.ceil(sigma * 3);
        var edge = document.createElement('canvas'); edge.width = mc.width + pad * 2; edge.height = mc.height + pad * 2;
        var ec = edge.getContext('2d', { willReadFrequently: true });
        ec.drawImage(im, pad, pad);
        ec.drawImage(im, mc.width - pad, 0, pad, mc.height, 0, pad, pad, mc.height);
        ec.drawImage(im, 0, 0, pad, mc.height, mc.width + pad, pad, pad, mc.height);
        ec.drawImage(im, 0, 0, mc.width, 1, pad, 0, mc.width, pad);
        ec.drawImage(im, 0, mc.height - 1, mc.width, 1, pad, mc.height + pad, mc.width, pad);
        cx.clearRect(0, 0, mc.width, mc.height); cx.filter = 'blur(' + sigma + 'px)';
        cx.drawImage(edge, -pad, -pad); cx.filter = 'none';
        var softened = cx.getImageData(0, 0, mc.width, mc.height).data;
        var packed = new Uint8Array(mc.width * mc.height * 2);
        for (var x = 0; x < mc.width; x++) {
          var ridge = mc.height;
          for (var y = mc.height - 1; y >= 0; y--) {
            var ix = y * mc.width + x, mask = pixels[ix * 4];
            if (mask < 128) ridge = y;
            // Fundir hacia dentro de la montaña evita dejar un halo del cielo diurno.
            // La silueta sigue presente; sólo su contacto con el aire pierde el corte binario.
            var feather = Math.max(0, Math.min(1, (softened[ix * 4] / 255 - 0.015) / 0.485));
            feather = feather * feather * (3 - 2 * feather);
            packed[ix * 2] = Math.max(mask, Math.round(feather * 224));
            packed[ix * 2 + 1] = Math.round(Math.min(1, Math.max(0, ridge - y) / mc.height * Math.PI / 0.6) * 255);
          }
        }
        var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, mc.width, mc.height, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, packed);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        o.t = t; self.req();
      };
      im.onerror = function () { if (!self.dead) self.setStatus('No se pudo cargar una máscara de cielo.', 5000); };
      im.src = u;
      return o;
    });
  }

  // Render fotorrealista del punto actual: cámara del encuadre y si se puede mostrar.
  zrState(i) {
    if (i == null) i = this.A;
    var z = this.ZR[i], T = this.zrTex && this.zrTex[i];
    var on = !!(!this.commonZonePreview && z && T && T.ready && this.zoneT > 0.001 && !this.state.clean);
    if (!z) return { on: false };
    var R = Math.PI / 180, y = z.yaw * R, p = z.pitch * R;
    return {
      on: on, t: T ? T.t : null, tz: Math.tan(z.fov * R / 2), bb: z.bb,
      f: [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)],
      r: [Math.cos(y), 0, -Math.sin(y)],
      u: [-Math.sin(p) * Math.sin(y), Math.cos(p), -Math.sin(p) * Math.cos(y)]
    };
  }
  setZr(prog, Z, unit, sfx) {
    var gl = this.gl, k = sfx || '', U = prog.U;
    gl.uniform1f(U['zOn' + k], Z.on ? 1 : 0);
    if (!Z.f) return;
    gl.uniform3fv(U['zf' + k], Z.f); gl.uniform3fv(U['zr' + k], Z.r); gl.uniform3fv(U['zu' + k], Z.u);
    gl.uniform1f(U['zt' + k], Z.tz); gl.uniform4fv(U['zbb' + k], Z.bb);
    if (unit != null && Z.t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, Z.t); gl.uniform1i(U['zT' + k], unit); gl.activeTexture(gl.TEXTURE0); }
  }
  // Render de la foto de destino durante el cruce (sólo si se ve).
  zrState2() { return this.mixAB > 0.001 && this.B !== this.A ? this.zrState(this.B) : { on: false }; }

  mkTex() {
    var gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([200, 210, 220]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  ensureTex(i, done) {
    var self = this, s = this.SCENES[i];
    if (!s) return;
    if (this.tex[i] && this.tex[i].ready) { if (done) done(); return; }
    if (!this.tex[i]) this.tex[i] = { t: this.mkTex(), ready: false, cb: [] };
    var T = this.tex[i];
    if (done) T.cb.push(done);
    if (T.loading || T.err) return;
    T.loading = true;
    var alive = function () { return self.tex[i] === T; };
    this.loadImg(s.url4, T.t, function () {
      T.ready = true; T.loading = false;
      var cbs = T.cb; T.cb = [];
      cbs.forEach(function (c) { c(); });
      if (i === self.state.cur && !self.anim) self.upgrade(i);
    }, function () {
      T.loading = false; T.err = true; T.cb = [];
      if (self.state.loading){self.setState({ loadTxt: 'No se pudo cargar una foto del recorrido. Revise la conexión y recargue la página.' });if(self.autoInline)window.parent.postMessage({type:'mw-tour-error'},location.origin);}
    }, alive);
  }
  retryTex() { for (var k in this.tex) if (this.tex[k].err) this.tex[k].err = false; }
  upgrade(i) {
    var T = this.tex[i], s = this.SCENES[i];
    if (!T || T.hi || !(this.maxTex >= 8192) || !s.url8) return;
    var self = this;
    T.hi = true; this.loadImg(s.url8, T.t, null, function () {}, function () { return self.tex[i] === T; });
  }
  settle(j) {
    var gl = this.gl;
    this.revealT0 = performance.now();
    for (var k in this.tex) {
      var n = +k;
      if (Math.abs(n - j) > 1 || (n !== j && this.tex[k].hi)) { gl.deleteTexture(this.tex[k].t); delete this.tex[k]; }
    }
    this.upgrade(j);
    if (j < this.TOUR_COUNT && j + 1 < this.TOUR_COUNT) this.ensureTex(j + 1, null);
    if (j < this.TOUR_COUNT && j - 1 >= 0) this.ensureTex(j - 1, null);
  }
  // alive: la textura sigue vigente (settle o trimTex pueden haberla borrado mientras bajaba la imagen).
  loadImg(url, t, done, fail, alive) {
    var self = this, img = new Image();
    img.onload = function () {
      if (self.dead || (alive && !alive()) || !self.gl.isTexture(t)) return;
      var gl = self.gl; gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      self.req(); if (done) done();
    };
    img.onerror = function () { if (self.dead || (alive && !alive())) return; if (fail) fail(); else self.setState({ loadTxt: 'No se pudo cargar una foto del recorrido.' }); };
    img.src = url;
  }

  // ---------- Zona productiva: modelo 3D a escala real (metros) ----------
  // Galpones de estilo nórdico al frente de las calles este-oeste, con playa de estacionamiento.
  // Las calles norte-sur quedan como calle común.
  buildZone() {
    var self = this, d = this.data, V = [], PTS = [], groundVertices = [];
    this.photoBuildings = [];
    this.photoCars = []; this.photoTrucks = []; this.photoTrees = [];
    var zs = [], ZR = this.ZONE_RECT;
    d.layers.PLANO.forEach(function (s) { s.forEach(function (p) { if (self.inZone(p[0], p[1])) zs.push(p[2]); }); });
    var g0 = (zs.length ? zs.reduce(function (a, b) { return a + b; }, 0) / zs.length : d.ground) - d.ground;
    this.zoneGround = g0;
    function W(u, v, h) { var q = self.uv2xy(u, v); return [q[0], g0 + h, q[1]]; }
    function tri(a, b, c, col, mat) {
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      [a, b, c].forEach(function (p) { V.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], mat); });
    }
    function quad(a, b, c, e, col, mat) { tri(a, b, c, col, mat); tri(a, c, e, col, mat); }
    // Sombra de contacto: anillo alrededor de una huella, oscuro adentro y transparente afuera.
    function aoRing(u0, u1, v0, v1, w, a) {
      var I = [W(u0, v0, 0.18), W(u0, v1, 0.18), W(u1, v1, 0.18), W(u1, v0, 0.18)];
      var O = [W(u0 - w, v0 - w, 0.18), W(u0 - w, v1 + w, 0.18), W(u1 + w, v1 + w, 0.18), W(u1 + w, v0 - w, 0.18)];
      for (var k = 0; k < 4; k++) {
        var i0 = I[k], i1 = I[(k + 1) % 4], o0 = O[k], o1 = O[(k + 1) % 4];
        [[i0, i1, o1], [i0, o1, o0]].forEach(function (t) {
          t.forEach(function (p) { var al = (p === i0 || p === i1) ? a : 0; V.push(p[0], p[1], p[2], 0, 1, 0, al, 0, 0, 13); });
        });
      }
    }
    function sample(a, b, c, e, dens) {
      var ar = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]);
      var n = Math.min(900, Math.round(ar * dens));
      for (var i = 0; i < n; i++) {
        var s = Math.random(), t = Math.random();
        PTS.push(a[0] + (b[0] - a[0]) * s + (e[0] - a[0]) * t, a[1] + (b[1] - a[1]) * s + (e[1] - a[1]) * t, a[2] + (b[2] - a[2]) * s + (e[2] - a[2]) * t,
          Math.random() * 2 - 1, Math.random(), Math.random(), Math.random());
      }
    }
    // Sombra proyectada por el sol sobre el piso: envolvente de la huella y de la huella desplazada.
    var SR = Math.PI / 180, sAz = self.SUN.az * SR, sEl = self.SUN.el * SR;
    var sunX = Math.sin(sAz), sunZ = Math.cos(sAz), sk = 1 / Math.tan(sEl);
    function castShadow(u0, u1, v0, v1, h, alpha) {
      var pts = [[u0, v0], [u0, v1], [u1, v1], [u1, v0]].map(function (q) { return self.uv2xy(q[0], q[1]); });
      var off = [-sunX * h * sk, -sunZ * h * sk];
      var all = pts.concat(pts.map(function (p) { return [p[0] + off[0], p[1] + off[1]]; }));
      all.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
      var lo = [], up = [];
      all.forEach(function (p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
      all.slice().reverse().forEach(function (p) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); });
      var hull = lo.slice(0, -1).concat(up.slice(0, -1)), cx = 0, cz = 0;
      hull.forEach(function (p) { cx += p[0]; cz += p[1]; }); cx /= hull.length; cz /= hull.length;
      for (var k = 0; k < hull.length; k++) {
        var a = hull[k], b = hull[(k + 1) % hull.length];
        [[cx, cz], a, b].forEach(function (p) { V.push(p[0], g0 + 0.2, p[1], 0, 1, 0, alpha, 0, 0, 13); });
      }
    }
    function box(u0, u1, v0, v1, h0, h1, col, mat, colTop, matTop, dens) {
      var A = W(u0, v0, h0), B = W(u0, v1, h0), C = W(u1, v1, h0), D = W(u1, v0, h0);
      var A2 = W(u0, v0, h1), B2 = W(u0, v1, h1), C2 = W(u1, v1, h1), D2 = W(u1, v0, h1);
      quad(A2, B2, C2, D2, colTop || col, matTop != null ? matTop : mat);
      quad(A, B, B2, A2, col, mat); quad(B, C, C2, B2, col, mat); quad(C, D, D2, C2, col, mat); quad(D, A, A2, D2, col, mat);
      if (dens) { sample(A2, B2, C2, D2, dens); sample(A, B, B2, A2, dens * 0.6); sample(B, C, C2, B2, dens * 0.6); sample(C, D, D2, C2, dens * 0.6); sample(D, A, A2, D2, dens * 0.6); }
    }
    function flat(u0, u1, v0, v1, h, col, mat) { var start=V.length;quad(W(u0, v0, h), W(u0, v1, h), W(u1, v1, h), W(u1, v0, h), col, mat);groundVertices.push.apply(groundVertices,V.slice(start)); }
    var rnd = (function () { var s = 11; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();

    // Estilos nórdicos: pared, techo, color del portón.
    var STY = [
      { wall: [0.085, 0.09, 0.095], roof: [0.11, 0.115, 0.12], door: [0.2, 0.21, 0.22], trim: [0.07, 0.07, 0.075] },
      { wall: [0.84, 0.85, 0.84], roof: [0.12, 0.125, 0.13], door: [0.16, 0.17, 0.18], trim: [0.1, 0.1, 0.1] },
      { wall: [0.82, 0.83, 0.82], roof: [0.56, 0.58, 0.6], door: [0.3, 0.32, 0.34], trim: [0.5, 0.52, 0.54] },
      { wall: [0.1, 0.105, 0.11], roof: [0.5, 0.52, 0.55], door: [0.14, 0.15, 0.16], trim: [0.08, 0.08, 0.085] },
      { wall: [0.36, 0.38, 0.4], roof: [0.12, 0.125, 0.13], door: [0.2, 0.21, 0.22], trim: [0.1, 0.1, 0.1] }
    ];
    // Camiones: furgón y franja (logística, corralón, distribuidora, frío).
    var LIV = [
      { box: [0.92, 0.92, 0.91], band: [0.78, 0.1, 0.12], cab: [0.92, 0.92, 0.91] },
      { box: [0.97, 0.82, 0.1], band: [0.12, 0.2, 0.55], cab: [0.97, 0.82, 0.1] },
      { box: [0.9, 0.9, 0.9], band: [0.1, 0.45, 0.25], cab: [0.1, 0.45, 0.25] },
      { box: [0.13, 0.27, 0.55], band: [0.95, 0.95, 0.95], cab: [0.95, 0.95, 0.95] },
      { box: [0.93, 0.93, 0.92], band: [0.95, 0.5, 0.08], cab: [0.3, 0.32, 0.35] }
    ];
    var CARS = [[0.92, 0.92, 0.92], [0.72, 0.74, 0.76], [0.42, 0.44, 0.47], [0.06, 0.06, 0.07], [0.55, 0.1, 0.09], [0.13, 0.22, 0.42], [0.85, 0.85, 0.83], [0.25, 0.27, 0.3]];

    // Nave nórdica: techo a dos aguas de poca pendiente, cumbrera paralela al frente.
    function nave(uF, uK, v0, v1, st, side) {
      var u0 = Math.min(uF, uK), u1 = Math.max(uF, uK), um = (u0 + u1) / 2;
      var eave = 7.5 + Math.floor(rnd() * 4) * 0.75, rise = 1.4 + rnd() * 0.6, ridge = eave + rise;
      self.photoBuildings.push({u0:u0,u1:u1,v0:v0,v1:v1,eave:eave,ridge:ridge});
      castShadow(u0, u1, v0, v1, eave + rise * 0.5, 0.5);
      aoRing(u0, u1, v0, v1, 3.0, 0.5);
      box(u0, u1, v0, v1, 0, eave, st.wall, 2, st.wall, 2, 0.5);
      // Zócalo de hormigón, canaletas y bajadas pluviales.
      box(u0 - 0.05, u1 + 0.05, v0 - 0.05, v1 + 0.05, 0, 0.9, [0.55, 0.55, 0.53], 6, [0.55, 0.55, 0.53], 6, 0);
      [[u0 - 0.85, u0 - 0.5], [u1 + 0.5, u1 + 0.85]].forEach(function (gu) {
        box(gu[0], gu[1], v0 - 0.5, v1 + 0.5, eave - 0.45, eave - 0.12, st.trim, 9, st.trim, 9, 0);
        for (var dv = v0 + 1; dv < v1; dv += 12) box(gu[0] + 0.1, gu[1] - 0.1, dv - 0.08, dv + 0.08, 0.2, eave - 0.3, st.trim, 9, st.trim, 9, 0);
      });
      // Ventanas altas en los laterales.
      [[v0 - 0.05, v0 + 0.0], [v1 - 0.0, v1 + 0.05]].forEach(function (gv) {
        box(u0 + 1.5, u1 - 1.5, gv[0], gv[1], eave - 1.9, eave - 0.9, [0.18, 0.23, 0.27], 4, [0.18, 0.23, 0.27], 4, 0);
      });
      // Faldones con alero y cumbrera.
      var o = 0.5, a = W(u0 - o, v0 - o, eave - 0.08), b = W(u0 - o, v1 + o, eave - 0.08), c = W(um, v1 + o, ridge), e = W(um, v0 - o, ridge);
      var a2 = W(u1 + o, v0 - o, eave - 0.08), b2 = W(u1 + o, v1 + o, eave - 0.08);
      quad(a, b, c, e, st.roof, 1); quad(b2, a2, e, c, st.roof, 1);
      sample(a, b, c, e, 0.9); sample(b2, a2, e, c, 0.9);
      tri(W(u0, v0, eave), W(um, v0, ridge), W(u1, v0, eave), st.wall, 2); tri(W(u0, v1, eave), W(u1, v1, eave), W(um, v1, ridge), st.wall, 2);
      box(um - 0.25, um + 0.25, v0 - o, v1 + o, ridge - 0.05, ridge + 0.12, st.trim, 9, st.trim, 9, 0);
      // Equipos en el techo o paneles solares sobre el faldón norte.
      var solarSide = side; // el faldón que mira a la calle
      if (rnd() < 0.4) {
        var pu0 = solarSide > 0 ? um + 0.8 : u0 + 0.6, pu1 = solarSide > 0 ? u1 - 0.6 : um - 0.8;
        for (var pv = v0 + 2; pv < v1 - 4; pv += 4.3) {
          var h0 = eave + rise * 0.25, h1 = eave + rise * 0.8;
          var p00 = W(solarSide > 0 ? pu1 : pu0, pv, h0 + 0.15), p01 = W(solarSide > 0 ? pu1 : pu0, pv + 4, h0 + 0.15);
          var p11 = W(solarSide > 0 ? pu0 : pu1, pv + 4, h1 + 0.15), p10 = W(solarSide > 0 ? pu0 : pu1, pv, h1 + 0.15);
          quad(p00, p01, p11, p10, [0.05, 0.08, 0.14], 11);
        }
      } else if (rnd() < 0.7) {
        for (var k = 0; k < 2 + Math.floor(rnd() * 3); k++) {
          var hv = v0 + 4 + rnd() * (v1 - v0 - 8), hu = um + (rnd() - 0.5) * (u1 - u0) * 0.5;
          box(hu - 1.1, hu + 1.1, hv - 1.4, hv + 1.4, ridge - 0.9, ridge + 0.2, [0.62, 0.63, 0.63], 9, [0.66, 0.67, 0.67], 9, 0);
        }
      }
      // Frente a la calle: portones con alero, oficina vidriada con madera.
      var uf = side > 0 ? u1 : u0, sg = side > 0 ? 1 : -1, len = v1 - v0;
      var offW = Math.min(12, len * 0.28), nd = Math.max(1, Math.floor((len - offW) / 11));
      for (var q = 0; q < nd; q++) {
        var vc = v0 + offW + (len - offW) * (q + 0.5) / nd;
        var s0 = W(uf + sg * 0.05, vc - 2.55, 0), s1 = W(uf + sg * 0.05, vc + 2.55, 0), s2 = W(uf + sg * 0.05, vc + 2.55, 5.35), s3 = W(uf + sg * 0.05, vc - 2.55, 5.35);
        quad(s0, s1, s2, s3, [0.03, 0.03, 0.035], 9);
        var p0 = W(uf + sg * 0.09, vc - 2.2, 0), p1 = W(uf + sg * 0.09, vc + 2.2, 0), p2 = W(uf + sg * 0.09, vc + 2.2, 5.0), p3 = W(uf + sg * 0.09, vc - 2.2, 5.0);
        quad(p0, p1, p2, p3, st.door, 3);
        [vc - 2.9, vc + 2.9].forEach(function (bv) { var bu = uf + sg * 0.7; box(bu - 0.13, bu + 0.13, bv - 0.13, bv + 0.13, 0, 1.1, [0.95, 0.75, 0.1], 9, [0.95, 0.75, 0.1], 9, 0); });
        box(Math.min(uf, uf + sg * 1.4), Math.max(uf, uf + sg * 1.4), vc - 2.8, vc + 2.8, 5.5, 5.75, st.trim, 9, st.trim, 9, 0);
        box(Math.min(uf, uf + sg * 0.9), Math.max(uf, uf + sg * 0.9), vc - 2.2, vc + 2.2, 0, 1.15, [0.45, 0.45, 0.44], 6, [0.5, 0.5, 0.49], 6, 0);
      }
      var ou0 = Math.min(uf - sg * 0.2, uf + sg * 1.2), ou1 = Math.max(uf - sg * 0.2, uf + sg * 1.2);
      box(ou0, ou1, v0, v0 + offW, 0, 6.6, [0.16, 0.2, 0.23], 4, st.trim, 9, 0.3);
      box(ou0, ou1, v0 + offW - 1.6, v0 + offW, 0, 6.6, [0.55, 0.38, 0.24], 12, [0.55, 0.38, 0.24], 12, 0);
      // Marquesina de acceso a la oficina.
      box(Math.min(uf, uf + sg * 3.2), Math.max(uf, uf + sg * 3.2), v0 + 1.5, v0 + offW - 2.5, 3.4, 3.62, st.trim, 9, st.trim, 9, 0);
      box(Math.min(uf + sg * 2.9, uf + sg * 3.1), Math.max(uf + sg * 2.9, uf + sg * 3.1), v0 + 1.6, v0 + 1.8, 0, 3.4, st.trim, 9, st.trim, 9, 0);
      return { u0: u0, u1: u1, uf: uf, sg: sg, doors: nd, offW: offW };
    }
    function car(u, v, col) {
      self.photoCars.push({u:u,v:v,col:col});
      aoRing(u - 2.3, u + 2.3, v - 0.95, v + 0.95, 0.6, 0.4);
      if (rnd() < 0.3) {
        // Camioneta pick-up.
        box(u - 2.65, u + 2.65, v - 0.95, v + 0.95, 0.3, 1.1, col, 8, col, 8, 0);
        box(u - 0.4, u + 1.5, v - 0.88, v + 0.88, 1.1, 1.8, [0.1, 0.12, 0.14], 4, col, 8, 0);
        box(u - 2.5, u - 0.6, v - 0.78, v + 0.78, 0.95, 1.12, [0.12, 0.12, 0.12], 9, [0.12, 0.12, 0.12], 9, 0);
        return;
      }
      box(u - 2.25, u + 2.25, v - 0.92, v + 0.92, 0.18, 0.92, col, 8, col, 8, 0);
      box(u - 1.15, u + 1.0, v - 0.82, v + 0.82, 0.92, 1.42, [0.1, 0.12, 0.14], 4, col, 8, 0);
    }
    function tree(u, v, r, h) {
      self.photoTrees.push({u:u,v:v,r:r,h:h});
      var n = 8, c = [0.24 + rnd() * 0.06, 0.36 + rnd() * 0.06, 0.18], prof = [[0.0, h * 0.35], [r * 0.85, h * 0.45], [r, h * 0.65], [r * 0.75, h * 0.85], [0.0, h]];
      for (var k = 0; k < n; k++) {
        var a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2;
        for (var j = 0; j < prof.length - 1; j++) {
          var r0 = prof[j][0], h0 = prof[j][1], r1 = prof[j + 1][0], h1 = prof[j + 1][1];
          tri(W(u + Math.cos(a0) * r0, v + Math.sin(a0) * r0, h0), W(u + Math.cos(a1) * r0, v + Math.sin(a1) * r0, h0), W(u + Math.cos(a1) * r1, v + Math.sin(a1) * r1, h1), c, 10);
          tri(W(u + Math.cos(a0) * r0, v + Math.sin(a0) * r0, h0), W(u + Math.cos(a1) * r1, v + Math.sin(a1) * r1, h1), W(u + Math.cos(a0) * r1, v + Math.sin(a0) * r1, h1), c, 10);
        }
      }
      box(u - 0.15, u + 0.15, v - 0.15, v + 0.15, 0, h * 0.4, [0.3, 0.25, 0.2], 9, [0.3, 0.25, 0.2], 9, 0);
      castShadow(u - r * 0.6, u + r * 0.6, v - r * 0.6, v + r * 0.6, h * 0.75, 0.35);
    }
    function truck(uFace, v, sg, L) {
      self.photoTrucks.push({u:uFace,v:v,sg:sg,livery:L});
      var t0 = uFace + sg * 0.5, t1 = uFace + sg * 12.9, c0 = uFace + sg * 13.3, c1 = uFace + sg * 15.6;
      castShadow(Math.min(t0, c1), Math.max(t0, c1), v - 1.3, v + 1.3, 3.6, 0.45);
      aoRing(Math.min(t0, c1), Math.max(t0, c1), v - 1.3, v + 1.3, 0.9, 0.5);
      [0.9, 2.3, 9.8, 11.2].forEach(function (wo) { var wu = uFace + sg * wo; box(wu - 0.5, wu + 0.5, v - 1.25, v + 1.25, 0.15, 1.1, [0.05, 0.05, 0.05], 9, [0.05, 0.05, 0.05], 9, 0); });
      box(Math.min(t0, t1), Math.max(t0, t1), v - 1.28, v + 1.28, 1.15, 4.0, L.box, 9, L.box, 9, 0.3);
      box(Math.min(t0, t1) + 0.3, Math.max(t0, t1) - 0.3, v - 1.31, v + 1.31, 2.0, 2.8, L.band, 9, L.box, 9, 0);
      box(Math.min(c0, c1), Math.max(c0, c1), v - 1.25, v + 1.25, 0.65, 3.35, L.cab, 8, L.cab, 8, 0);
      box(Math.min(c0, c1), Math.max(c0, c1), v - 1.1, v + 1.1, 0.3, 0.9, [0.07, 0.07, 0.07], 9, [0.07, 0.07, 0.07], 9, 0);
    }
    function pole(u, v) {
      var first=V.length;
      box(u - 0.09, u + 0.09, v - 0.09, v + 0.09, 0, 8, [0.32, 0.33, 0.34], 9, [0.32, 0.33, 0.34], 9, 0);
      box(u - 0.35, u + 0.35, v - 0.18, v + 0.18, 7.8, 8.05, [0.2, 0.2, 0.2], 9, [0.2, 0.2, 0.2], 9, 0);
      groundVertices.push.apply(groundVertices,V.slice(first));
    }

    // Base: banquinas naturales y calzadas de ripio de 8 m (calles más finas).
    flat(ZR.u0, ZR.u1, ZR.v0, ZR.v1, 0.04, [0.45, 0.46, 0.33], 7);
    // Calles este-oeste: ripio de borde a borde, así las playas salen directo a la calle (sin banquina).
    // Calles norte-sur: calzada de 8 m con banquinas de pasto.
    var EWspan = [[-158.5, -141], [-251.5, -236], [-337, -323]], NS = [-4.5, -133, 126];
    EWspan.forEach(function (s) { flat(s[0], s[1], ZR.v0, ZR.v1, 0.08, [0.6, 0.57, 0.5], 5); });
    NS.forEach(function (vc) { flat(ZR.u0, ZR.u1, vc - 4, vc + 4, 0.09, [0.6, 0.57, 0.5], 5); });

    var si = 0, li = 0;
    this.ZONE_BLOCKS.forEach(function (B, bi) {
      var um = (B.u0 + B.u1) / 2;
      // Lotes pavimentados de hormigón.
      flat(B.u0, B.u1, B.v0, B.v1, 0.12, [0.58, 0.58, 0.56], 6);
      [['n', 1], ['s', -1]].forEach(function (row) {
        var list = B[row[0]], sg = row[1], uF = sg > 0 ? B.u1 : B.u0;
        var gap = (B.v1 - B.v0 - 4 - list.reduce(function (a, b) { return a + b; }, 0)) / Math.max(1, list.length - 1);
        var v = B.v0 + 2;
        list.forEach(function (len) {
          var st = STY[si++ % STY.length];
          var uFace = uF - sg * 18, uBack = um + sg * 1.2;
          var nv = nave(uFace, uBack, v, v + len, st, sg);
          // Estacionamiento sobre la calle este-oeste: cajones marcados y autos.
          var pu0 = uF - sg * 5.6, pu1 = uF - sg * 0.6, puc = (pu0 + pu1) / 2;
          var tv = v + nv.offW + (len - nv.offW) * 0.5 / nv.doors, hasTruck = rnd() < 0.75;
          for (var sv = v + 1.3; sv < v + len - 1.3; sv += 2.6) {
            if (self.commonZonePreview) flat(Math.min(pu0,pu1),Math.max(pu0,pu1),sv-.055,sv+.055,.16,[.77,.77,.74],6);
            else box(Math.min(pu0, pu1), Math.max(pu0, pu1), sv - 0.06, sv + 0.06, 0.13, 0.15, [0.9, 0.9, 0.88], 6, [0.9, 0.9, 0.88], 6, 0);
            if (hasTruck && Math.abs(sv + 1.3 - tv) < 3.2) continue;
            if (rnd() < 0.62) car(puc, sv + 1.3, CARS[Math.floor(rnd() * CARS.length)]);
          }
          if (hasTruck) truck(nv.uf, tv, sg, LIV[li++ % LIV.length]);
          if (rnd() < 0.6) pole(uF - sg * 6.2, v + len * 0.5);
          // Árboles en el espacio entre galpones, junto a la vereda.
          if (gap > 5) { tree(uF - sg * 3.0, v + len + gap * 0.5, 2.2 + rnd(), 7 + rnd() * 3); if (rnd() < 0.5) tree(uF - sg * 9.0, v + len + gap * 0.5, 2.0 + rnd(), 6 + rnd() * 3); }
          v += len + gap;
        });
      });
    });

    var gl = this.gl;
    this.photoGroundVertices = groundVertices.length / 10;
    this.photoGroundBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,this.photoGroundBuf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(groundVertices),gl.STATIC_DRAW);
    this.zVerts = new Float32Array(V); this.zCount = V.length / 10;
    this.zBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.zBuf); gl.bufferData(gl.ARRAY_BUFFER, this.zVerts, gl.STATIC_DRAW);
    this.pCount = PTS.length / 7;
    this.pBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(PTS), gl.STATIC_DRAW);
    var R = Math.PI / 180, az = this.SUN.az * R, el = this.SUN.el * R;
    var L = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
    this.sunDir = L;
    var c = W((ZR.u0 + ZR.u1) / 2, (ZR.v0 + ZR.v1) / 2, 0);
    var f = [-L[0], -L[1], -L[2]], up0 = [0, 1, 0];
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function nrm(a) { var l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    var rr = nrm(cross(f, up0)), uu = cross(rr, f), half = 190, eyeS = [c[0] - f[0] * 300, c[1] - f[1] * 300, c[2] - f[2] * 300];
    var n = 1, F = 700, sx = 1 / half, sy = 1 / half, sz = -2 / (F - n), tz = -(F + n) / (F - n);
    this.sunVP = new Float32Array([
      sx * rr[0], sy * uu[0], sz * -f[0], 0,
      sx * rr[1], sy * uu[1], sz * -f[1], 0,
      sx * rr[2], sy * uu[2], sz * -f[2], 0,
      -sx * dot(rr, eyeS), -sy * dot(uu, eyeS), sz * dot(f, eyeS) + tz, 1
    ]);
    this.shadowDirty = true;
    this.zoneRectU = new Float32Array([ZR.u0, ZR.u1, ZR.v0, ZR.v1]);
    if (this.commonZonePreview) this.loadPhotoZone();
  }

  // Prototipo de escena común, con cubiertas y fachadas en coordenadas del plano.
  // No selecciona otra distribución al cambiar de cámara. Las texturas proceden
  // de la placa aprobada P2; las posiciones se comparten en las cinco vistas.
  loadPhotoZone() {
    var self = this, gl = this.gl;
    if (this.photoZoneLoading) return this.photoZonePromise;
    this.photoZoneLoading = true;
    var images = ['/assets/recorridos/alamos/zona-comun-foto.webp', '/assets/recorridos/alamos/zona-comun-elementos.png', '/assets/recorridos/alamos/zona-comun-suelo.webp'];
    this.photoZonePromise = Promise.all(images.map(function (url) { return new Promise(function (resolve, reject) {
      var im = new Image(); im.onload = function () { resolve(im); }; im.onerror = reject; im.src = url;
    }); })).then(function (ims) {
      if (self.dead) return;
      self.buildPhotoZone(ims);
      self.photoZoneReady = true; self.req();
    }).catch(function (e) { self.photoZoneFailed=true; console.warn('No se pudo cargar la escena común', e); });
    return this.photoZonePromise;
  }

  buildPhotoZone(images) {
    var self = this, gl = this.gl, g = this.zoneGround, R = Math.PI / 180;
    function W(u,v,h) { var q=self.uv2xy(u,v); return [q[0],g+h,q[1]]; }
    // [borde posterior izquierdo/derecho, alero frontal derecho/izquierdo, base frontal].
    var faces = [
      [470,849,638,849,628,894,451,894,918], [659,849,807,849,802,894,649,894,916],
      [820,846,970,846,975,886,820,886,917], [439,894,764,894,757,943,419,943,978],
      [819,899,974,899,976,947,814,947,978], [1053,849,1227,849,1237,900,1057,900,923],
      [1241,848,1383,848,1401,894,1249,894,918], [1408,846,1580,846,1597,891,1419,891,916],
      [1058,908,1236,908,1247,954,1061,954,988], [1276,904,1605,904,1625,949,1284,949,980],
      [337,1071,607,1071,594,1131,310,1131,1171], [706,1071,969,1071,974,1134,693,1134,1175],
      [301,1139,501,1139,475,1207,271,1207,1248], [552,1137,736,1137,723,1203,533,1203,1249],
      [784,1136,971,1136,975,1206,779,1206,1258], [1068,1068,1253,1068,1266,1136,1068,1136,1174],
      [1357,1070,1688,1070,1723,1135,1366,1135,1179], [1073,1135,1366,1135,1370,1199,1075,1199,1245],
      [1455,1135,1726,1135,1767,1200,1475,1200,1245]
    ];
    var batches=[[],[],[],[]];
    function vertex(b,w,uv,a) { batches[b].push(w[0],w[1],w[2],uv[0],uv[1],a==null?1:a); }
    function tri(b,a,c,d,ta,tc,td,alpha) {vertex(b,a,ta,alpha);vertex(b,c,tc,alpha);vertex(b,d,td,alpha);}
    function quad(b,a,c,d,e,ta,tc,td,te) {tri(b,a,c,d,ta,tc,td);tri(b,a,d,e,ta,td,te);}
    function UV(x,y){return[x/2048,y/2048];}
    // Patios sin objetos: una única superficie fotográfica por manzana.
    // Las sombras se proyectan desde la misma escena fija que los edificios.
    var yards=[[286,512,607,512,605,634,226,634],[638,512,950,512,1004,634,636,634],
      [214,666,602,666,601,740,178,740],[638,666,1015,666,1080,807,637,807]];
    this.ZONE_BLOCKS.forEach(function(b,i){
      var q=yards[i],uv=function(x,y){return[x/1254,y/1254];};
      quad(0,W(b.u1,b.v0,.14),W(b.u1,b.v1,.14),W(b.u0,b.v1,.14),W(b.u0,b.v0,.14),
        uv(q[0],q[1]),uv(q[2],q[3]),uv(q[4],q[5]),uv(q[6],q[7]));
    });
    var ridgeFractions=[.36,.38,.325,.326,.333,.37,.37,.333,.39,.356,.367,.365,.37,.424,.343,.338,.354,.3125,.384];
    if(this.photoBuildings.length!==faces.length)throw new Error("La escena común no coincide con sus 19 galpones.");
    this.photoBuildings.forEach(function(n,i){
      n.id="galpon-"+String(i+1).padStart(2,"0");
      var s=faces[i], um=(n.u0+n.u1)/2, a=W(n.u1+.5,n.v0-.5,n.eave),b=W(n.u1+.5,n.v1+.5,n.eave),c=W(n.u0-.5,n.v1+.5,n.eave),d=W(n.u0-.5,n.v0-.5,n.eave);
      var rl=W(um,n.v0-.5,n.ridge),rt=W(um,n.v1+.5,n.ridge);
      var ta=UV(s[0],s[1]),tb=UV(s[2],s[3]),tc=UV(s[4],s[5]),td=UV(s[6],s[7]);
      var mix=function(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];};
      var tl= mix(ta,td,ridgeFractions[i]),tr=mix(tb,tc,ridgeFractions[i]);
      quad(1,a,b,rt,rl,ta,tb,tr,tl);quad(1,rl,rt,c,d,tl,tr,tc,td);
      var dl=W(n.u0,n.v0,0),dr=W(n.u0,n.v1,0),topl=W(n.u0,n.v0,n.eave),topr=W(n.u0,n.v1,n.eave);
      quad(1,topl,topr,dr,dl,td,tc,UV(s[4],s[8]),UV(s[6],s[8]));
      // Laterales y contrafrente: chapa de la misma nave, con escala métrica fija.
      var side0=UV(s[6]+4,s[7]+3),side1=UV(s[6]+10,s[7]+3),side2=UV(s[6]+10,s[8]-2),side3=UV(s[6]+4,s[8]-2);
      quad(1,W(n.u0,n.v0,n.eave),W(n.u1,n.v0,n.eave),W(n.u1,n.v0,0),dl,side0,side1,side2,side3);
      quad(1,W(n.u1,n.v1,n.eave),W(n.u0,n.v1,n.eave),dr,W(n.u1,n.v1,0),side0,side1,side2,side3);
      quad(1,W(n.u1,n.v0,n.eave),W(n.u1,n.v1,n.eave),W(n.u1,n.v1,0),W(n.u1,n.v0,0),td,tc,UV(s[4],s[8]),UV(s[6],s[8]));
      tri(1,W(n.u0,n.v0,n.eave),rl,W(n.u1,n.v0,n.eave),side0,side1,side0);
      tri(1,W(n.u1,n.v1,n.eave),rt,W(n.u0,n.v1,n.eave),side0,side1,side0);
    });
    // Elementos fotográficos fijos en coordenadas de la escena. No giran ni
    // cambian de especie/modelo cuando cambia la cámara del recorrido.
    var atlas=images[1], aw=atlas.width, ah=atlas.height;
    function AU(x,y){return[x/aw,y/ah];}
    var crops=[[109,12,356,408],[546,10,792,408],[983,28,1237,409],[1428,20,1679,410],
      [153,441,312,880],[590,441,749,880],[1028,438,1190,880],[1343,454,1759,861]];
    // El atlas mide 1774 × 887; normalización independiente del tamaño físico.
    function sprite(o,idx,width,length,backHeight,frontHeight,sg){
      var c=crops[idx],t=[AU(c[0]*aw/1774,c[1]*ah/887),AU(c[2]*aw/1774,c[1]*ah/887),AU(c[2]*aw/1774,c[3]*ah/887),AU(c[0]*aw/1774,c[3]*ah/887)];
      quad(3,W(o.u+length*.5*sg,o.v-width*.5,backHeight),W(o.u+length*.5*sg,o.v+width*.5,backHeight),W(o.u-length*.5*sg,o.v+width*.5,frontHeight),W(o.u-length*.5*sg,o.v-width*.5,frontHeight),t[0],t[1],t[2],t[3]);
    }
    this.photoCars.forEach(function(o,i){
      var idx=o.col[0]>.4&&o.col[1]<.2?2:o.col[2]>o.col[0]*1.4?3:i%2;
      sprite(o,idx,2.05,4.6,1.35,.22,1);
    });
    this.photoTrucks.forEach(function(o,i){
      sprite({u:o.u+o.sg*8,v:o.v},4+i%3,2.9,16,4.1,.35,-o.sg);
    });
    this.photoTrees.forEach(function(o){sprite(o,7,o.r*2.8,5,o.h,.05,1);});
    this.photoZoneTextures=[images[2],images[0],null,atlas].map(function(im){
      if(!im)return null;
      var t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      if((im.width&(im.width-1))===0&&(im.height&(im.height-1))===0){gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);}
      var an=gl.getExtension('EXT_texture_filter_anisotropic');if(an)gl.texParameterf(gl.TEXTURE_2D,an.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));return t;
    });
    this.photoZoneBatches=batches.map(function(v){var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.STATIC_DRAW);return{buffer:b,count:v.length/6};});
    this.photoZoneProgram=this.prog3(
      'attribute vec3 pos;attribute vec2 uv;attribute float alpha;uniform mat4 sunVP;'+this.VIEW_SRC+'varying vec2 t;varying float a;varying vec4 vs;void main(){gl_Position=project(pos);t=uv;a=alpha;vs=sunVP*vec4(pos,1.0);}',
      'precision highp float;uniform sampler2D photo;uniform sampler2D shadow;uniform float ground;uniform float opacity;varying vec2 t;varying float a;varying vec4 vs;'+
      'float unpack(vec4 c){return dot(c,vec4(1.0,1.0/255.0,1.0/65025.0,1.0/16581375.0));}'+
      'void main(){vec4 c=texture2D(photo,t);if(c.a<0.01)discard;float sh=1.0;if(ground>0.5){vec3 p=vs.xyz/vs.w*.5+.5;float sum=0.0;for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){float d=unpack(texture2D(shadow,p.xy+vec2(float(i),float(j))/2048.0));sum+=p.z-.0006>d?0.0:1.0;}sh=.5+.5*sum/9.0;c.rgb*=.92;}gl_FragColor=vec4(c.rgb*sh,c.a*a*opacity);}'
    );
  }

  drawPhotoZone(B) {
    var gl=this.gl,P=this.photoZoneProgram,self=this;
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P.p);this.setView(P,B);gl.uniform1f(P.U.opacity,this.zoneT);
    gl.uniformMatrix4fv(P.U.sunVP,false,this.sunVP);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.shTex);gl.uniform1i(P.U.shadow,1);
    [0,1,3].forEach(function(i){
      gl.uniform1f(P.U.ground,i===0?1:0);
      var b=self.photoZoneBatches[i];gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,self.photoZoneTextures[i]);gl.uniform1i(P.U.photo,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,b.buffer);gl.enableVertexAttribArray(P.A.pos);gl.vertexAttribPointer(P.A.pos,3,gl.FLOAT,false,24,0);
      gl.enableVertexAttribArray(P.A.uv);gl.vertexAttribPointer(P.A.uv,2,gl.FLOAT,false,24,12);gl.enableVertexAttribArray(P.A.alpha);gl.vertexAttribPointer(P.A.alpha,1,gl.FLOAT,false,24,20);
      gl.drawArrays(gl.TRIANGLES,0,b.count);
    });
    gl.disableVertexAttribArray(P.A.pos);gl.disableVertexAttribArray(P.A.uv);gl.disableVertexAttribArray(P.A.alpha);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
  }

  // ---------- Plano de lotes como luz sobre el terreno ----------
  // Etapa de un punto del plano: 1 = 4 manzanas del norte, 2 = 4 del medio, 3 = las del fondo.
  stageOf(x, y) {
    var q = this.xy2uv(x, y), u = q[0];
    if (u > -330) return 1;
    if (u > -505) return 2;
    return 3;
  }

  ribbon(V, a, b, kind, stage, z0) {
    var g = this.data.ground;
    var A = [a[0], a[2] - g + (z0 || 0.35), a[1]], B = [b[0], b[2] - g + (z0 || 0.35), b[1]];
    var dx = B[0] - A[0], dz = B[2] - A[2], L = Math.hypot(dx, dz) || 1, dir = [dx / L, 0, dz / L], off = stage * 1000 + Math.random() * 200;
    function push(p, side, end, along) { V.push(p[0], p[1], p[2], dir[0], dir[1], dir[2], side, end, along, kind, L, off); }
    push(A, -1, -1, 0); push(B, -1, 1, L); push(B, 1, 1, L);
    push(A, -1, -1, 0); push(B, 1, 1, L); push(A, 1, -1, 0);
  }

  fan(V, poly, kind, stage) {
    var g = this.data.ground, cx = 0, cy = 0, cz = 0;
    poly.forEach(function (p) { cx += p[0]; cy += p[1]; cz += p[2]; });
    cx /= poly.length; cy /= poly.length; cz /= poly.length;
    function push(p) { V.push(p[0], p[2] - g + 0.3, p[1], 0, 0, 0, 0, 0, 0, kind, 0, stage * 1000); }
    for (var k = 0; k < poly.length; k++) { push([cx, cy, cz]); push(poly[k]); push(poly[(k + 1) % poly.length]); }
  }

  buildLights() {
    var self = this, d = this.data, gl = this.gl, V = [];
    d.layers.PLANO.forEach(function (s) { self.ribbon(V, s[0], s[1], 0, self.stageOf((s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2)); });
    (d.blocks || []).forEach(function (poly) {
      var cx = 0, cy = 0; poly.forEach(function (p) { cx += p[0]; cy += p[1]; });
      var st = self.stageOf(cx / poly.length, cy / poly.length);
      for (var i = 0; i < poly.length; i++) self.ribbon(V, poly[i], poly[(i + 1) % poly.length], 1, st);
      self.fan(V, poly, 2, st);
    });
    this.lCount = V.length / 12;
    this.lBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.lBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
    this.hBuf = gl.createBuffer(); this.hCount = 0;
  }

  // Lote bajo el puntero: se busca el punto del suelo y el polígono que lo contiene.
  lotAt(sx, sy) {
    var d = this.data; if (!d || !d.lots) return null;
    var B = this.basis(), nx = 2 * sx / this.cw - 1, ny = 1 - 2 * sy / this.ch;
    var dir = [B.f[0] + B.r[0] * nx * B.tx + B.u[0] * ny * B.ty, B.f[1] + B.r[1] * nx * B.tx + B.u[1] * ny * B.ty, B.f[2] + B.r[2] * nx * B.tx + B.u[2] * ny * B.ty];
    if (dir[1] >= -0.01) return null;
    var t = (0 - this.cam.h) / dir[1], x = this.cam.x + dir[0] * t, y = this.cam.y + dir[2] * t;
    for (var i = 0; i < d.lots.length; i++) {
      var p = d.lots[i].p, inside = false;
      for (var a = 0, b = p.length - 1; a < p.length; b = a++) {
        if (((p[a][1] > y) !== (p[b][1] > y)) && (x < (p[b][0] - p[a][0]) * (y - p[a][1]) / (p[b][1] - p[a][1]) + p[a][0])) inside = !inside;
      }
      if (inside) return i;
    }
    return null;
  }

  setHover(i, sx, sy) {
    var lot = i == null ? null : this.data.lots[i];
    var key = [i, this.selLot, this.selM].join('|');
    if (key !== this.hlKey) {
      this.hlKey = key; this.hoverIdx = i;
      var V = [], me = this, done = {};
      function add(l, idx) {
        if (done[idx]) return; done[idx] = 1;
        me.fan(V, l.p, 4, l.e);
        for (var q = 0; q < l.p.length; q++) me.ribbon(V, l.p[q], l.p[(q + 1) % l.p.length], 5, l.e, 0.45);
      }
      if (lot) add(lot, i);
      if (this.selLot != null && this.data.lots[this.selLot]) add(this.data.lots[this.selLot], this.selLot);
      if (this.selM) this.data.lots.forEach(function (l, idx) { if (l.m === me.selM) add(l, idx); });
      var gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.hBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V.length ? V : [0]), gl.DYNAMIC_DRAW);
      this.hCount = V.length / 12; this.req();
    }
    var tip = lot && this.hoverTips ? { x: Math.round(Math.min(sx + 16, this.cw - 220)), y: Math.round(Math.min(sy + 16, this.ch - 80)), t1: 'Manzana ' + lot.m + ' · Lote ' + lot.n, t2: lot.a.toLocaleString('es-AR') + ' m² · Etapa ' + lot.e, e: lot.e } : null;
    var cur = this.state.tip;
    if ((!tip && cur) || (tip && (!cur || cur.t1 !== tip.t1 || Math.abs(cur.x - tip.x) > 2 || Math.abs(cur.y - tip.y) > 2))) this.setState({ tip: tip });
  }

  drawLights(B, now) {
    var gl = this.gl, G = this.LG; if (!G || !this.lBuf || this.state.clean) return;
    var fade = Math.max(0, 1 - this.cloud * 1.3);
    if (fade <= 0.01 || !this.state.started) return;
    var time = (now - this.t0) / 1000;
    var reveal = this.revealT0 ? (now - this.revealT0) / 1000 * 380 : 0;
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(G.p);
    this.setView(G, B);
    gl.uniform1f(G.U.pxk, 2 * B.ty / Math.max(1, this.ch));
    gl.uniform1f(G.U.time, time);
    gl.uniform2f(G.U.camXZ, this.cam.x, this.cam.y);
    gl.uniform1f(G.U.reveal, this.anim ? 3000 : reveal);
    gl.uniform1f(G.U.fade, fade * (this.state.panel ? 0.25 : 1));
    gl.uniform1f(G.U.zoneT, this.zoneT);
    gl.uniform4fv(G.U.rect, this.zoneRectU || new Float32Array([0, 0, 0, 0]));
    gl.uniform1f(G.U.gridA, this.GRID * Math.PI / 180);
    var A = G.A, self = this;
    [[this.lBuf, this.lCount], [this.hBuf, this.introOn ? 0 : this.hCount]].forEach(function (bc) {
      if (!bc[1]) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, bc[0]);
      gl.enableVertexAttribArray(A.base); gl.vertexAttribPointer(A.base, 3, gl.FLOAT, false, 48, 0);
      gl.enableVertexAttribArray(A.dir); gl.vertexAttribPointer(A.dir, 3, gl.FLOAT, false, 48, 12);
      gl.enableVertexAttribArray(A.aux); gl.vertexAttribPointer(A.aux, 4, gl.FLOAT, false, 48, 24);
      gl.enableVertexAttribArray(A.sl); gl.vertexAttribPointer(A.sl, 2, gl.FLOAT, false, 48, 40);
      gl.drawArrays(gl.TRIANGLES, 0, bc[1]);
    });
    gl.disableVertexAttribArray(A.base); gl.disableVertexAttribArray(A.dir); gl.disableVertexAttribArray(A.aux); gl.disableVertexAttribArray(A.sl);
    gl.disable(gl.BLEND);
    // Los puntitos de los bordes se mueven: se sigue dibujando mientras el plano está visible.
    this.dirty = true;
  }

  renderShadow() {
    var gl = this.gl, S = this.SH;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFb);
    gl.viewport(0, 0, 2048, 2048);
    gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.useProgram(S.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.zBuf);
    gl.enableVertexAttribArray(S.A.pos); gl.vertexAttribPointer(S.A.pos, 3, gl.FLOAT, false, 40, 0);
    gl.uniformMatrix4fv(S.U.sunVP, false, this.sunVP);
    gl.drawArrays(gl.TRIANGLES, 0, this.zCount);
    gl.disableVertexAttribArray(S.A.pos);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.glc.width, this.glc.height);
    this.shadowDirty = false;
  }

  resize() {
    if (!this.root || !this.glc) return;
    var w = this.root.clientWidth, h = this.root.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = w; this.ch = h; this.dpr = dpr;
    var q = Math.min(dpr, 1.5);
    this.glc.width = Math.round(w * q); this.glc.height = Math.round(h * q);
    this.ovc.width = Math.round(w * dpr); this.ovc.height = Math.round(h * dpr);
    if (this.gl) this.gl.viewport(0, 0, this.glc.width, this.glc.height);
    this.dirty = true;
  }

  req() { this.dirty = true; }

  loop() {
    var self = this;
    var tick = function (now) {
      if (self.dead) return;
      self.raf = requestAnimationFrame(tick);
      if (self.anim) self.anim(now);
      if (self.zAnim) self.zAnim(now);
      if (self.pan) self.pan(now);
      if (self.dirty || self.anim || self.zAnim || self.pan || self.cloud > 0.001) { self.dirty = false; self.draw(now); }
    };
    this.raf = requestAnimationFrame(tick);
  }

  basis() {
    var R = Math.PI / 180, y = this.view.yaw * R, p = this.view.pitch * R;
    var ty = Math.tan(this.view.fov * R / 2), tx = ty * (this.cw / Math.max(1, this.ch));
    return {
      f: [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)],
      r: [Math.cos(y), 0, -Math.sin(y)],
      u: [-Math.sin(p) * Math.sin(y), Math.cos(p), -Math.sin(p) * Math.cos(y)],
      tx: tx, ty: ty
    };
  }

  draw(now) {
    if (!this.cw) return;
    var B = this.basis(), gl = this.gl;
    var pA = this.posOf(this.A), pB = this.posOf(this.B), time = (now - this.t0) / 1000;
    if (gl) {
      if (this.zoneT > 0.001 && this.zBuf && this.shadowDirty) this.renderShadow();
      var P = this.P;
      gl.useProgram(P.p);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(P.A.p); gl.vertexAttribPointer(P.A.p, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[this.A] ? this.tex[this.A].t : this.blank);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex[this.B] ? this.tex[this.B].t : this.blank);
      gl.uniform1i(P.U.tA, 0); gl.uniform1i(P.U.tB, 1);
      gl.uniform3fv(P.U.f, B.f); gl.uniform3fv(P.U.r, B.r); gl.uniform3fv(P.U.u, B.u);
      gl.uniform1f(P.U.tx, B.tx); gl.uniform1f(P.U.ty, B.ty);
      gl.uniform3f(P.U.cam, this.cam.x, this.cam.h, this.cam.y);
      gl.uniform3f(P.U.cA, pA.x, pA.h, pA.y); gl.uniform3f(P.U.cB, pB.x, pB.h, pB.y);
      gl.uniformMatrix3fv(P.U.mA, false, this.colMajor(this.matOf(this.calOf(this.A))));
      gl.uniformMatrix3fv(P.U.mB, false, this.colMajor(this.matOf(this.calOf(this.B))));
      gl.uniform1f(P.U.mixAB, this.mixAB);
      // Niebla y nubes con su intensidad original aprobada; independientes de la fotografía del cielo.
      gl.uniform1f(P.U.cloud, this.cloud * (this.props.clouds != null ? this.props.clouds : 0.85));
      gl.uniform1f(P.U.time, time);
      gl.uniform1f(P.U.prog, this.prog);
      this.setZr(P, this.zrState(this.A), 2, ''); this.setZr(P, this.zrState2(), 3, '2'); gl.uniform1f(P.U.zBuild, this.zoneT);
      var mk = this.skyMk, skyOn = !!(this.state.skyOn && this.skyTex && this.skyLowTex && mk && mk[this.A] && mk[this.A].t && mk[this.B] && mk[this.B].t);
      var skyAmt = skyOn ? (mk[this.A].real ? 1 - this.mixAB : 0) + (mk[this.B].real ? this.mixAB : 0) : 0;
      if (this.A === this.B && skyOn) skyAmt = mk[this.A].real ? 1 : 0;
      if (skyAmt <= 0.001) skyOn = false;
      gl.uniform1f(P.U.skyOn, skyOn ? 1 : 0); gl.uniform1f(P.U.skyAmt, skyAmt);
      if (skyOn) {
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.skyTex); gl.uniform1i(P.U.skyT, 4);
        gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, mk[this.A].t); gl.uniform1i(P.U.mkA, 5);
        gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, mk[this.B].t); gl.uniform1i(P.U.mkB, 6);
        gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, this.skyLowTex); gl.uniform1i(P.U.lowT, 7);
        gl.uniform2f(P.U.skySize, this.skySize[0], this.skySize[1]);
        gl.uniform1f(P.U.skyRot, this.SKY_ROT); gl.activeTexture(gl.TEXTURE0);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(P.A.p);
      this.drawBrand(B, now);
      this.drawRoutes(B, now);
      this.drawLights(B, now);
      if (this.zoneT > 0.001 && this.zBuf) this.drawZone(B, time);
      this.drawFlyers3D(B, now);
    }
    this.drawOverlay(B);
    this.placeLabels(B);
    this.updateCompass();
  }

  setView(prog, B) {
    var gl = this.gl;
    gl.uniform3f(prog.U.eye, this.cam.x, this.cam.h, this.cam.y);
    gl.uniform3fv(prog.U.vr, B.r); gl.uniform3fv(prog.U.vu, B.u); gl.uniform3fv(prog.U.vf, B.f);
    gl.uniform1f(prog.U.tx, B.tx); gl.uniform1f(prog.U.ty, B.ty);
  }

  drawZone(B, time) {
    var gl = this.gl, M = this.M;
    var build = this.zoneT;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(M.p);
    this.setView(M, B);
    gl.uniformMatrix4fv(M.U.sunVP, false, this.sunVP);
    gl.uniform3fv(M.U.sunDir, this.sunDir);
    gl.uniform1f(M.U.build, build);
    gl.uniform1f(M.U.time, time);
    gl.uniform1f(M.U.gridA, this.GRID * Math.PI / 180);
    gl.uniform4fv(M.U.rect, this.zoneRectU);
    var pA = this.posOf(this.A), pB = this.posOf(this.B);
    this.setZr(M, this.zrState(this.A), 7, ''); this.setZr(M, this.zrState2(), 1, '2');
    gl.uniform3f(M.U.zcA, pA.x, pA.h, pA.y); gl.uniform3f(M.U.zcB, pB.x, pB.h, pB.y); gl.uniform1f(M.U.zMix, this.mixAB);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.shTex); gl.uniform1i(M.U.shadow, 2);
    var self = this;
    ['tRip', 'tHor', 'tPas', 'tMug'].forEach(function (k, i) { gl.activeTexture(gl.TEXTURE3 + i); gl.bindTexture(gl.TEXTURE_2D, self.mtex[k]); gl.uniform1i(M.U[k], 3 + i); });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.photoZoneReady ? this.photoGroundBuf : this.zBuf);
    var A = M.A;
    gl.enableVertexAttribArray(A.pos); gl.vertexAttribPointer(A.pos, 3, gl.FLOAT, false, 40, 0);
    gl.enableVertexAttribArray(A.nrm); gl.vertexAttribPointer(A.nrm, 3, gl.FLOAT, false, 40, 12);
    gl.enableVertexAttribArray(A.col); gl.vertexAttribPointer(A.col, 3, gl.FLOAT, false, 40, 24);
    gl.enableVertexAttribArray(A.mat); gl.vertexAttribPointer(A.mat, 1, gl.FLOAT, false, 40, 36);
    gl.drawArrays(gl.TRIANGLES, 0, this.photoZoneReady ? this.photoGroundVertices : this.zCount);
    gl.disableVertexAttribArray(A.pos); gl.disableVertexAttribArray(A.nrm); gl.disableVertexAttribArray(A.col); gl.disableVertexAttribArray(A.mat);
    // Partículas mientras se arma o se desarma.
    if (this.zAnim && this.pCount) {
      var T = this.PT;
      gl.useProgram(T.p);
      this.setView(T, B);
      gl.uniform1f(T.U.build, build); gl.uniform1f(T.U.time, time);
      gl.depthMask(false);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf);
      gl.enableVertexAttribArray(T.A.tgt); gl.vertexAttribPointer(T.A.tgt, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(T.A.rnd); gl.vertexAttribPointer(T.A.rnd, 4, gl.FLOAT, false, 28, 12);
      gl.drawArrays(gl.POINTS, 0, this.pCount);
      gl.disableVertexAttribArray(T.A.tgt); gl.disableVertexAttribArray(T.A.rnd);
      gl.depthMask(true);
    }
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    if (this.photoZoneReady) this.drawPhotoZone(B);
  }

  toggleZone() {
    if (this.zAnim || (this.commonZonePreview && this.state.zoneBusy)) return;
    if (this.commonZonePreview && !this.photoZoneReady) {
      var waiting=this;
      this.setState({zoneBusy:true,status:'Cargando la zona productiva…'});
      this.loadPhotoZone().then(function(){
        if(waiting.dead)return;
        waiting.setState({zoneBusy:false,status:waiting.photoZoneReady?'':'No se pudo cargar la zona productiva. Recargá la página.'});
        if(waiting.photoZoneReady)waiting.toggleZone();
      });
      return;
    }
    var self = this, on = !this.state.zone, from = this.zoneT, to = on ? 1 : 0, t0 = performance.now(), dur = on ? 3600 : 2600;
    this.setState({ zone: on, zoneBusy: true });
    this.zAnim = function (now) {
      var t = Math.min(1, (now - t0) / dur);
      self.zoneT = from + (to - from) * t;
      if (t >= 1) { self.zAnim = null; self.zoneT = to; self.setState({ zoneBusy: false }); self.refreshSel(); self.req(); }
    };
  }

  // ---------- Marca en el pasto (como la publicidad pintada en una cancha) ----------
  buildBrand() {
    var gl = this.gl, V = [], self = this;
    this.BRAND.forEach(function (b) {
      var w = b.w, h = w * 299 / 2112, u0 = b.u - h / 2, u1 = b.u + h / 2, v0 = b.v - w / 2, v1 = b.v + w / 2;
      function P(u, v, s, t) { var p = self.uv2xy(u, v); V.push(p[0], 0.3, p[1], s, t); }
      P(u0, v0, 0, 1); P(u0, v1, 1, 1); P(u1, v1, 1, 0); P(u0, v0, 0, 1); P(u1, v1, 1, 0); P(u1, v0, 0, 0);
    });
    this.bCount = V.length / 5;
    this.bBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.bBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
    this.bTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.bTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = 2048; c.height = 256;
      c.getContext('2d').drawImage(img, 0, 0, 2048, 256);
      gl.bindTexture(gl.TEXTURE_2D, self.bTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      var an = gl.getExtension('EXT_texture_filter_anisotropic');
      if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      self.bReady = true; self.req();
    };
    img.src = this.BRAND_URL;
    this.banner = new Image(); this.banner.onload = function () { self.req(); }; this.banner.src = this.BANNER_URL;
  }

  drawBrand(B, now) {
    var gl = this.gl, G = this.BR; if (!G || !this.bBuf || !this.bReady || this.state.clean || !this.state.started) return;
    var fade = Math.max(0, 1 - this.cloud * 1.3); if (fade <= 0.01) return;
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(G.p); this.setView(G, B);
    gl.uniform1f(G.U.fade, fade);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.bTex); gl.uniform1i(G.U.tL, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bBuf);
    gl.enableVertexAttribArray(G.A.pos); gl.vertexAttribPointer(G.A.pos, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(G.A.uv); gl.vertexAttribPointer(G.A.uv, 2, gl.FLOAT, false, 20, 12);
    gl.drawArrays(gl.TRIANGLES, 0, this.bCount);
    gl.disableVertexAttribArray(G.A.pos); gl.disableVertexAttribArray(G.A.uv);
    gl.disable(gl.BLEND);
  }

  // ---------- Vida en el cielo (3D): parapentes ----------
  // Geometría procedural a escala real: vela de ~11 m con 40 celdas infladas entre costillas, perfil con curvatura,
  // bocas de entrada en el borde de ataque, puntas estabilizadoras, cuerdas hasta las bandas y piloto con silla y casco.
  // Se sombrea con el sol medido en las fotos (azimut 344°, altura 63°), luz de cielo y suelo, translucidez de la tela
  // a contraluz y perspectiva aérea según la distancia. La avioneta con bandera queda pendiente de un modelo apto.
  buildFlyers() {
    var gl = this.gl; if (!gl || !this.VIEW_SRC) return;
    this.FL = this.prog3([
      'attribute vec3 pos;attribute vec3 nrm;attribute vec3 col;attribute float mat;attribute vec2 uv;',
      this.VIEW_SRC,
      'uniform mat3 Rm;uniform vec3 Om;',
      'varying vec3 vw;varying vec3 vn;varying vec3 vc;varying float vm;varying vec2 vuv;',
      'void main(){vec3 w=Om+Rm*pos;vw=w;vn=Rm*nrm;vc=col;vm=mat;vuv=uv;gl_Position=project(w);}'
    ].join('\n'), [
      'precision highp float;',
      'varying vec3 vw;varying vec3 vn;varying vec3 vc;varying float vm;varying vec2 vuv;',
      'uniform vec3 sunDir;uniform vec3 eye;uniform float fade;uniform sampler2D tex;uniform vec2 texV;',
      'void main(){',
      ' vec3 v=normalize(eye-vw);vec3 n=normalize(vn);vec3 L=sunDir;',
      ' float d=length(eye-vw);vec3 haze=vec3(0.72,0.77,0.82);float ap=1.0-exp(-d/3200.0);',
      ' vec3 sky=vec3(0.62,0.71,0.83);vec3 grd=vec3(0.34,0.35,0.28);',
      ' if(vm>3.5&&vm<4.5){gl_FragColor=vec4(mix(vc,haze,ap),0.2*fade*clamp(160.0/d,0.12,1.0));return;}',
      ' if(vm>1.5&&vm<2.5){gl_FragColor=vec4(mix(vec3(0.1),haze,ap),vc.r*0.2*fade);return;}',
      ' if(vm>0.5&&vm<1.5){vec3 rf=reflect(-v,n);vec3 env=mix(grd*0.8,sky*1.15,smoothstep(-0.25,0.35,rf.y));',
      '  float fg=0.08+0.92*pow(1.0-max(dot(n,v),0.0),5.0);float sg=pow(max(dot(n,normalize(L+v)),0.0),220.0)*1.6;',
      '  vec3 cg=mix(vec3(0.03,0.04,0.05),env,0.22+0.7*fg)+vec3(1.0,0.97,0.9)*sg;gl_FragColor=vec4(mix(cg,haze,ap),fade);return;}',
      ' vec3 base=vc;',
      ' if(vm>2.5&&vm<3.5){vec2 q=gl_FrontFacing?vec2(1.0-vuv.x,vuv.y):vuv;if(!gl_FrontFacing)n=-n;base=texture2D(tex,vec2(q.x,mix(texV.x,texV.y,q.y))).rgb;}',
      ' if(vm>6.5&&!gl_FrontFacing)n=-n;',
      ' float nl=max(dot(n,L),0.0);',
      ' vec3 amb=mix(grd,sky,n.y*0.5+0.5)*0.5;',
      ' vec3 h=normalize(L+v);float sp=pow(max(dot(n,h),0.0),vm<0.5?80.0:22.0)*(vm<0.5?0.55:(vm<5.5?0.1:0.03));',
      ' float back=(vm>2.5&&vm<5.5)?max(dot(-n,L),0.0)*0.45:0.0;',
      ' float fr=pow(1.0-max(dot(n,v),0.0),4.0);',
      ' vec3 c=base*(amb+vec3(1.0,0.96,0.88)*(nl*0.95+back))+vec3(1.0,0.97,0.9)*sp+sky*fr*0.12;',
      ' gl_FragColor=vec4(mix(c,haze,ap),fade);}'
    ].join('\n'));

    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function cr(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function nz(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    function push(V, p, n, c, m) { V.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], m); }
    function ringC(r) { var c = [0, 0, 0]; r.forEach(function (p) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }); return [c[0] / r.length, c[1] / r.length, c[2] / r.length]; }
    function hex(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255]; }
    // Superficie suave a partir de anillos del mismo largo; normales promediadas y orientadas hacia afuera de cada anillo.
    function loft(V, rings, closed, paint) {
      var nR = rings.length, nP = rings[0].length, N = [], i, k, kM = closed ? nP : nP - 1;
      for (i = 0; i < nR; i++) { N.push([]); for (k = 0; k < nP; k++) N[i].push([0, 0, 0]); }
      for (i = 0; i < nR - 1; i++) for (k = 0; k < kM; k++) {
        var k2 = (k + 1) % nP, a = rings[i][k], b = rings[i + 1][k], d = rings[i][k2];
        var fn = cr(sub(b, a), sub(d, a));
        [[i, k], [i + 1, k], [i + 1, k2], [i, k2]].forEach(function (q) { var t = N[q[0]][q[1]]; t[0] += fn[0]; t[1] += fn[1]; t[2] += fn[2]; });
      }
      for (i = 0; i < nR; i++) {
        var cc = ringC(rings[i]);
        for (k = 0; k < nP; k++) { var nn = nz(N[i][k]), p = rings[i][k]; if ((p[0] - cc[0]) * nn[0] + (p[1] - cc[1]) * nn[1] + (p[2] - cc[2]) * nn[2] < 0) nn = [-nn[0], -nn[1], -nn[2]]; N[i][k] = nn; }
      }
      for (i = 0; i < nR - 1; i++) for (k = 0; k < kM; k++) {
        var kk = (k + 1) % nP, pm = paint(i, k);
        [[i, k], [i + 1, k], [i + 1, kk], [i, k], [i + 1, kk], [i, kk]].forEach(function (q) { push(V, rings[q[0]][q[1]], N[q[0]][q[1]], pm[0], pm[1]); });
      }
    }
    function cap(V, ring, out, col, mat) {
      var c = ringC(ring);
      for (var k = 0; k < ring.length; k++) { var k2 = (k + 1) % ring.length; push(V, c, out, col, mat); push(V, ring[k], out, col, mat); push(V, ring[k2], out, col, mat); }
    }
    function ellipsoid(V, c, r, col, mat) {
      var nu = 18, nv = 10;
      for (var j = 0; j < nv; j++) for (var i = 0; i < nu; i++) {
        [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]].forEach(function (t) {
          var th = t[0] / nu * Math.PI * 2, ph = -Math.PI / 2 + t[1] / nv * Math.PI;
          var e = [Math.cos(ph) * Math.cos(th), Math.sin(ph), Math.cos(ph) * Math.sin(th)];
          push(V, [c[0] + r[0] * e[0], c[1] + r[1] * e[1], c[2] + r[2] * e[2]], nz([e[0] / r[0], e[1] / r[1], e[2] / r[2]]), col, mat);
        });
      }
    }
    function line(L, a, b, col) { push(L, a, [0, 1, 0], col, 4); push(L, b, [0, 1, 0], col, 4); }
    // Perfil NACA de 4 dígitos, contorno cerrado: fuga → extradós → ataque → intradós. x: 0 ataque, 1 fuga.
    function airfoil(n, t, m, p) {
      var up = [], lo = [], i;
      for (i = 0; i <= n; i++) {
        var x = (1 - Math.cos(Math.PI * i / n)) / 2;
        var yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
        var yc = x < p ? m / (p * p) * (2 * p * x - x * x) : m / ((1 - p) * (1 - p)) * ((1 - 2 * p) + 2 * p * x - x * x);
        up.push([x, yc + yt]); lo.push([x, yc - yt]);
      }
      var ring = [];
      for (i = n; i >= 0; i--) ring.push(up[i]);
      for (i = 1; i < n; i++) ring.push(lo[i]);
      return ring;
    }

    // Parapente: origen en el piloto, x a la derecha, y arriba, z hacia adelante. Medidas en metros.
    function glider(scheme) {
      var V = [], L = [], NA = 12, foil = airfoil(NA, 0.16, 0.035, 0.35), NS = 80, R = 6.6, half = 62 * Math.PI / 180, top = 7.4;
      var white = hex('#f1efe8'), intake = hex('#262626'), A = hex(scheme.a), Bc = hex(scheme.b), Cc = hex(scheme.c), rings = [], meta = [];
      for (var i = 0; i <= NS; i++) {
        var s = -1 + 2 * i / NS, a = s * half, c = 2.75 * Math.sqrt(1 - 0.7 * s * s);
        var cx = R * Math.sin(a), cy = top - R * (1 - Math.cos(a)), T = [Math.sin(a), Math.cos(a), 0];
        var zle = 0.3 * c - 0.45 * s * s;              // leve flecha: las puntas van más atrás
        var th = (i % 2) ? 1.1 : 0.94;                 // celdas infladas entre costillas
        meta.push({ c: c, cx: cx, cy: cy, T: T, zle: zle });
        rings.push(foil.map(function (q) { var y = q[1] * th; return [cx + T[0] * y * c, cy + T[1] * y * c, zle - q[0] * c]; }));
      }
      loft(V, rings, true, function (i, k) {
        var cell = Math.floor(i / 2), col = white;
        if (cell < 6 || cell >= 34) col = A;
        else if (cell >= 16 && cell <= 23) col = Bc;
        else if (cell === 14 || cell === 15 || cell === 24 || cell === 25) col = Cc;
        if (k >= NA + 1 && k <= NA + 2 && cell >= 2 && cell <= 37 && (i % 2)) col = intake;   // bocas de entrada
        return [col, 5];
      });
      cap(V, rings[0], nz(sub(ringC(rings[0]), ringC(rings[1]))), A, 5);
      cap(V, rings[NS], nz(sub(ringC(rings[NS]), ringC(rings[NS - 1]))), A, 5);
      // Cuerdas: filas A-D del intradós hasta las bandas; frenos desde el borde de fuga.
      var lc = [0.86, 0.85, 0.8], rows = [NA + 2, NA + 5, NA + 8, NA + 10];
      rows = [NA + 2, NA + 8];
      for (i = 0; i <= NS; i += 8) {
        var side = i < NS / 2 ? -1 : 1;
        rows.forEach(function (k, r) { line(L, rings[i][k], [0.23 * side, 1.25, 0.08 - 0.1 * r], lc); });
        if (i % 16 === 8) line(L, rings[i][0], [0.3 * side, 1.35, -0.25], lc);
      }
      line(L, [0.23, 1.25, 0.05], [0.18, 1.02, 0], lc); line(L, [-0.23, 1.25, 0.05], [-0.18, 1.02, 0], lc);
      // Piloto sentado en la silla, con casco.
      ellipsoid(V, [0, 0.35, 0.25], [0.27, 0.24, 0.78], hex('#2c3034'), 6);
      ellipsoid(V, [0, 0.85, -0.02], [0.21, 0.3, 0.17], hex(scheme.j), 6);
      ellipsoid(V, [0, 1.27, 0.02], [0.15, 0.15, 0.16], hex('#f4f4f2'), 0);
      return { V: new Float32Array(V), L: new Float32Array(L) };
    }
    function upload(arr) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return b; }
    var g1 = glider({ a: '#e2572b', b: '#1f4e8c', c: '#f3c623', j: '#b23a2e' });
    var g2 = glider({ a: '#2a9d8f', b: '#e9c46a', c: '#264653', j: '#23395d' });
    // Térmicas: el primero gira delante de la vista inicial (al norte-noreste del punto 1); el segundo, al oeste.
    this.GLIDERS = [
      { buf: upload(g1.V), n: g1.V.length / 10, lbuf: upload(g1.L), ln: g1.L.length / 10, cx: 60, cz: -230, h: 255, r: 48, v: 10, dir: 1, ph: 0.3 },
      { buf: upload(g2.V), n: g2.V.length / 10, lbuf: upload(g2.L), ln: g2.L.length / 10, cx: -340, cz: -130, h: 300, r: 60, v: 10.5, dir: -1, ph: 2.1 }
    ];

    // ---------- Avioneta monomotor de ala alta, genérica y sin marcas (8,4 m de largo, 11 m de envergadura) ----------
    // Origen cerca del borde de ataque del ala; x a la derecha, y arriba, z hacia la nariz.
    function cyl(V, a, b, r, col, mat, capped) {
      var ax = nz(sub(b, a)), t = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = nz(cr(ax, t)), w = cr(ax, u), R0 = [], R1 = [];
      for (var k = 0; k < 10; k++) {
        var an = 2 * Math.PI * k / 10, o = [(u[0] * Math.cos(an) + w[0] * Math.sin(an)) * r, (u[1] * Math.cos(an) + w[1] * Math.sin(an)) * r, (u[2] * Math.cos(an) + w[2] * Math.sin(an)) * r];
        R0.push([a[0] + o[0], a[1] + o[1], a[2] + o[2]]); R1.push([b[0] + o[0], b[1] + o[1], b[2] + o[2]]);
      }
      loft(V, [R0, R1], true, function () { return [col, mat]; });
      if (capped) { cap(V, R0, [-ax[0], -ax[1], -ax[2]], col, mat); cap(V, R1, ax, col, mat); }
    }
    function plane() {
      var V = [], T = [], white = hex('#f2f2ee'), navy = hex('#23395d'), red = hex('#b3262e'), grey = hex('#c4c8cb'), under = hex('#dfe2e3'), rubber = hex('#1c1c1c'), metal = hex('#8f969c');
      // Fuselaje: secciones superelípticas (z, medio ancho, techo, piso).
      var ST = [[3.75, 0.10, 0.10, -0.12], [3.55, 0.36, 0.30, -0.34], [3.20, 0.50, 0.46, -0.50], [2.70, 0.56, 0.58, -0.58], [2.20, 0.58, 0.95, -0.60], [1.70, 0.60, 1.12, -0.60], [0.90, 0.60, 1.15, -0.58], [0.10, 0.58, 1.12, -0.52], [-0.60, 0.52, 1.02, -0.40], [-1.40, 0.42, 0.82, -0.25], [-2.30, 0.32, 0.68, -0.08], [-3.20, 0.22, 0.60, 0.06], [-4.00, 0.14, 0.56, 0.16], [-4.60, 0.06, 0.52, 0.26]];
      var NP = 28, rings = [];
      ST.forEach(function (q) {
        var z = q[0], w = q[1], cy = (q[2] + q[3]) / 2, hh = (q[2] - q[3]) / 2, r = [];
        for (var k = 0; k < NP; k++) {
          var an = 2 * Math.PI * k / NP, cx = Math.cos(an), sy = Math.sin(an);
          r.push([w * Math.sign(cx) * Math.pow(Math.abs(cx), 2 / 2.6), cy + hh * Math.sign(sy) * Math.pow(Math.abs(sy), 2 / 2.6), z]);
        }
        rings.push(r);
      });
      loft(V, rings, true, function (i, k) {
        var a = rings[i][k], b = rings[i + 1][(k + 1) % NP], x = Math.abs((a[0] + b[0]) / 2), y = (a[1] + b[1]) / 2, z = (a[2] + b[2]) / 2;
        if (z > -0.5 && z < 1.6 && y > 0.45 && y < 1.0 && x > 0.32) return [white, 1];   // ventanas laterales
        if (z > 1.75 && z < 2.55 && y > 0.62) return [white, 1];                         // parabrisas
        if (z > -1.3 && z < -0.6 && y > 0.78 && x < 0.4) return [white, 1];              // luneta
        if (y < -0.28) return [grey, 0];
        if (y > -0.14 && y < 0.02 && z < 2.7) return [navy, 0];
        if (y > 0.05 && y < 0.09 && z < 2.6 && z > -3.2) return [red, 0];
        return [white, 0];
      });
      cap(V, rings[rings.length - 1], [0, 0.3, -1], white, 0);
      // Cono de la hélice.
      var sp = [];
      for (var j = 0; j <= 6; j++) {
        var zz = 3.72 + 0.42 * j / 6, rr = 0.2 * Math.sqrt(Math.max(0.0004, 1 - Math.pow(j / 6, 2))), ring = [];
        for (var k = 0; k < 16; k++) { var an = 2 * Math.PI * k / 16; ring.push([rr * Math.cos(an), 0.0 + rr * Math.sin(an), zz]); }
        sp.push(ring);
      }
      loft(V, sp, true, function () { return [red, 0]; });
      // Ala alta con perfil NACA 2412, diedro 1,7°, parte central recta y puntas en trapecio.
      var wf = airfoil(12, 0.12, 0.02, 0.4), XS = [-5.5, -5.1, -4.6, -4.0, -3.2, -2.6, -2.0, -1.2, -0.6, 0, 0.6, 1.2, 2.0, 2.6, 3.2, 4.0, 4.6, 5.1, 5.5], wr = [];
      XS.forEach(function (x) {
        var ax = Math.abs(x), tp = Math.max(0, (ax - 2.6) / 2.9), c = 1.63 - 0.51 * tp, zle = 1.55 - 0.12 * tp, y0 = 1.10 + ax * 0.0297;
        wr.push(wf.map(function (q) { return [x, y0 + q[1] * c - q[0] * c * 0.026, zle - q[0] * c]; }));
      });
      loft(V, wr, true, function (i, k) { var x = Math.abs(wr[i][0][0]); if (x > 5.05) return [navy, 0]; return [k <= 12 ? white : under, 0]; });
      cap(V, wr[0], [-1, 0, 0], navy, 0); cap(V, wr[wr.length - 1], [1, 0, 0], navy, 0);
      // Montantes del ala y tren fijo con carenados.
      [-1, 1].forEach(function (sd) {
        cyl(V, [0.56 * sd, -0.3, 0.95], [2.6 * sd, 1.12, 0.95], 0.045, white, 0);
        cyl(V, [0.45 * sd, -0.55, 0.25], [1.2 * sd, -1.12, 0.3], 0.045, metal, 0);
        cyl(V, [1.12 * sd, -1.32, 0.3], [1.30 * sd, -1.32, 0.3], 0.22, rubber, 6, true);
        ellipsoid(V, [1.21 * sd, -1.22, 0.32], [0.13, 0.2, 0.5], white, 0);
      });
      cyl(V, [0, -0.5, 3.0], [0, -1.15, 3.05], 0.045, metal, 0);
      cyl(V, [-0.07, -1.33, 3.05], [0.07, -1.33, 3.05], 0.19, rubber, 6, true);
      ellipsoid(V, [0, -1.24, 3.07], [0.11, 0.17, 0.42], white, 0);
      // Estabilizador horizontal y deriva con franja.
      var sf = airfoil(10, 0.09, 0, 0.4), hs = [];
      [-1.75, -1.2, -0.6, 0, 0.6, 1.2, 1.75].forEach(function (x) {
        var t = Math.abs(x) / 1.75, c = 1.05 - 0.35 * t, zle = -3.55 - 0.2 * t;
        hs.push(sf.map(function (q) { return [x, 0.56 + q[1] * c, zle - q[0] * c]; }));
      });
      loft(V, hs, true, function () { return [white, 0]; });
      cap(V, hs[0], [-1, 0, 0], white, 0); cap(V, hs[hs.length - 1], [1, 0, 0], white, 0);
      var vs = [];
      [0.5, 0.8, 1.1, 1.4, 1.7, 1.95, 2.12].forEach(function (y) {
        var t = (y - 0.5) / 1.62, c = 1.6 - 0.85 * t, zle = -2.95 - 1.0 * t;
        vs.push(sf.map(function (q) { return [q[1] * c, y, zle - q[0] * c]; }));
      });
      loft(V, vs, true, function (i) { var y = vs[i][0][1]; return [y >= 1.4 && y < 1.7 ? navy : white, 0]; });
      cap(V, vs[vs.length - 1], [0, 1, 0], white, 0);
      // Disco de la hélice en giro (transparente) y dos sombras de pala.
      for (k = 0; k < 32; k++) {
        var a0 = 2 * Math.PI * k / 32, a1 = 2 * Math.PI * (k + 1) / 32;
        push(T, [0, 0, 3.98], [0, 0, 1], [0.55, 0, 0], 2);
        push(T, [0.95 * Math.cos(a0), 0.95 * Math.sin(a0), 3.98], [0, 0, 1], [1.1, 0, 0], 2);
        push(T, [0.95 * Math.cos(a1), 0.95 * Math.sin(a1), 3.98], [0, 0, 1], [1.1, 0, 0], 2);
      }
      return { V: new Float32Array(V), T: new Float32Array(T) };
    }
    var pl = plane();
    // Circuito alrededor del loteo, nunca encima de los lotes: elipse centrada en el loteo, 240 m sobre el terreno.
    this.PLANE = { buf: upload(pl.V), n: pl.V.length / 10, tbuf: upload(pl.T), tn: pl.T.length / 10, v: 8, pass: null, first: true, wait: 0, sign: 1 };

    // ---------- Cóndor andino planeando (3 m de envergadura), silueta orgánica ----------
    // Cuerpo, cuello con collar blanco, alas con leve gaviota, banda clara de secundarias, seis primarias separadas
    // («dedos») curvadas hacia arriba y cola en abanico. Plumas de dos caras (material 7).
    function condor() {
      var V = [], black = hex('#141414'), panel = hex('#bdb8ae'), ruff = hex('#ece9e2'), head = hex('#6d4c47'), up = [0, 1, 0];
      ellipsoid(V, [0, 0, 0], [0.17, 0.15, 0.52], black, 6);
      ellipsoid(V, [0, 0.02, 0.44], [0.13, 0.12, 0.08], ruff, 6);
      ellipsoid(V, [0, 0.03, 0.6], [0.065, 0.065, 0.12], head, 6);
      function tri(a, b, c, col) { push(V, a, up, col, 7); push(V, b, up, col, 7); push(V, c, up, col, 7); }
      function wy(x) { return 0.06 * Math.sin(Math.PI * Math.min(x, 1.15) / 1.6) + (x > 0.95 ? 0.18 * (x - 0.95) * (x - 0.95) : 0); }
      [-1, 1].forEach(function (sd) {
        var NXs = 10, NC = 4;
        for (var i = 0; i < NXs; i++) for (var k = 0; k < NC; k++) {
          var q = [[i, k], [i + 1, k], [i + 1, k + 1], [i, k + 1]].map(function (t) {
            var x = 0.12 + 1.03 * t[0] / NXs, le = 0.2 - 0.06 * x, ch = 0.52 + 0.06 * Math.sin(Math.PI * x / 1.15), z = le - ch * t[1] / NC;
            return [sd * x, wy(x) - 0.02 * (t[1] / NC), z];
          });
          var xm = Math.abs((q[0][0] + q[2][0]) / 2), col = (k >= 2 && xm > 0.3 && xm < 1.05) ? panel : black;
          tri(q[0], q[1], q[2], col); tri(q[0], q[2], q[3], col);
        }
        // Primarias separadas en abanico, afinadas en la punta y curvadas hacia arriba.
        for (var f = 0; f < 6; f++) {
          var zb = 0.13 - 0.08 - f * 0.085, ang = (16 - f * 11) * Math.PI / 180, len = 0.5 - Math.abs(f - 2) * 0.03, x0 = 1.15, y0 = wy(1.15);
          var dx = Math.cos(ang), dz = Math.sin(ang), nx = -dz, nz2 = dx, w0 = 0.045, w1 = 0.012, P = [];
          for (var s = 0; s <= 4; s++) {
            var tt = s / 4, w = w0 + (w1 - w0) * tt, cx = x0 + dx * len * tt, cz = zb + dz * len * tt, cy = y0 + 0.12 * tt * tt;
            P.push([[sd * (cx + nx * w), cy, cz + nz2 * w], [sd * (cx - nx * w), cy, cz - nz2 * w]]);
          }
          for (s = 0; s < 4; s++) { tri(P[s][0], P[s + 1][0], P[s + 1][1], black); tri(P[s][0], P[s + 1][1], P[s][1], black); }
        }
      });
      // Cola en abanico.
      for (var tI = 0; tI < 8; tI++) {
        var a0 = (-28 + 56 * tI / 8) * Math.PI / 180, a1 = (-28 + 56 * (tI + 1) / 8) * Math.PI / 180, rT = 0.42;
        tri([0, 0.0, -0.4], [Math.sin(a0) * rT, -0.01, -0.4 - Math.cos(a0) * rT], [Math.sin(a1) * rT, -0.01, -0.4 - Math.cos(a1) * rT], black);
      }
      return new Float32Array(V);
    }
    var cd = condor();
    // Térmica a la izquierda de la vista inicial, fuera del título y de la columna izquierda; planeo lento.
    this.BIRDS = [{ buf: upload(cd), n: cd.length / 10, cx: -250, cz: -420, h: 255, r: 90, v: 11, dir: -1, ph: 1.2 }];
    this.bnBuf = gl.createBuffer(); this.ropeBuf = gl.createBuffer();
    // Bandera: el PNG original (1600 × 251) entra en una textura de 2048 × 512 con escala uniforme (sin deformar el logo).
    var self = this, img = new Image();
    img.onload = function () {
      if (self.dead) return;
      var cv = document.createElement('canvas'); cv.width = 2048; cv.height = 512;
      var cx = cv.getContext('2d'), bh = 2048 * img.naturalHeight / img.naturalWidth, oy = (512 - bh) / 2;
      cx.drawImage(img, 0, 0, 1, 1, 0, 0, 2048, 512);   // fondo: el color de tela del propio PNG
      cx.drawImage(img, 0, oy, 2048, bh);
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      var an = gl.getExtension('EXT_texture_filter_anisotropic');
      if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      self.bnTex = t; self.bnV = [oy / 512, (oy + bh) / 512]; self.bnAspect = img.naturalWidth / img.naturalHeight; self.req();
    };
    img.src = this.BANNER_URL;
  }
  // Trayectoria de la pasada actual: recta horizontal; el parámetro es la distancia recorrida en metros.
  planeAt(s) { var q = this.PLANE.pass; return [q.O[0] + q.U[0] * s, q.O[1], q.O[2] + q.U[2] * s]; }
  planeDer() { return this.PLANE.pass.U; }
  // Nueva pasada: perpendicular a la mirada, a 70 m por delante, a una altura que la ubica por debajo del título
  // (cerca del 45 % de la pantalla). Alterna el sentido. Nunca baja de 60 m sobre el terreno.
  newPass(P) {
    var B = this.basis(), fl = Math.hypot(B.f[0], B.f[2]) || 1, f = [B.f[0] / fl, 0, B.f[2] / fl], r = [f[2], 0, -f[0]];
    P.sign = -P.sign;
    var U = [r[0] * P.sign, 0, r[2] * P.sign], H = this.ch || 800, fy = (H / 2) / Math.tan(this.view.fov * Math.PI / 360);
    var titleBottom = this.worldEl ? (this.cw < 700 ? 64 : 84) + 18 + (this.worldEl.offsetHeight || 150) : 252;
    var yT = Math.max(H * 0.45, titleBottom + 70), el = this.view.pitch * Math.PI / 180 + Math.atan((H / 2 - yT) / fy);
    el = Math.max(-0.75, Math.min(0.1, el));
    var D = 70, h = Math.max(60, this.cam.h + D * Math.tan(el));
    // Velocidad de animación (no física): 8 m/s a 70 m deja la avioneta unos 25-30 s en pantalla y la bandera, legible,
    // más de 10 s. El tramo empieza y termina justo fuera de cuadro (más la cuerda y la bandera).
    P.pass = { O: [this.cam.x + f[0] * D, h, this.cam.y + f[2] * D], U: U, s: -D * 1.9, end: D * 1.9 + 105 };
    P.first = false;
  }
  // Bandera remolcada: sigue la trayectoria hacia atrás (también en los giros) y flamea con una onda que crece hacia la cola.
  bannerMesh(th, t) {
    var P = this.PLANE, NC = 48, NR = 6, lenB = 40, hB = lenB / (this.bnAspect || 6.375), rope = 45, G = [], s = 0, thc = th, step = 0.5;
    for (var j = 0; j <= NC; j++) {
      var target = rope + lenB * j / NC;
      while (s < target) { var dd = this.planeDer(thc), dl = Math.hypot(dd[0], dd[2]) || 1; thc -= step / dl; s += step; }
      var p = this.planeAt(thc), d = this.planeDer(thc), l = Math.hypot(d[0], d[2]) || 1, S = [d[2] / l, 0, -d[0] / l];
      var x = j / NC, amp = 0.1 + 0.9 * x * x, disp = amp * Math.sin(2 * Math.PI * (2.2 * x - 1.3 * t)) + 0.08 * Math.sin(14 * x - 5 * t);
      var drop = 7 + 0.05 * (target - rope), row = [];
      for (var i = 0; i <= NR; i++) {
        var y = i / NR, k = disp * (0.85 + 0.3 * y);
        row.push([p[0] + S[0] * k, p[1] - drop - hB * y, p[2] + S[2] * k]);
      }
      G.push(row);
    }
    if (!this.bnArr || this.bnArr.length !== NC * NR * 6 * 12) this.bnArr = new Float32Array(NC * NR * 6 * 12);
    var out = this.bnArr, o = 0;
    function nrm(j, i) {
      var a = G[Math.min(NC, j + 1)][i], b = G[Math.max(0, j - 1)][i], c = G[j][Math.min(NR, i + 1)], e = G[j][Math.max(0, i - 1)];
      var du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dv = [c[0] - e[0], c[1] - e[1], c[2] - e[2]];
      var n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
      return [n[0] / l, n[1] / l, n[2] / l];
    }
    function put(j, i) { var p = G[j][i], n = nrm(j, i); out[o++] = p[0]; out[o++] = p[1]; out[o++] = p[2]; out[o++] = n[0]; out[o++] = n[1]; out[o++] = n[2]; out[o++] = 1; out[o++] = 1; out[o++] = 1; out[o++] = 3; out[o++] = j / NC; out[o++] = i / NR; }
    for (j = 0; j < NC; j++) for (i = 0; i < NR; i++) { put(j, i); put(j + 1, i); put(j + 1, i + 1); put(j, i); put(j + 1, i + 1); put(j, i + 1); }
    return { arr: out, n: NC * NR * 6, lead: G[0] };
  }
  // Orientación: rumbo (desde el norte, horario) y alabeo (positivo = ala derecha abajo). Columnas: x, y, z locales.
  flyOrient(hd, bank) {
    var F = [Math.sin(hd), 0, Math.cos(hd)], Rt = [Math.cos(hd), 0, -Math.sin(hd)], cb = Math.cos(bank), sb = Math.sin(bank);
    return new Float32Array([Rt[0] * cb, -sb, Rt[2] * cb, Rt[0] * sb, cb, Rt[2] * sb, F[0], F[1], F[2]]);
  }
  flyAttr(G, on, withUV) {
    var gl = this.gl, A = G.A, stride = withUV ? 48 : 40;
    [['pos', 3, 0], ['nrm', 3, 12], ['col', 3, 24], ['mat', 1, 36], ['uv', 2, 40]].forEach(function (e) {
      var l = A[e[0]]; if (l == null || l < 0) return;
      if (on && (e[0] !== 'uv' || withUV)) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, e[1], gl.FLOAT, false, stride, e[2]); } else gl.disableVertexAttribArray(l);
    });
  }
  drawFlyers3D(B, now) {
    var gl = this.gl, G = this.FL, st = this.state; if (!G || !this.GLIDERS) return;
    if (!st.started || st.clean === 'render' || st.panel) return;
    var fade = Math.max(0, 1 - this.cloud * 1.3); if (fade <= 0.01) return;
    var t = (now - this.t0) / 1000, self = this;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(G.p); this.setView(G, B);
    gl.uniform3fv(G.U.sunDir, this.sunDir); gl.uniform1f(G.U.fade, fade);
    this.GLIDERS.forEach(function (g) {
      var w = g.dir * g.v / g.r, a = g.ph + w * t;
      var x = g.cx + g.r * Math.sin(a), z = g.cz + g.r * Math.cos(a), y = g.h + 6 * Math.sin(t * 0.07 + g.ph);
      var hd = Math.atan2(Math.cos(a) * w, -Math.sin(a) * w), bank = g.dir * Math.atan(g.v * g.v / (9.81 * g.r));
      gl.uniformMatrix3fv(G.U.Rm, false, self.flyOrient(hd, bank)); gl.uniform3f(G.U.Om, x, y, z);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.buf); self.flyAttr(G, true); gl.drawArrays(gl.TRIANGLES, 0, g.n);
      gl.depthMask(false); gl.bindBuffer(gl.ARRAY_BUFFER, g.lbuf); self.flyAttr(G, true); gl.drawArrays(gl.LINES, 0, g.ln); gl.depthMask(true);
      self.flyAttr(G, false);
    });
    (this.BIRDS || []).forEach(function (g) {
      var w = g.dir * g.v / g.r, a = g.ph + w * t;
      var x = g.cx + g.r * Math.sin(a), z = g.cz + g.r * Math.cos(a), y = g.h + 4 * Math.sin(t * 0.11 + g.ph);
      var hd = Math.atan2(Math.cos(a) * w, -Math.sin(a) * w), bank = g.dir * Math.atan(g.v * g.v / (9.81 * g.r)) + 0.05 * Math.sin(t * 0.9);
      gl.uniformMatrix3fv(G.U.Rm, false, self.flyOrient(hd, bank)); gl.uniform3f(G.U.Om, x, y, z);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.buf); self.flyAttr(G, true); gl.drawArrays(gl.TRIANGLES, 0, g.n); self.flyAttr(G, false);
    });
    // Avión y bandera retirados por pedido de Mariano (2-nov-2026).
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    this.dirty = true;
  }

  drawPlane(G, now, t) {
    var gl = this.gl, P = this.PLANE; if (!P) return;
    // Durante la entrada la cámara todavía baja: no se crea la primera pasada ni avanza el reloj hasta que termine.
    if (this.introOn) { this.plLast = now; return; }
    // Avance a velocidad constante sobre la elipse; sin saltos si la pestaña estuvo oculta.
    var dt = this.plLast ? Math.min(0.05, Math.max(0, (now - this.plLast) / 1000)) : 0; this.plLast = now;
    // Pasadas lentas y cercanas; 5 s de pausa entre una y otra. La primera entra en cuadro enseguida.
    if (!P.pass) this.newPass(P);
    else if (P.pass.s > P.pass.end) { P.wait += dt; if (P.wait < 5) return; P.wait = 0; this.newPass(P); }
    P.pass.s += dt * P.v;
    P.th = P.pass.s;
    var p = this.planeAt(P.th), d = this.planeDer(), hd = Math.atan2(d[0], d[2]), bank = 0.015 * Math.sin(t * 0.8);
    var R = this.flyOrient(hd, bank);
    gl.uniformMatrix3fv(G.U.Rm, false, R); gl.uniform3f(G.U.Om, p[0], p[1], p[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, P.buf); this.flyAttr(G, true); gl.drawArrays(gl.TRIANGLES, 0, P.n); this.flyAttr(G, false);
    var tail = [p[0] + R[6] * -4.6 + R[3] * 0.3, p[1] + R[7] * -4.6 + R[4] * 0.3, p[2] + R[8] * -4.6 + R[5] * 0.3];
    // Bandera (tela con el logo original) y cuerda de remolque con brida.
    var I = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    gl.uniformMatrix3fv(G.U.Rm, false, I); gl.uniform3f(G.U.Om, 0, 0, 0);
    if (this.bnTex) {
      var bm = this.bannerMesh(P.th, t);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.bnTex); gl.uniform1i(G.U.tex, 0); gl.uniform2f(G.U.texV, this.bnV[0], this.bnV[1]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bnBuf); gl.bufferData(gl.ARRAY_BUFFER, bm.arr, gl.DYNAMIC_DRAW);
      this.flyAttr(G, true, true); gl.drawArrays(gl.TRIANGLES, 0, bm.n); this.flyAttr(G, false, true);
      var lt = bm.lead[0], lb = bm.lead[bm.lead.length - 1], br = [(lt[0] + lb[0]) / 2 + (tail[0] - lt[0]) * 0.08, (lt[1] + lb[1]) / 2 + 1.2, (lt[2] + lb[2]) / 2 + (tail[2] - lt[2]) * 0.08];
      var rc = [0.22, 0.22, 0.2], L = [];
      [[tail, br], [br, lt], [br, lb], [lt, lb]].forEach(function (sg) { sg.forEach(function (v) { L.push(v[0], v[1], v[2], 0, 1, 0, rc[0], rc[1], rc[2], 4); }); });
      gl.depthMask(false);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ropeBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(L), gl.DYNAMIC_DRAW);
      this.flyAttr(G, true); gl.drawArrays(gl.LINES, 0, L.length / 10); this.flyAttr(G, false);
      gl.depthMask(true);
    }
    // Disco de la hélice al final (transparente).
    gl.uniformMatrix3fv(G.U.Rm, false, R); gl.uniform3f(G.U.Om, p[0], p[1], p[2]);
    gl.depthMask(false); gl.bindBuffer(gl.ARRAY_BUFFER, P.tbuf); this.flyAttr(G, true); gl.drawArrays(gl.TRIANGLES, 0, P.tn); this.flyAttr(G, false); gl.depthMask(true);
  }

  // ---------- Vida en el cielo: avioneta con bandera y dos parapentes ----------
  drawFlyers(ctx, B, W, H, fade, now) {
    var st = this.state; if (!st.started || st.clean) return;
    var cam = this.cam, f = B.f, r = B.r, u = B.u, tx = B.tx, ty = B.ty, dpr = this.dpr, t = (now - this.t0) / 1000;
    function S3(p) {
      var wx = p[0] - cam.x, wy = p[1] - cam.h, wz = p[2] - cam.y;
      var z = wx * f[0] + wy * f[1] + wz * f[2]; if (z < 3) return null;
      return [((wx * r[0] + wy * r[1] + wz * r[2]) / z / tx + 1) * 0.5 * W, (1 - (wx * u[0] + wy * u[1] + wz * u[2]) / z / ty) * 0.5 * H, z];
    }
    function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
    var zc = this.uv2xy(-238, -3.5);
    ctx.save(); ctx.globalAlpha = fade; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // Parapentes girando en térmicas.
    [{ c: [zc[0] + 380, 260, zc[1] + 230], R: 60, T: 38, ph: 0, col: '#f08a3c', col2: '#fff3e6' },
     { c: [zc[0] - 260, 300, zc[1] + 430], R: 75, T: 50, ph: 2.1, col: '#2fb5a5', col2: '#e6fbf7' }].forEach(function (g) {
      var a = g.ph + t * 2 * Math.PI / g.T, pos = [g.c[0] + Math.cos(a) * g.R, g.c[1] + Math.sin(t * 0.3 + g.ph) * 6, g.c[2] + Math.sin(a) * g.R];
      var fw = [-Math.sin(a), 0, Math.cos(a)], rt = [Math.cos(a), 0, Math.sin(a)], bank = 0.32, up = [-rt[0] * bank, 1, -rt[2] * bank];
      var Sp = 1.6, pts = [], pil = S3(add(pos, up, -7 * Sp));
      for (var i = 0; i <= 10; i++) { var s = -1.15 + 2.3 * i / 10, q = add(add(pos, rt, Math.sin(s) * 5.5 * Sp), up, Math.cos(s) * 2.2 * Sp); var sq = S3(q); if (!sq) return; pts.push(sq); }
      if (!pil) return;
      var lw = Math.max(1.5, 2.6 * Sp / pts[5][2] / ty * H * 0.5);
      ctx.strokeStyle = 'rgba(30,30,30,0.35)'; ctx.lineWidth = 0.6;
      [0, 3, 7, 10].forEach(function (k) { ctx.beginPath(); ctx.moveTo(pts[k][0], pts[k][1]); ctx.lineTo(pil[0], pil[1]); ctx.stroke(); });
      ctx.strokeStyle = g.col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke();
      ctx.strokeStyle = g.col2; ctx.lineWidth = lw * 0.3; ctx.beginPath(); ctx.moveTo(pts[3][0], pts[3][1]); ctx.lineTo(pts[4][0], pts[4][1]); ctx.lineTo(pts[5][0], pts[5][1]); ctx.stroke();
      ctx.fillStyle = '#26323a'; ctx.beginPath(); ctx.arc(pil[0], pil[1], Math.max(1.2, lw * 0.35), 0, Math.PI * 2); ctx.fill();
    });
    // Avioneta con bandera de Sur Patagonian.
    var th = t * 2 * Math.PI / 85, rx = 430, ry = 330, Sp2 = 1.7;
    function path(a) { return [zc[0] + Math.cos(a) * rx, 150 + Math.sin(a * 2) * 8, zc[1] - 60 + Math.sin(a) * ry]; }
    var p0 = path(th), p1 = path(th + 0.01), fw2 = [p1[0] - p0[0], 0, p1[2] - p0[2]], fl = Math.hypot(fw2[0], fw2[2]) || 1;
    fw2 = [fw2[0] / fl, 0, fw2[2] / fl]; var rt2 = [fw2[2], 0, -fw2[0]];
    var nose = S3(add(p0, fw2, 4.2 * Sp2)), tail = S3(add(p0, fw2, -3.8 * Sp2)), wl = S3(add(add(p0, rt2, -5.5 * Sp2), fw2, 0.6 * Sp2)), wr = S3(add(add(p0, rt2, 5.5 * Sp2), fw2, 0.6 * Sp2));
    var tl2 = S3(add(add(p0, rt2, -2 * Sp2), fw2, -3.4 * Sp2)), tr2 = S3(add(add(p0, rt2, 2 * Sp2), fw2, -3.4 * Sp2));
    var bn = this.banner;
    if (nose && tail && wl && wr && tl2 && tr2) {
      // Bandera: tela vertical que flamea detrás de la avioneta.
      var L = 34 * Sp2, Hh = 6.2 * Sp2, gap = 14 * Sp2, N = 12, top = [], bot = [];
      for (var k = 0; k <= N; k++) {
        var d = gap + L * k / N, aa = th - d / ((rx + ry) / 2), q = path(aa), q1 = path(aa + 0.01), dx = q1[0] - q[0], dz = q1[2] - q[2], dl = Math.hypot(dx, dz) || 1;
        var wv = Math.sin(k * 0.8 - t * 7) * 0.9 * (k / N);
        var base = [q[0] + dz / dl * wv, q[1] - 2, q[2] - dx / dl * wv];
        var a1 = S3([base[0], base[1] + Hh / 2, base[2]]), b1 = S3([base[0], base[1] - Hh / 2, base[2]]);
        if (!a1 || !b1) { top = null; break; }
        top.push(a1); bot.push(b1);
      }
      if (top) {
        ctx.strokeStyle = 'rgba(40,40,40,0.5)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(tail[0], tail[1]);
        ctx.lineTo((top[0][0] + bot[0][0]) / 2, (top[0][1] + bot[0][1]) / 2); ctx.stroke();
        if (bn && bn.complete && bn.naturalWidth) {
          var flip = top[N][0] < top[0][0], iw = bn.naturalWidth, ih = bn.naturalHeight;
          for (var s2 = 0; s2 < N; s2++) {
            var i0 = flip ? N - s2 : s2, i1 = flip ? N - s2 - 1 : s2 + 1, TL = top[i0], TR = top[i1], BL = bot[i0];
            var sx0 = iw * s2 / N, sw = iw / N + 1;
            var a_ = (TR[0] - TL[0]) / (iw / N), b_ = (TR[1] - TL[1]) / (iw / N), c_ = (BL[0] - TL[0]) / ih, d_ = (BL[1] - TL[1]) / ih;
            ctx.setTransform(a_ * dpr, b_ * dpr, c_ * dpr, d_ * dpr, TL[0] * dpr, TL[1] * dpr);
            ctx.drawImage(bn, sx0, 0, sw, ih, 0, 0, sw, ih);
          }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      }
      ctx.fillStyle = '#f4f4f2'; ctx.strokeStyle = 'rgba(20,20,20,0.6)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(wl[0], wl[1]); ctx.lineTo(nose[0], nose[1]); ctx.lineTo(wr[0], wr[1]); ctx.lineTo(tail[0], tail[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tl2[0], tl2[1]); ctx.lineTo(tr2[0], tr2[1]); ctx.stroke();
      ctx.strokeStyle = '#c9302c'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(wl[0], wl[1]); ctx.lineTo(wr[0], wr[1]); ctx.stroke();
    }
    ctx.restore();
    this.dirty = true;
  }

  // ---------- Rutas, accesos y carteles en altura ----------
  buildRoutes() {
    var gl = this.gl, V = [], self = this;
    this.routeLen = {};
    this.ROUTES.forEach(function (R) {
      var P = R.pts, n = P.length, s = 0, acc = [0];
      for (var i = 1; i < n; i++) { s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); acc.push(s); }
      self.routeLen[R.id] = s;
      var nr = [];
      for (var j = 0; j < n; j++) {
        var a = P[Math.max(0, j - 1)], b = P[Math.min(n - 1, j + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
        var nx = -dz / L, nz = dx / L, k = 1;
        if (j > 0 && j < n - 1) {
          var d1x = P[j][0] - P[j - 1][0], d1z = P[j][1] - P[j - 1][1], l1 = Math.hypot(d1x, d1z) || 1;
          var m = (-d1z / l1) * nx + (d1x / l1) * nz; k = 1 / Math.max(0.5, m);
        }
        nr.push([nx * k, nz * k]);
      }
      function vt(j, side) { var p = P[j]; V.push(p[0], (p[2] || 0) + 0.6, p[1], nr[j][0], nr[j][1], side, acc[j], R.k, s); }
      for (var q = 0; q < n - 1; q++) { vt(q, -1); vt(q + 1, -1); vt(q + 1, 1); vt(q, -1); vt(q + 1, 1); vt(q, 1); }
    });
    this.rCount = V.length / 9;
    this.rBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.rBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
  }

  drawRoutes(B, now) {
    var gl = this.gl, G = this.RT; if (!G || !this.rBuf) return;
    var want = this.state.acc && this.state.started && !this.state.clean ? 1 : 0;
    this.accT = (this.accT || 0) + (want - (this.accT || 0)) * 0.12;
    if (Math.abs(want - this.accT) < 0.003) this.accT = want;
    var fade = Math.max(0, 1 - this.cloud * 1.3) * this.accT * (this.state.panel ? 0.3 : 1);
    if (fade <= 0.01) { if (this.accT !== want) this.dirty = true; return; }
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(G.p);
    this.setView(G, B);
    gl.uniform1f(G.U.pxk, 2 * B.ty / Math.max(1, this.ch));
    gl.uniform1f(G.U.time, (now - this.t0) / 1000);
    gl.uniform1f(G.U.fade, fade);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rBuf);
    var A = G.A;
    gl.enableVertexAttribArray(A.pos); gl.vertexAttribPointer(A.pos, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(A.off); gl.vertexAttribPointer(A.off, 2, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(A.aux); gl.vertexAttribPointer(A.aux, 4, gl.FLOAT, false, 36, 20);
    gl.drawArrays(gl.TRIANGLES, 0, this.rCount);
    gl.disableVertexAttribArray(A.pos); gl.disableVertexAttribArray(A.off); gl.disableVertexAttribArray(A.aux);
    gl.disable(gl.BLEND);
    this.dirty = true;
  }

  drawOverlay(B) {
    var ctx = this.ctx; if (!ctx) return;
    var W = this.cw, H = this.ch, self = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var d = this.data; if (!d || this.state.loading) return;
    var fade = Math.max(0, 1 - this.cloud * 1.4);
    if (fade <= 0.01) return;
    ctx.globalAlpha = fade;
    var cam = this.cam, near = 0.5, f = B.f, r = B.r, u = B.u, tx = B.tx, ty = B.ty, g = d.ground;
    function C(x, y, z) {
      var wx = x - cam.x, wy = (z - g) - cam.h, wz = y - cam.y;
      return [wx * r[0] + wy * r[1] + wz * r[2], wx * u[0] + wy * u[1] + wz * u[2], wx * f[0] + wy * f[1] + wz * f[2]];
    }
    function S(c) { return [(c[0] / c[2] / tx + 1) * 0.5 * W, (1 - c[1] / c[2] / ty) * 0.5 * H]; }
    var calMode = this.state.panel && !this.anim, lc = this.props.lotColor || '#ffffff';
    // Fuera del calce, el plano se dibuja como luz en WebGL; las líneas 2D solo sirven para calzar.
    if (!calMode) { ctx.globalAlpha = 1; return; }
    var hideZone = this.zoneT > 0.02 && !calMode;
    if (d.blocks) {
      var BP = new Path2D();
      for (var bi = 0; bi < d.blocks.length; bi++) {
        var poly = d.blocks[bi], okb = true, pts = [], cx = 0, cy = 0;
        for (var bk = 0; bk < poly.length; bk++) { cx += poly[bk][0]; cy += poly[bk][1]; }
        if (hideZone && this.inZone(cx / poly.length, cy / poly.length)) continue;
        for (bk = 0; bk < poly.length; bk++) { var cb = C(poly[bk][0], poly[bk][1], poly[bk][2]); if (cb[2] < near) { okb = false; break; } pts.push(S(cb)); }
        if (!okb) continue;
        BP.moveTo(pts[0][0], pts[0][1]);
        for (var bj = 1; bj < pts.length; bj++) BP.lineTo(pts[bj][0], pts[bj][1]);
        BP.closePath();
      }
      if (!calMode) { ctx.fillStyle = 'rgba(234,245,236,0.13)'; ctx.fill(BP); }
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(5,31,32,0.55)'; ctx.lineWidth = 5; ctx.stroke(BP);
      ctx.strokeStyle = lc; ctx.lineWidth = 2.4; ctx.stroke(BP);
    }
    if (d.layers.PLANO) {
      var P = new Path2D(), ls = d.layers.PLANO;
      for (var i = 0; i < ls.length; i++) {
        if (hideZone && this.inZone((ls[i][0][0] + ls[i][1][0]) / 2, (ls[i][0][1] + ls[i][1][1]) / 2)) continue;
        var a = C(ls[i][0][0], ls[i][0][1], ls[i][0][2]), b = C(ls[i][1][0], ls[i][1][1], ls[i][1][2]);
        if (a[2] < near && b[2] < near) continue;
        if (a[2] < near) { var t = (near - a[2]) / (b[2] - a[2]); a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]; }
        if (b[2] < near) { var t2 = (near - a[2]) / (b[2] - a[2]); b = [a[0] + (b[0] - a[0]) * t2, a[1] + (b[1] - a[1]) * t2, near]; }
        var sa = S(a), sb = S(b); P.moveTo(sa[0], sa[1]); P.lineTo(sb[0], sb[1]);
      }
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(5,31,32,0.35)'; ctx.lineWidth = 2.6; ctx.stroke(P);
      ctx.strokeStyle = calMode ? 'rgba(255,255,255,0.8)' : lc; ctx.globalAlpha = fade * 0.9; ctx.lineWidth = 1.1; ctx.stroke(P); ctx.globalAlpha = fade;
    }
    if (calMode) {
      ctx.font = '600 12px system-ui, sans-serif'; ctx.textBaseline = 'middle';
      var c0 = this.calOf(this.state.cur), M = this.matOf(c0), pairs = c0.pairs;
      for (var q = 0; q < pairs.length; q++) {
        var pr = pairs[q], wd = this.mtv(M, pr.p);
        var cd = [wd[0] * r[0] + wd[1] * r[1] + wd[2] * r[2], wd[0] * u[0] + wd[1] * u[1] + wd[2] * u[2], wd[0] * f[0] + wd[1] * f[1] + wd[2] * f[2]];
        var cv = C(pr.v[0], pr.v[1], pr.v[2]);
        var sp = cd[2] > 0.05 ? S(cd) : null, sv = cv[2] > near ? S(cv) : null;
        if (sp && sv) { ctx.strokeStyle = '#ffb74d'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sp[0], sp[1]); ctx.lineTo(sv[0], sv[1]); ctx.stroke(); }
        if (sv) { ctx.beginPath(); ctx.arc(sv[0], sv[1], 7, 0, 6.2832); ctx.lineWidth = 2.5; ctx.strokeStyle = '#4dc992'; ctx.stroke(); }
        if (sp) {
          ctx.strokeStyle = '#ffb74d'; ctx.lineWidth = 2.5; ctx.beginPath();
          ctx.moveTo(sp[0] - 8, sp[1]); ctx.lineTo(sp[0] + 8, sp[1]); ctx.moveTo(sp[0], sp[1] - 8); ctx.lineTo(sp[0], sp[1] + 8); ctx.stroke();
          ctx.fillStyle = '#0b2b26'; ctx.fillRect(sp[0] + 8, sp[1] - 22, 20, 18); ctx.fillStyle = '#ffb74d'; ctx.fillText(String(q + 1), sp[0] + 14, sp[1] - 13);
        }
      }
      if (this.state.pending != null && this.verts) {
        var pv = this.verts[this.state.pending], cp = C(pv[0], pv[1], pv[2]);
        if (cp[2] > near) { var s2 = S(cp); ctx.beginPath(); ctx.arc(s2[0], s2[1], 11, 0, 6.2832); ctx.lineWidth = 3; ctx.strokeStyle = '#4dc992'; ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Plano chico para el calce ----------
  buildVerts() {
    var seen = {}, out = [], ls = this.data.layers.PLANO;
    for (var i = 0; i < ls.length; i++) for (var j = 0; j < 2; j++) {
      var p = ls[i][j], k = Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
      if (!seen[k]) { seen[k] = 1; out.push(p); }
    }
    this.verts = out;
    var mx = 1e9, Mx = -1e9, my = 1e9, My = -1e9;
    out.forEach(function (p) { mx = Math.min(mx, p[0]); Mx = Math.max(Mx, p[0]); my = Math.min(my, p[1]); My = Math.max(My, p[1]); });
    this.box = { mx: mx - 15, Mx: Mx + 15, my: my - 15, My: My + 15 };
  }
  miniXf() {
    var c = this.mmc, w = c.clientWidth, h = c.clientHeight, b = this.box;
    var s = Math.min(w / (b.Mx - b.mx), h / (b.My - b.my));
    var ox = (w - (b.Mx - b.mx) * s) / 2, oy = (h - (b.My - b.my) * s) / 2;
    return { s: s, f: function (x, y) { return [ox + (x - b.mx) * s, oy + (b.My - y) * s]; }, w: w, h: h };
  }
  drawMini() {
    var c = this.mmc; if (!c || !this.data || !this.verts) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), X = this.miniXf();
    c.width = Math.round(X.w * dpr); c.height = Math.round(X.h * dpr);
    var g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, X.w, X.h);
    var ls = this.data.layers.PLANO;
    g.strokeStyle = 'rgba(234,245,236,0.75)'; g.lineWidth = 1; g.beginPath();
    for (var i = 0; i < ls.length; i++) { var a = X.f(ls[i][0][0], ls[i][0][1]), b = X.f(ls[i][1][0], ls[i][1][1]); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    g.stroke();
    for (var s = 0; s < this.SCENES.length; s++) {
      var ps = this.posOf(s), q = X.f(ps.x, ps.y);
      g.beginPath(); g.arc(q[0], q[1], s === this.state.cur ? 5 : 3, 0, 6.2832);
      g.fillStyle = s === this.state.cur ? '#8eb69b' : 'rgba(142,182,155,0.5)'; g.fill();
      if (s === this.state.cur) {
        var yr = this.view.yaw * Math.PI / 180;
        g.strokeStyle = '#8eb69b'; g.lineWidth = 2; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + Math.sin(yr) * 26, q[1] - Math.cos(yr) * 26); g.stroke();
      }
    }
    var pairs = this.calOf(this.state.cur).pairs;
    g.font = '600 11px system-ui, sans-serif'; g.textBaseline = 'middle';
    for (var k = 0; k < pairs.length; k++) {
      var pv = X.f(pairs[k].v[0], pairs[k].v[1]);
      g.beginPath(); g.arc(pv[0], pv[1], 6, 0, 6.2832); g.fillStyle = '#ffb74d'; g.fill();
      g.fillStyle = '#0b2b26'; g.fillText(String(k + 1), pv[0] - 3, pv[1] + 1);
    }
    if (this.state.pending != null) {
      var pp = this.verts[this.state.pending], z = X.f(pp[0], pp[1]);
      g.beginPath(); g.arc(z[0], z[1], 8, 0, 6.2832); g.lineWidth = 3; g.strokeStyle = '#4dc992'; g.stroke();
    }
  }

  // ---------- Cálculo del calce ----------
  errOf(sc, cal, pairs) {
    var M = this.matOf(cal), cx = sc.x - cal.dx, cy = sc.y - cal.dy, g = this.data.ground, e = 0;
    for (var i = 0; i < pairs.length; i++) {
      var v = pairs[i].v, w = [v[0] - cx, (v[2] - g) - cal.agl, v[1] - cy];
      var n = Math.hypot(w[0], w[1], w[2]); w = [w[0] / n, w[1] / n, w[2] / n];
      var p = this.mv(M, w), o = pairs[i].p, dot = Math.max(-1, Math.min(1, p[0] * o[0] + p[1] * o[1] + p[2] * o[2]));
      var a = Math.acos(dot) * 180 / Math.PI; e += a * a;
    }
    return e;
  }
  solve() {
    var i = this.state.cur, sc = this.SCENES[i], c0 = this.calOf(i), pairs = c0.pairs, self = this;
    if (pairs.length < 2) return;
    var keys = pairs.length >= 3 ? ['heading', 'agl', 'dx', 'dy', 'tilt', 'roll'] : ['heading', 'agl', 'dx', 'dy'];
    var steps = { heading: 3, agl: 25, dx: 10, dy: 10, tilt: 1.5, roll: 1.5 };
    function toCal(x) { var c = Object.assign({}, c0); keys.forEach(function (k, j) { c[k] = x[j]; }); return c; }
    function fobj(x) {
      var c = toCal(x);
      var reg = 0.02 * (c.tilt * c.tilt + c.roll * c.roll) + 0.002 * (c.dx * c.dx + c.dy * c.dy);
      if (c.agl < 30 || c.agl > 600) reg += 1e6;
      return self.errOf(sc, c, pairs) + reg;
    }
    var best = null, starts = [keys.map(function (k) { return c0[k]; })];
    var alt = starts[0].slice(); alt[0] += 6; starts.push(alt);
    var alt2 = starts[0].slice(); alt2[0] -= 6; starts.push(alt2);
    starts.forEach(function (x0) { var r = self.nelder(fobj, x0, keys.map(function (k) { return steps[k]; }), 900); if (!best || r.f < best.f) best = r; });
    var nc = toCal(best.x); nc.heading = ((nc.heading % 360) + 360) % 360;
    var err = Math.sqrt(this.errOf(sc, nc, pairs) / pairs.length);
    var cals = Object.assign({}, this.state.cals);
    cals[sc.id] = { heading: +nc.heading.toFixed(2), agl: +nc.agl.toFixed(1), dx: +nc.dx.toFixed(2), dy: +nc.dy.toFixed(2), tilt: +nc.tilt.toFixed(3), roll: +nc.roll.toFixed(3), pairs: pairs, draft: true };
    this.storeLocal(cals);
    this.setState({ cals: cals, hint: 'Calce calculado con ' + pairs.length + ' puntos. Desvío medio: ' + err.toFixed(2).replace('.', ',') + '°.' });
    var p = this.posOf(i); this.cam = { x: p.x, y: p.y, h: p.h }; this.req();
  }
  nelder(f, x0, step, iters) {
    var n = x0.length, P = [x0.slice()], F;
    for (var i = 0; i < n; i++) { var x = x0.slice(); x[i] += step[i]; P.push(x); }
    F = P.map(f);
    for (var it = 0; it < iters; it++) {
      var idx = P.map(function (_, k) { return k; }).sort(function (a, b) { return F[a] - F[b]; });
      P = idx.map(function (k) { return P[k]; }); F = idx.map(function (k) { return F[k]; });
      if (Math.abs(F[n] - F[0]) < 1e-10) break;
      var c = new Array(n).fill(0);
      for (var k = 0; k < n; k++) for (var j = 0; j < n; j++) c[j] += P[k][j] / n;
      var xr = c.map(function (v, j) { return v + (v - P[n][j]); }), fr = f(xr);
      if (fr < F[0]) { var xe = c.map(function (v, j) { return v + 2 * (v - P[n][j]); }), fe = f(xe); if (fe < fr) { P[n] = xe; F[n] = fe; } else { P[n] = xr; F[n] = fr; } }
      else if (fr < F[n - 1]) { P[n] = xr; F[n] = fr; }
      else {
        var xc = c.map(function (v, j) { return v + 0.5 * (P[n][j] - v); }), fc = f(xc);
        if (fc < F[n]) { P[n] = xc; F[n] = fc; }
        else { for (var m = 1; m <= n; m++) { P[m] = P[m].map(function (v, j) { return P[0][j] + 0.5 * (v - P[0][j]); }); F[m] = f(P[m]); } }
      }
    }
    return { x: P[0], f: F[0] };
  }
  storeLocal(cals) { try { window.localStorage.setItem('alamos-vuelo-cal2', JSON.stringify(cals)); } catch (e) {} }
  setPairs(pairs, hint) {
    var sc = this.SCENES[this.state.cur], cals = Object.assign({}, this.state.cals);
    cals[sc.id] = Object.assign({}, this.calOf(this.state.cur), cals[sc.id] || {}, { pairs: pairs, draft: true });
    this.storeLocal(cals);
    var self = this;
    this.setState({ cals: cals, hint: hint || this.state.hint }, function () { if (pairs.length >= 2) self.solve(); self.drawMini(); });
  }
  setCal(key, v) {
    var sc = this.SCENES[this.state.cur], cals = Object.assign({}, this.state.cals);
    cals[sc.id] = Object.assign({}, this.calOf(this.state.cur), cals[sc.id] || {});
    cals[sc.id][key] = v; cals[sc.id].draft = true;
    this.storeLocal(cals); this.setState({ cals: cals });
  }
  allJson() {
    var self = this, out = {};
    this.SCENES.forEach(function (s, i) {
      if (!self.state.cals[s.id]) return;
      var c = self.calOf(i);
      out[s.id] = { h: +(+c.heading).toFixed(2), a: +(+c.agl).toFixed(1), x: +(+c.dx).toFixed(2), y: +(+c.dy).toFixed(2), t: +(+c.tilt).toFixed(3), r: +(+c.roll).toFixed(3) };
    });
    return 'AJUSTES-ALAMOS ' + JSON.stringify(out);
  }
  saveCal() {
    var sc = this.SCENES[this.state.cur], c = this.calOf(this.state.cur), cals = Object.assign({}, this.state.cals);
    cals[sc.id] = { heading: c.heading, agl: c.agl, dx: c.dx, dy: c.dy, tilt: c.tilt, roll: c.roll, pairs: c.pairs, done: true };
    this.storeLocal(cals);
    this.setState({ cals: cals, saveTxt: sc.name + ' listo. Cuando termine, toque «Copiar los ajustes» y pegue el texto en el chat.' });
  }
  copyAll() {
    var txt = this.allJson(), self = this;
    this.setState({ showJson: true, jsonTxt: txt, saveTxt: 'Copie el texto de abajo y péguelo en el chat.' });
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { self.setState({ saveTxt: 'Texto copiado. Péguelo en el chat.' }); }).catch(function () {}); } catch (e) {}
  }

  // ---------- Vuelo ----------
  ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  sstep(a, b, t) { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); }
  angTo(from, to) { return ((to - from) % 360 + 540) % 360 - 180; }
  // Entrada: las nubes se abren sobre el punto 1 con un descenso corto, sin giro ni cambio de inclinación.
  intro(auto) {
    if (this.anim || this.state.started) return;
    // Prueba de portada: fundido a P1 sin simular el video de vuelo aún pendiente.
    if (this.sunsetEntry && !this.state.entryFailed) {
      var target = this.posOf(0), start = performance.now(), self = this;
      this.A = 0; this.B = 0; this.mixAB = 0; this.cloud = 0;
      this.cam = { x: target.x, y: target.y, h: target.h };
      this.view = { yaw: 10, pitch: -30, fov: 80 };
      this.introOn = true;
      this.setState({ started: true, flying: true });
      this.anim = function (now) {
        if (now - start < (self.reduced() ? 0 : 700)) return;
        self.anim = null; self.introOn = false;
        self.setState({ flying: false }); self.settle(0);
        if (auto) self.play(1.4);
        else if (self.root) self.root.querySelector('.hz-play')?.focus({ preventScroll: true });
      };
      return;
    }
    var self = this, p = this.posOf(0), h0 = p.h + 120, reduce = this.reduced(), dur = reduce ? 900 : 4200, t0 = performance.now();
    this.A = 0; this.B = 0; this.mixAB = 0; this.introOn = true;
    this.setState({ started: true, flying: true });
    this.anim = function (now) {
      var t = Math.min(1, (now - t0) / dur), e = self.ease(t);
      self.cam = { x: p.x, y: p.y, h: reduce ? p.h : h0 + (p.h - h0) * e };
      self.cloud = 1 - self.sstep(0.05, 0.8, t);
      self.prog = t * 1.5;
      if (t >= 1) {
        self.anim = null; self.introOn = false; self.cloud = 0; self.cam = { x: p.x, y: p.y, h: p.h };
        self.setState({ flying: false }); self.settle(0);
        if (auto) self.play(1.4);
      }
    };
  }
  reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  // ---------- Vuelo continuo (Horizonte): trayecto recto entre las fotos ----------
  // La cámara va en línea recta de una foto a la otra, con sus alturas reales. No sube, no cabecea, no hace zoom
  // y no gira: el rumbo, la inclinación y el campo visual quedan como los dejó el usuario.
  segLen(k) { var a = this.posOf(k), b = this.posOf(k + 1); return Math.hypot(b.x - a.x, b.y - a.y, b.h - a.h) || 1; }
  posAt(s) {
    var n = this.TOUR_COUNT, k = Math.max(0, Math.min(n - 2, Math.floor(s))), f = Math.max(0, Math.min(1, s - k)), a = this.posOf(k), b = this.posOf(k + 1);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, h: a.h + (b.h - a.h) * f, k: k, f: f };
  }
  pathDist(s0, s1) {
    var lo = Math.min(s0, s1), hi = Math.max(s0, s1), d = 0;
    for (var k = Math.floor(lo); k < hi && k < this.TOUR_COUNT - 1; k++) { var a = Math.max(lo, k), b = Math.min(hi, k + 1); if (b > a) d += (b - a) * this.segLen(k); }
    return d;
  }
  texOk(i) { var T = this.tex[i]; return !!(T && T.ready); }
  texBad(i) { var T = this.tex[i]; return !!(T && T.err); }
  segOf(s, dir) { var n = this.TOUR_COUNT; return Math.max(0, Math.min(n - 2, dir >= 0 ? Math.floor(s + 1e-6) : Math.ceil(s - 1e-6) - 1)); }
  setStatus(t, ms) {
    var self = this; clearTimeout(this.stT);
    if ((t || '') !== this.state.status) this.setState({ status: t || '' });
    if (t && ms) this.stT = setTimeout(function () { if (!self.dead) self.setState({ status: '' }); }, ms);
  }

  // Ir a una vista (j entero). auto: recorrido automático. wait: segundos de espera antes de arrancar.
  goTo(j, auto, wait) {
    var n = this.TOUR_COUNT;
    if (!this.state.started || this.introOn || this.jump || this.state.panel) return;
    j = Math.max(0, Math.min(n - 1, j));
    this.pan = null; this.retryTex();
    if (!this.mo) {
      if (j === this.state.cur) return;
      this.mo = { s: this.state.cur, v: 0, target: j, hold: false, wait: wait || 0, last: 0, auto: !!auto, seg: -1 };
    } else {
      this.mo.target = j; this.mo.hold = false; this.mo.last = 0; this.mo.auto = !!auto;
      if (wait) this.mo.wait = wait;
    }
    if (this.hBuf && this.data) this.setHover(null, 0, 0);
    this.setStatus('');
    this.setState({ flying: true, playing: true, pending: null, tip: null, entorno: false });
    this.anim = this.motionFn;
  }
  play(wait) {
    if (this.state.cur >= this.TOUR_COUNT) { this.returnToTour(); return; }
    var n = this.TOUR_COUNT, at = this.mo ? this.mo.s : this.state.cur;
    this.goTo(at >= n - 1 - 1e-6 ? 0 : n - 1, true, wait);
  }
  togglePlay() {
    if (!this.state.started || this.introOn || this.jump || this.state.panel) return;
    var mo = this.mo;
    if (mo && !mo.hold) { mo.hold = true; this.anim = this.motionFn; this.setState({ playing: false }); return; }
    if (mo && mo.hold) { this.retryTex(); mo.hold = false; mo.last = 0; this.anim = this.motionFn; this.setState({ playing: true, flying: true }); return; }
    this.play(0);
  }
  step(d) {
    if (this.state.cur >= this.TOUR_COUNT) { this.returnToTour(); return; }
    var s = this.jump ? this.jump.j : (this.mo ? this.mo.s : this.state.cur);
    this.jumpTo(Math.max(0, Math.min(this.TOUR_COUNT - 1, d > 0 ? Math.floor(s + 1e-6) + 1 : Math.ceil(s - 1e-6) - 1)));
  }

  stepMotion(now) {
    var mo = this.mo; if (!mo) { this.anim = null; return; }
    var dt = mo.last ? Math.min(0.05, Math.max(0, (now - mo.last) / 1000)) : 0; mo.last = now;
    var vmax = this.BASEV * this.SPEEDS[this.state.speed].k, acc = vmax / 1.6;
    if (mo.wait > 0) { mo.wait -= dt; dt = 0; }
    var dir = mo.target > mo.s ? 1 : (mo.target < mo.s ? -1 : 0);
    if (dir === 0) { this.arrive(mo.target); return; }
    var k = this.segOf(mo.s, dir);
    // Espera de fotos: no se entra en un tramo sin las dos fotos listas.
    if (!this.texOk(k) || !this.texOk(k + 1)) {
      if (this.texBad(k) || this.texBad(k + 1)) { this.halt(); return; }
      this.ensureTex(k, null); this.ensureTex(k + 1, null);
      mo.v = 0;
      if (!mo.waitTex) { mo.waitTex = true; this.setStatus('Cargando la próxima vista…'); }
      this.applyMotion(); return;
    }
    if (mo.waitTex) { mo.waitTex = false; this.setStatus(''); }
    var rem = this.pathDist(mo.s, mo.target);
    var want = mo.hold ? 0 : Math.min(vmax, Math.sqrt(2 * acc * rem));
    if (mo.v < want) mo.v = Math.min(want, mo.v + acc * dt);
    else mo.v = Math.max(want, mo.v - (mo.hold ? vmax / 0.9 : acc * 1.5) * dt);
    var m = mo.v * dt, guard = 0;
    while (m > 1e-6 && guard++ < 8) {
      var kk = this.segOf(mo.s, dir);
      if (!this.texOk(kk) || !this.texOk(kk + 1)) break;
      var L = this.segLen(kk), edge = dir > 0 ? Math.min(kk + 1, mo.target) : Math.max(kk, mo.target), room = Math.abs(edge - mo.s) * L;
      if (m < room) { mo.s += dir * m / L; m = 0; } else { mo.s = edge; m -= room; if (edge === mo.target) break; }
    }
    if (!mo.hold && (Math.abs(mo.target - mo.s) < 1e-4 || (rem < 0.03 && mo.v < 0.2))) { mo.s = mo.target; this.arrive(mo.target); return; }
    if (mo.hold && mo.v === 0) this.anim = null;
    this.applyMotion();
  }
  applyMotion() {
    var mo = this.mo, n = this.TOUR_COUNT, p = this.posAt(mo.s);
    this.cam = { x: p.x, y: p.y, h: p.h };
    this.A = p.k; this.B = p.k + 1;
    this.mixAB = this.sstep(0.3, 0.7, p.f);
    this.cloud = this.HAZE * Math.sin(Math.PI * p.f);
    this.prog = mo.s * 1.5;
    if (mo.seg !== p.k) { mo.seg = p.k; this.trimTex(p.k); }
    var ahead = mo.target >= mo.s ? p.k + 2 : p.k - 1;
    if (ahead >= 0 && ahead < n) this.ensureTex(ahead, null);
    var near = Math.round(mo.s); if (near !== this.state.near) this.setState({ near: near });
    this.moveRail(mo.s); this.dirty = true;
  }
  arrive(j) {
    var wasAuto = this.mo && this.mo.auto;
    this.mo = null; this.anim = null;
    this.A = j; this.B = j; this.mixAB = 0; this.cloud = 0;
    var p = this.posOf(j); this.cam = { x: p.x, y: p.y, h: p.h };
    this.setState({ cur: j, near: j, flying: false, playing: false }, function () { this.drawMini(); });
    this.settle(j); this.moveRail(j);
    if (wasAuto && j === this.TOUR_COUNT - 1) this.setStatus('Fin del recorrido. Puede seguir mirando alrededor o volver al punto 1.', 7000);
  }
  halt() {
    var s = this.mo ? this.mo.s : this.state.cur, j = Math.round(s);
    this.arrive(j);
    this.setStatus('No se pudo cargar la vista siguiente. Revise la conexión y vuelva a intentarlo.', 6500);
  }
  // Se conservan sólo las fotos del tramo y las vecinas; la de 8K se libera al dejar su punto.
  trimTex(k) {
    var gl = this.gl;
    for (var key in this.tex) {
      var i = +key, T = this.tex[key];
      if (i < k - 1 || i > k + 2 || (T.hi && i !== k && i !== k + 1)) { gl.deleteTexture(T.t); delete this.tex[key]; }
    }
  }
  moveRail(s) { if (this.railEl) this.railEl.style.transform = 'scaleX(' + Math.max(0, Math.min(1, (s >= this.TOUR_COUNT ? this.returnPoint : s) / (this.TOUR_COUNT - 1))).toFixed(4) + ')'; }

  // Pedido del usuario desde Entorno: la vista gira con suavidad hacia el lugar. Arrastrar la cancela.
  lookAt(x, y, h) {
    var dx = x - this.cam.x, dz = y - this.cam.y, dy = h - this.cam.h;
    var yaw = Math.atan2(dx, dz) * 180 / Math.PI, pitch = Math.max(-45, Math.min(2, Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI - 8));
    var y0 = this.view.yaw, p0 = this.view.pitch, dyw = this.angTo(y0, yaw), t0 = performance.now(), self = this, dur = this.reduced() ? 1 : 1500;
    this.pan = function (now) {
      var t = Math.min(1, (now - t0) / dur), e = self.ease(t);
      self.view.yaw = y0 + dyw * e; self.view.pitch = p0 + (pitch - p0) * e; self.dirty = true;
      if (t >= 1) self.pan = null;
    };
  }

  onKey(e) {
    if (e.defaultPrevented || document.querySelector('.rm-viewer[open]')) return;
    if (!this.state.started || this.state.panel || e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); this.togglePlay(); }
    else if (e.key === 'ArrowRight') this.step(1);
    else if (e.key === 'ArrowLeft') this.step(-1);
    else if (e.key === 'Escape') {
      if (this.state.layersOpen) this.closeLayers();
      else if (this.state.entorno) this.setState({ entorno: false });
      else if (this.state.lot != null) this.selectLot(null);
      else if (this.state.sel) this.selectBlock(this.state.sel);
      else if (this.state.clean) this.setState({ clean: false });
    }
  }
  // Pestaña en segundo plano: el vuelo se detiene y sigue al volver, sin saltos.
  onVis() {
    var mo = this.mo;
    if (document.hidden) {
      if (mo && !mo.hold) { mo.hold = true; mo.v = 0; this.bgPaused = true; this.setState({ playing: false }); }
    } else if (this.bgPaused) {
      this.bgPaused = false;
      if (mo && mo.hold) { mo.hold = false; mo.last = 0; this.anim = this.motionFn; this.setState({ playing: true }); }
    }
  }

  // ---------- Marcas ancladas al terreno (DOM sobre la proyección de la cámara) ----------
  km(m) { return m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km'; }
  returnToTour() { this.jumpTo(this.returnPoint || 0); }
  panorama(j) {
    if (!this.state.started || this.introOn) { this.setStatus('Primero elegí «Explorar a mi ritmo».', 4500); return; }
    this.jumpTo(j);
  }
  buildLabels() {
    var L = this.labEl; if (!L) return;
    var self = this, rl = this.routeLen || {};
    // Al enfocar una marca, el navegador no debe desplazar la capa: las marcas se correrían del terreno.
    if (!this.labScroll) { this.labScroll = true; L.addEventListener('scroll', function () { if (L.scrollTop || L.scrollLeft) { L.scrollTop = 0; L.scrollLeft = 0; } }); }
    L.innerHTML = ''; this.labs = [];
    function add(o, html) {
      var el = document.createElement('div'); el.className = 'hz-a'; el.innerHTML = html; el.style.opacity = '0';
      L.appendChild(el); o.el = el; o.op = -1; self.labs.push(o); return el;
    }
    var zc = this.uv2xy((this.ZONE_RECT.u0 + this.ZONE_RECT.u1) / 2, (this.ZONE_RECT.v0 + this.ZONE_RECT.v1) / 2); this.zc = zc;
    this.ZONE_BLOCKS.forEach(function (b, i) {
      var p = self.uv2xy((b.u0 + b.u1) / 2, (b.v0 + b.v1) / 2), m = i + 1;
      var el = add({ kind: 'mz', m: m, x: p[0], y: p[1], h: 0, pr: 1 },
        '<span class="hz-stem"></span><span class="hz-dot"></span><button type="button" class="hz-mk" aria-label="Ver la manzana ' + m + '"><strong>0' + m + '</strong><span class="hz-lbl">Manzana<br><small data-st></small></span></button>');
      el.querySelector('button').addEventListener('click', function () { self.selectBlock(m); });
    });
    var j40 = this.ROUTES[2].pts[0], j16 = this.ROUTES[3].pts[0];
    [[j40, 'RN', '40', 'Acceso Ruta 40', (rl.a40 ? this.km(rl.a40) + ' desde el loteo' : 'Hacia el loteo'), 'var(--r40)'],
     [j16, 'RP', '16', 'Acceso Ruta 16', 'Av. San Martín' + (rl.a16 ? ' · ' + this.km(rl.a16) : ''), 'var(--r16)']].forEach(function (r) {
      add({ kind: 'rt', x: r[0][0], y: r[0][1], h: r[0][2] || 0, pr: 2 },
        '<span class="hz-stem" style="height:40px"></span><span class="hz-dot"></span><div class="hz-rt" style="--rc:' + r[5] + '"><b>' + r[1] + ' ' + r[2] + '<svg class="hz-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></b><span class="hz-rcopy">' + r[3] + ' · ' + r[4] + '</span></div>');
    });
    add({ kind: 'zone', x: zc[0], y: zc[1], h: 0, pr: 3 }, '<span class="hz-zone">Zona productiva</span>');
    var O = this.OFFICE;
    add({ kind: 'office', x: O.x, y: O.y, h: O.h, pr: 2.5 },
      '<span class="hz-stem" style="height:30px"></span><span class="hz-dot"></span><span class="hz-lead"></span><div class="hz-office"><img class="hz-picos" src="/assets/logos/picos-blanco.png" alt="" aria-hidden="true" width="309" height="169"><span class="hz-otx"><b>' + O.n + '</b><span>' + O.dir + '</span>' + (O.aprox ? '<small>Ubicación aproximada</small>' : '') + '</span></div>');
    this.POIS.forEach(function (p) {
      add({ kind: 'poi', x: p.x, y: p.y, h: p.h, pr: 4 },
        '<span class="hz-stem" style="height:22px"></span><span class="hz-dot" style="transform:rotate(45deg) scale(.7)"></span><span class="hz-lead hz-lw"></span><div class="hz-poi">' + (self.ICONS[p.i] || '') + '<span>' + p.n + '<small>a ' + self.km(Math.hypot(p.x - zc[0], p.y - zc[1])) + ' del loteo</small></span></div>');
    });
    this.SCENES.forEach(function(p,i) {
      if (!p.context) return;
      var camera=self.posOf(i);
      var el=add({kind:'pano',idx:i,x:camera.x,y:camera.y,h:camera.h,pr:1.5},
        '<button type="button" class="hz-pano" aria-label="Explorar '+p.name+'"><span class="hz-pano-icon">360°</span><span><b>'+p.name+'</b><small>Explorar ↗</small></span></button>');
      el.querySelector('button').addEventListener('click',function(){self.panorama(i);});
    });
    var back=add({kind:'pano',idx:-1,x:zc[0],y:zc[1],h:20,pr:1.4},
      '<button type="button" class="hz-pano hz-pano-back" aria-label="Volver al loteo desde el paisaje"><span>↙</span><span><b>Álamos Productivo</b><small>Volver al loteo</small></span></button>');
    back.querySelector('button').addEventListener('click',function(){self.returnToTour();});
    this.labs.sort(function (a, b) { return a.pr - b.pr; });
  }
  placeLabels(B) {
    if (!this.labs || !this.cw) return;
    var st = this.state, W = this.cw, H = this.ch, cam = this.cam, f = B.f, r = B.r, u = B.u, tx = B.tx, ty = B.ty;
    var base = st.started && !st.clean && !st.panel ? (this.introOn ? Math.max(0, 1 - this.cloud * 1.6) : 1) : 0;
    var small = W < 650, top = small ? 70 : 84, placed = [];
    function hit(R) { return placed.some(function (p) { return R[0] < p[0] + p[2] && R[0] + R[2] > p[0] && R[1] < p[1] + p[3] && R[1] + R[3] > p[1]; }); }
    if (W >= 1100) placed.push([W / 2 - 125, 0, 250, 66]);   // reserva de la brújula
    // Etiqueta desplazable (oficina y lugares): el ancla geográfica no se mueve. Si el texto o su hilo pisan otra marca,
    // el texto busca lugar a los costados (y puede bajar hasta 8 px bajo la barra superior) y se une al punto con una guía
    // quebrada: horizontal desde el punto y vertical hasta la etiqueta. Ni el texto ni la guía pueden cruzar otra marca.
    // La caja del título no cuenta para la guía: si el ancla cae dentro del título, la guía se recorta en su borde.
    function pathHits(pts) {
      var TR = self.titleR;
      for (var q = 0; q < pts.length - 1; q++) for (var t2 = 0; t2 <= 1.0001; t2 += 0.08) {
        var px = pts[q][0] + (pts[q + 1][0] - pts[q][0]) * t2, py = pts[q][1] + (pts[q + 1][1] - pts[q][1]) * t2;
        if (placed.some(function (p) { return p !== TR && px > p[0] && px < p[0] + p[2] && py > p[1] && py < p[1] + p[3]; })) return true;
      }
      return false;
    }
    function inTitle(x, y) { var T = self.titleR; return !!T && x > T[0] && x < T[0] + T[2] && y > T[1] && y < T[1] + T[3]; }
    function shiftLabel(lab, sx, sy, want, stemT, sel) {
      if (!lab.box) { lab.box = lab.el.querySelector(sel); lab.lead = lab.el.querySelector('.hz-lead'); lab.stemEl = lab.el.querySelector('.hz-stem'); lab.dotEl = lab.el.querySelector('.hz-dot'); }
      var ow = lab.box.offsetWidth || 180, oh = lab.box.offsetHeight || 40, best = null, inT = inTitle(sx, sy), T = self.titleR;
      if (want > 0.02) {
        var cands = [[0, -stemT]];
        for (var dxs = 40; dxs <= 560; dxs += 40) { cands.push([dxs, -stemT - 8]); cands.push([-dxs - ow, -stemT - 8]); }
        for (var ci = 0; ci < cands.length && !best; ci++) {
          var c = cands[ci], oyv = Math.max(c[1], top + 8 + oh - sy), RR = [sx + c[0], sy + oyv - oh, ow, oh];
          if (RR[0] < 8 || RR[0] + ow > W - 8 || RR[1] + oh > H - 160 || hit(RR)) continue;
          var moved = ci > 0 || oyv !== c[1], lx = c[0] >= 0 ? sx + c[0] + 6 : sx + c[0] + ow - 6, yb = RR[1] + oh;
          // Ancla dentro del título: la guía sale desde el borde del título; el tramo vertical tiene que quedar fuera.
          if (inT && (!moved || (lx > T[0] && lx < T[0] + T[2]))) continue;
          var x0 = inT ? (lx > sx ? T[0] + T[2] : T[0]) : sx;
          if (pathHits(moved ? [[x0, sy], [lx, sy], [lx, yb]] : [[sx, sy], [sx, sy - stemT]])) continue;
          best = { c: [c[0], oyv], moved: moved, x0: x0 - sx, dx: lx - sx, dy: yb - sy, R: RR };
        }
      }
      var b = best || { c: [0, -stemT], moved: false, x0: 0, dx: 0, dy: 0 };
      lab.box.style.transform = 'translate(' + b.c[0] + 'px,' + (b.c[1] - oh) + 'px)';
      if (lab.stemEl) lab.stemEl.style.opacity = b.moved ? '0' : '1';
      if (lab.dotEl) lab.dotEl.style.opacity = inT ? '0' : '1';
      if (lab.lead) {
        var L = lab.lead.style;
        if (best && b.moved) {
          L.left = Math.min(b.x0, b.dx) + 'px'; L.top = Math.min(0, b.dy) + 'px'; L.width = Math.abs(b.dx - b.x0) + 'px'; L.height = Math.abs(b.dy) + 'px';
          L.borderTopWidth = b.dy > 0 ? '1px' : '0'; L.borderBottomWidth = b.dy > 0 ? '0' : '1px';
          L.borderLeftWidth = b.dx < b.x0 ? '1px' : '0'; L.borderRightWidth = b.dx < b.x0 ? '0' : '1px';
          L.opacity = '1';
        } else L.opacity = '0';
      }
      return best ? best.R : null;
    }
    // Primero manzanas y accesos; después el título, que se corre hacia arriba si los pisa; al final zona y lugares.
    var self = this;
    function one(lab) {
      var want = base, edge = false, flip = false, sx = 0, sy = 0;
      if (lab.kind === 'rt') want *= st.acc ? 1 : 0; else want *= st.signs ? 1 : 0;
      if (lab.kind === 'poi' && small) want = 0;
      if (lab.kind === 'pano' && (lab.idx === st.cur || self.jump || (lab.idx === -1 && st.cur < self.TOUR_COUNT))) want = 0;
      if (st.cur >= self.TOUR_COUNT && (lab.kind === 'mz' || lab.kind === 'zone')) want=0;
      var wx = lab.x - cam.x, wy = lab.h - cam.h, wz = lab.y - cam.y;
      var c0 = wx * r[0] + wy * r[1] + wz * r[2], c1 = wx * u[0] + wy * u[1] + wz * u[2], c2 = wx * f[0] + wy * f[1] + wz * f[2];
      if (c2 > 2) { sx = (c0 / c2 / tx + 1) * 0.5 * W; sy = (1 - c1 / c2 / ty) * 0.5 * H; }
      var inView = c2 > 2 && sx > -10 && sx < W + 10 && sy > top && sy < H + 10;
      // Acceso con su ancho real: si no entra a la derecha se apoya a la izquierda del hilo; si tampoco, indicador lateral.
      var rw = 0;
      if (lab.kind === 'rt') {
        if (!lab.rtEl) lab.rtEl = lab.el.querySelector('.hz-rt');
        rw = lab.rtEl ? lab.rtEl.offsetWidth : 200;
        if (inView && sx + rw + 14 > W) { if (sx - rw - 14 >= 0) flip = true; else inView = false; }
      }
      if (want > 0 && inView) {
        // Esfumado al acercarse al borde de la pantalla.
        var e = Math.min(sx, W - sx, sy - top, H - sy);
        if (lab.kind === 'rt') e = Math.min(sy - top, H - sy, flip ? sx - rw : W - sx - rw) + 70;
        want *= Math.max(0, Math.min(1, e / 70));
      } else if (want > 0 && lab.kind === 'rt') {
        // Acceso fuera de cuadro: indicador lateral que apunta hacia él.
        var ang = Math.atan2(c1, c0), cx = Math.cos(ang), cy = -Math.sin(ang), mx = 28, myT = top + 40, myB = small ? 200 : 190;
        if (c2 > 2 && sx > W - 10) { cx = 1; cy = 0; }
        var kx = Math.abs(cx) > 1e-3 ? ((cx > 0 ? W - mx - 72 : mx + 20) - W / 2) / cx : 1e9;
        var ky = Math.abs(cy) > 1e-3 ? ((cy > 0 ? H - myB : myT) - H / 2) / cy : 1e9;
        var kk = Math.min(Math.abs(kx), Math.abs(ky));
        sx = W / 2 + cx * kk; sy = H / 2 + cy * kk; edge = true; flip = false;
        lab.arrowDeg = Math.atan2(cy, cx) * 180 / Math.PI;
      } else want = 0;
      var R = null;
      if (lab.kind === 'mz') { if (!lab.btn) lab.btn = lab.el.querySelector('button'); var bw = lab.btn ? lab.btn.offsetWidth : 110; R = [sx - 40, sy - 68, bw + 4, 48]; }
      else if (lab.kind === 'rt') R = edge ? [sx - 4, sy - 40, 84, 30] : (flip ? [sx - rw - 4, sy - 86, rw + 8, 48] : [sx - 4, sy - 86, rw + 8, 48]);
      else if (lab.kind === 'pano') { R = [sx - 88, sy - (lab.idx === -1 ? 98 : 28), 176, 56]; if (hit(R) || sx < 96 || sx > W-96 || sy > H-170 || (R[0]<300 && R[1]<240)) want=0; }
      else if (lab.kind === 'zone') R = [sx - 70, sy - 9, 140, 18];
      else if (lab.kind === 'office') R = [sx - 8, sy - 92, small ? 170 : 230, 62];
      else R = [sx - 10, sy - 52, 180, 36];
      // Oficina: el ancla geográfica no se mueve; si el texto pisa el título, la brújula u otra marca, se corre
      // hacia un costado con una línea guía discreta. Si no entra en ningún lado, se esfuma (el título se conserva).
      if (lab.kind === 'office' || (lab.kind === 'poi' && !small)) {
        var RS = shiftLabel(lab, sx, sy, want, lab.kind === 'office' ? 30 : 22, lab.kind === 'office' ? '.hz-office' : '.hz-poi');
        if (RS) R = RS; else want = 0;
      }
      if (want > 0.02 && (lab.kind === 'zone' || (lab.kind === 'rt' && st.cur >= self.TOUR_COUNT)) && hit(R)) want = 0;
      if (want > 0.02) placed.push(R);
      var el = lab.el;
      el.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0)';
      if (edge !== !!lab.edge) { lab.edge = edge; el.classList.toggle('hz-edge', edge); }
      if (flip !== !!lab.flip) { lab.flip = flip; el.classList.toggle('hz-flip', flip); }
      if (edge) { var ar = el.querySelector('.hz-arrow'); if (ar) ar.style.transform = 'rotate(' + lab.arrowDeg.toFixed(0) + 'deg)'; }
      if (lab.kind === 'mz') { var on = st.sel === lab.m || (st.lot != null && self.data && self.data.lots[st.lot].m === lab.m); if (on !== !!lab.sel) { lab.sel = on; el.classList.toggle('hz-sel', on); el.querySelector('button').setAttribute('aria-pressed', on ? 'true' : 'false'); } }
      var op = want > 0.02 ? Math.round(want * 50) / 50 : 0;
      if (op !== lab.op) { lab.op = op; el.style.opacity = String(op); el.classList.toggle('hz-vis', op > 0); }
    }
    this.labs.forEach(function (lab) { if (lab.pr <= 2) one(lab); });
    this.placeWorld(B, W, H, placed);
    this.labs.forEach(function (lab) { if (lab.pr > 2) one(lab); });
  }
  // Título del proyecto: altura fija en la franja superior, independiente del zoom.
  // Sigue horizontalmente la dirección del borde norte de la zona productiva al mirar alrededor (con un campo visual
  // de referencia fijo, así acercar o alejar no lo mueve) y toma una inclinación suave de ese mismo ángulo.
  // Si no cabe o pisa un marcador se esfuma; nunca salta de altura.
  placeWorld(B, W, H, placed) {
    var el = this.worldEl; if (!el) return;
    var st = this.state, Z = this.ZONE_RECT, a = this.uv2xy(Z.u1, 0), h = 40, cam = this.cam, f = B.f, r = B.r, u = B.u;
    var wx = a[0] - cam.x, wy = h - cam.h, wz = a[1] - cam.y;
    var c0 = wx * r[0] + wy * r[1] + wz * r[2], c1 = wx * u[0] + wy * u[1] + wz * u[2], c2 = wx * f[0] + wy * f[1] + wz * f[2];
    var want = st.started && !st.clean && !st.panel ? (this.introOn ? Math.max(0, 1 - this.cloud * 1.6) : 1) : 0;
    if (W < 700 && (st.lot != null || st.sel)) want = 0;
    if (st.cur >= this.TOUR_COUNT || (this.jump && this.jump.j >= this.TOUR_COUNT)) want = 0;
    var bw = el.offsetWidth || 470, bh = el.offsetHeight || 150;
    var topBand = W < 700 ? 64 : 84;
    var sy = topBand + 18 + bh;                                   // borde inferior del título: fijo
    var az = Math.atan2(c0, c2);                                  // ángulo horizontal real hacia el anclaje
    var refHalf = Math.atan(Math.tan(35 * Math.PI / 180) * W / Math.max(1, H)); // campo visual de referencia fijo (70° vertical)
    var sx = W / 2 + (W / 2) * Math.tan(Math.max(-1.45, Math.min(1.45, az))) / Math.tan(refHalf);
    if (Math.abs(az) > refHalf + 0.35) want = 0;
    var half = bw / 2, e = Math.min(sx - half + 120, W - sx - half + 120);
    want *= Math.max(0, Math.min(1, e / 120));
    if (sy > H - 200) want = 0;                                   // pantalla demasiado baja: se oculta, no baja
    var R = [sx - half, sy - bh, bw, bh];
    if (want > 0.02 && placed.some(function (p) { return R[0] < p[0] + p[2] && R[0] + R[2] > p[0] && R[1] < p[1] + p[3] && R[1] + R[3] > p[1]; })) want = 0;
    var ex = Math.atan2(c1, Math.hypot(c0, c2)) * 180 / Math.PI;
    var ry = Math.max(-22, Math.min(22, -az * 180 / Math.PI * 0.6)), rx = Math.max(-7, Math.min(7, ex * 0.12));
    el.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0) translate(-50%,-100%) perspective(900px) rotateY(' + ry.toFixed(2) + 'deg) rotateX(' + rx.toFixed(2) + 'deg)';
    var op = want > 0.02 ? Math.round(want * 50) / 50 : 0;
    if (op !== this.worldOp) { this.worldOp = op; el.style.opacity = String(op); el.classList.toggle('hz-vis', op > 0); }
    this.titleR = op > 0 ? R : null;
    if (op > 0) placed.push(R);
  }
  buildTape() {
    var T = this.tapeEl; if (!T) return;
    var names = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'], h = '';
    for (var d = -360; d <= 720; d += 45) { var nm = names[((d / 45) % 8 + 8) % 8]; h += '<span class="' + (nm === 'N' ? 'n' : '') + '" style="left:' + ((d + 360) * 2) + 'px">' + nm + '</span>'; }
    T.innerHTML = h;
  }
  updateCompass() {
    if (!this.tapeEl) return;
    var y = ((this.view.yaw % 360) + 360) % 360, x = Math.round((120 - (y + 360) * 2) * 10) / 10;
    if (x !== this.tapeX) { this.tapeX = x; this.tapeEl.style.transform = 'translateX(' + x + 'px)'; }
  }
  buildEntorno() {
    var E = this.entEl; if (!E || !this.zc) return;
    var self = this; E.innerHTML = '';
    this.SCENES.forEach(function(p,i){
      if (!p.context) return;
      var b=document.createElement('button'); b.type='button'; b.className='hz-context-choice';
      b.setAttribute('aria-label','Explorar '+p.name);
      b.innerHTML='<span class="hz-pano-icon">360°</span><span>'+p.name+'<br><small style="margin:0">Vista aérea · '+self.km(Math.hypot(p.x-self.zc[0],p.y-self.zc[1]))+' del loteo</small></span><small>↗</small>';
      b.addEventListener('click',function(){self.panorama(i);}); E.appendChild(b);
    });
    var O = this.OFFICE, ob = document.createElement('button'); ob.type = 'button';
    ob.innerHTML = (self.ICONS.pueblo || '') + '<span>' + O.n + '<br><small style="margin:0">' + O.dir + (O.aprox ? ' · ubicación aproximada' : '') + '</small></span><small>' + self.km(Math.hypot(O.x - self.zc[0], O.y - self.zc[1])) + '</small>';
    ob.addEventListener('click', function () { self.setState({ entorno: false }); if (self.state.started) self.lookAt(O.x, O.y, O.h); });
    E.appendChild(ob);
    this.POIS.forEach(function (p) {
      var b = document.createElement('button'); b.type = 'button';
      b.innerHTML = (self.ICONS[p.i] || '') + '<span>' + p.n + '</span><small>' + self.km(Math.hypot(p.x - self.zc[0], p.y - self.zc[1])) + '</small>';
      b.addEventListener('click', function () { self.setState({ entorno: false }); if (self.state.started) self.lookAt(p.x, p.y, p.h); });
      E.appendChild(b);
    });
  }
  // Datos reales de cada manzana, leídos del plano (sin precios ni disponibilidad).
  buildBlockInfo() {
    var info = {}, d = this.data; if (!d || !d.lots) return;
    d.lots.forEach(function (l) {
      var b = info[l.m] || (info[l.m] = { n: 0, amin: Infinity, amax: 0, e: {} });
      b.n++; b.amin = Math.min(b.amin, l.a); b.amax = Math.max(b.amax, l.a); b.e[l.e] = 1;
    });
    this.blockInfo = info;
    (this.labs || []).forEach(function (lab) {
      if (lab.kind !== 'mz' || !info[lab.m]) return;
      var t = lab.el.querySelector('[data-st]'); if (t) t.textContent = 'Etapa ' + Object.keys(info[lab.m].e).join(' y ');
    });
    this.setState({ dataOk: true });
  }
  selectBlock(m) {
    var sel = this.state.sel === m ? null : m;
    this.selM = sel; if (sel) this.selLot = null;
    this.setState(sel ? { sel: sel, lot: null, entorno: false, layersOpen: false, helpDone: true } : { sel: null });
    this.refreshSel();
  }
  // ---------- Traslado rápido al tocar un punto (1 a 2,5 s según la distancia, independiente de la velocidad del play) ----------
  // Va en línea recta desde donde está la cámara hasta la foto elegida, fundiendo la foto de origen con la de destino.
  jumpTo(j) {
    var n = this.SCENES.length;
    if (!this.state.started || this.introOn || this.state.panel) return;
    j = Math.max(0, Math.min(n - 1, j));
    var mo = this.mo, J = this.jump;
    if (!mo && !J && j === this.state.cur) return;
    if (J && J.j === j) return;
    // Foto de origen: la que domina en pantalla en este momento.
    var src = (mo || J) ? (this.mixAB < 0.5 ? this.A : this.B) : this.state.cur;
    var s0 = J ? (J.s0 + (J.j - J.s0) * (J.e || 0)) : (mo ? mo.s : this.state.cur);
    if (src < this.TOUR_COUNT && j >= this.TOUR_COUNT) {
      this.returnPoint = src; this.returnView = Object.assign({},this.view);
    }
    var contextFlight = src >= this.TOUR_COUNT || j >= this.TOUR_COUNT;
    var targetView = null;
    if (contextFlight) {
      var dest=this.posOf(j), cx=this.zc[0]-dest.x, cy=this.zc[1]-dest.y;
      targetView = j < this.TOUR_COUNT && j === this.returnPoint && this.returnView ? this.returnView :
        {yaw:Math.atan2(cx,cy)*180/Math.PI,pitch:-Math.atan2(dest.h,Math.hypot(cx,cy))*180/Math.PI+7,fov:70};
    }
    this.mo = null; this.pan = null; this.retryTex();
    this.jump = { j: j, src: src, s0: s0, from: { x: this.cam.x, y: this.cam.y, h: this.cam.h }, t0: 0, e: 0 };
    this.jump.startView = Object.assign({},this.view); this.jump.endView = targetView;
    if (this.hBuf && this.data) this.setHover(null, 0, 0);
    this.setStatus('');
    this.setState({ flying: true, playing: false, lot: null, sel: null, helpDone: true, tip: null, entorno: false, near: j });
    var self = this;
    this.anim = function (now) { self.stepJump(now); };
  }
  stepJump(now) {
    var J = this.jump; if (!J) { this.anim = null; return; }
    if (!this.texOk(J.j)) {
      if (this.texBad(J.j)) { this.jump = null; this.arrive(Math.round(J.s0)); this.setStatus('No se pudo cargar esa vista. Revise la conexión y vuelva a intentarlo.', 6500); return; }
      this.ensureTex(J.j, null);
      if (!J.wt) { J.wt = true; this.setStatus('Cargando ' + this.SCENES[J.j].name + '…'); }
      return;
    }
    if (J.wt) { J.wt = false; this.setStatus(''); }
    if (!J.t0) {
      var to = this.posOf(J.j), d = Math.hypot(to.x - J.from.x, to.y - J.from.y, to.h - J.from.h);
      J.to = to; J.dur = this.reduced() ? 250 : 1000 + 1500 * Math.min(1, d / 330); J.t0 = now;
      if (!this.texOk(J.src)) J.src = J.j;
      this.A = J.src; this.B = J.j;
    }
    var t = Math.min(1, (now - J.t0) / J.dur), e = this.ease(t), f = J.from, to2 = J.to;
    J.e = e;
    if (J.endView) {
      this.view = {yaw:J.startView.yaw+this.angTo(J.startView.yaw,J.endView.yaw)*e,
        pitch:J.startView.pitch+(J.endView.pitch-J.startView.pitch)*e,
        fov:J.startView.fov+(J.endView.fov-J.startView.fov)*e};
    }
    this.cam = { x: f.x + (to2.x - f.x) * e, y: f.y + (to2.y - f.y) * e, h: f.h + (to2.h - f.h) * e };
    this.mixAB = J.src === J.j ? 0 : this.sstep(0.25, 0.75, e);
    this.cloud = (J.endView ? 0.55 : this.HAZE * 1.5) * Math.sin(Math.PI * e);
    this.prog = (J.s0 + (J.j - J.s0) * e) * 1.5;
    this.moveRail(J.s0 + (J.j - J.s0) * e);
    this.dirty = true;
    if (t >= 1) { this.jump = null; this.arrive(J.j); }
  }

  // ---------- Lotes reales: puntero y toque en las cinco vistas, también en pausa y en vuelo ----------
  canPick() {
    var st = this.state;
    return !!(st.started && !this.introOn && !this.jump && !st.panel && !st.clean && this.hBuf && this.data);
  }
  // Tocar un lote abre su ficha; si el vuelo estaba en marcha, se detiene para inspeccionar.
  pickLot(x, y) {
    var idx = this.lotAt(x, y);
    if (idx == null) { if (this.state.lot != null) this.selectLot(null); return; }
    var mo = this.mo;
    if (mo && !mo.hold) { mo.hold = true; this.anim = this.motionFn; this.setState({ playing: false }); }
    this.selectLot(idx);
  }
  selectLot(idx) {
    this.selLot = idx;
    if (idx != null) { this.selM = null; this.setState({ lot: idx, lotCardHidden: false, lotMedia: 'sector', locatorOpen: true, sel: null, entorno: false, layersOpen: false, helpDone: true }); }
    else this.setState({ lot: null, locatorOpen: false });
    this.drawLocator();
    this.hlKey = null;
    if (this.hBuf && this.data) this.setHover(null, 0, 0);
  }
  drawLocator() {
    var svg = this.locatorEl, data = this.data; if (!svg || !data || !this.box) return;
    var b = this.box, scale = Math.min(260 / (b.Mx - b.mx), 160 / (b.My - b.my));
    var ox = (280 - (b.Mx - b.mx) * scale) / 2, oy = (180 - (b.My - b.my) * scale) / 2;
    if (this.locatorData !== data || !svg.children.length) {
      svg.replaceChildren();
      data.lots.forEach(function (lot, idx) {
        var polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', lot.p.map(function(p) { return (ox + (p[0] - b.mx) * scale).toFixed(2) + ',' + (oy + (b.My - p[1]) * scale).toFixed(2); }).join(' '));
        polygon.dataset.lot = String(idx); svg.appendChild(polygon);
      }); this.locatorData = data;
    }
    var selected = this.state.lot;
    Array.from(svg.children).forEach(function(p) { p.classList.toggle('selected', selected != null && Number(p.dataset.lot) === selected); });
  }

  // Datos comerciales de un lote: sólo de LOT_SOURCE. Sin fuente, «Sin información». Nunca se deducen de la etapa.
  lotInfo(l) {
    var src = this.LOT_SOURCE && this.LOT_SOURCE[l.m + '-' + l.n] || null;
    function v(k) { return src && src[k] != null && src[k] !== '' ? String(src[k]) : null; }
    var est = src && (src.estado === 'disponible' || src.estado === 'no_disponible') ? src.estado : 'sin';
    return { estado: est, precio: v('precio'), tipo: v('tipo'), fos: v('fos'), frente: v('frente'), financiacion: v('financiacion') };
  }
  get LOT_EMPTY() { return { areaNum: '', stageNum: '', rows: [], missing: '', missCls: 'hz-hide', kicker: '', title: '', area: '', stage: '', stageCol: '#ffffff', estado: '', estCls: '', precio: '', tipo: '', fos: '', frente: '', fin: '', precioCls: '', tipoCls: '', fosCls: '', frenteCls: '', finCls: '', zCls: 'hz-hide' }; }
  lotVals(idx) {
    var l = this.data.lots[idx]; if (!l) return null;
    var I = this.lotInfo(l), NA = 'Sin información', present = [], miss = [];
    [['Precio', I.precio], ['Tipo', I.tipo], ['FOS', I.fos], ['Frente', I.frente], ['Financiación', I.financiacion]].forEach(function (p) { if (p[1] == null) miss.push(p[0]); else present.push({ k: p[0], v: p[1] }); });
    function f(x) { return x == null ? NA : x; }
    function c(x) { return x == null ? 'hz-na' : ''; }
    return {
      kicker: 'Manzana ' + (l.m < 10 ? '0' : '') + l.m, title: 'Lote ' + l.n,
      area: l.a.toLocaleString('es-AR') + ' m²', stage: 'Etapa ' + l.e, stageCol: ['#ffffff', '#ffc761', '#73f2c2', '#8cbfff'][l.e] || '#ffffff',
      estado: I.estado === 'disponible' ? 'Disponible' : (I.estado === 'no_disponible' ? 'No disponible' : NA),
      estCls: 'hz-st-' + I.estado,
      precio: f(I.precio), tipo: f(I.tipo), fos: f(I.fos), frente: f(I.frente), fin: f(I.financiacion),
      precioCls: c(I.precio), tipoCls: c(I.tipo), fosCls: c(I.fos), frenteCls: c(I.frente), finCls: c(I.financiacion),
      // Con la recreación activa, aclarar que el lote es real y el galpón que se ve encima es ilustrativo.
      zCls: this.state.zone && this.inZone(l.c[0], l.c[1]) ? '' : 'hz-hide',
      areaNum: l.a.toLocaleString('es-AR'), stageNum: (l.e < 10 ? '0' : '') + l.e,
      rows: present, missing: miss.join(', '), missCls: miss.length ? '' : 'hz-hide'
    };
  }
  legendVals() {
    var k = { disponible: 0, no_disponible: 0, sin: 0 }, self = this;
    if (this.data && this.data.lots) this.data.lots.forEach(function (l) { k[self.lotInfo(l).estado]++; });
    return { disp: String(k.disponible), nodisp: String(k.no_disponible), sin: String(k.sin) };
  }

  refreshSel() { if (this.hBuf && this.data) { this.hlKey = null; this.setHover(null, 0, 0); } }

  closeLayers() {
    this.setState({ layersOpen: false }, function () {
      var button = this.root && this.root.querySelector('.hz-layer-toggle');
      if (button) button.focus({ preventScroll: true });
    });
  }

  // Encuadre fijo hacia la zona productiva, sin interfaz ni plano (para imágenes guía).
  aimZone() {
    var ZR = this.ZONE_RECT, c = this.uv2xy((ZR.u0 + ZR.u1) / 2, (ZR.v0 + ZR.v1) / 2);
    var dx = c[0] - this.cam.x, dz = c[1] - this.cam.y, dy = (this.zoneGround || 0) - this.cam.h;
    this.view.yaw = Math.atan2(dx, dz) * 180 / Math.PI;
    this.view.pitch = Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI;
    this.view.fov = this.AIMFOV[this.state.cur] || 58;
    if (this.hBuf) this.setHover(null, 0, 0);
    this.setState({ clean: 'render', panel: false });
    this.req();
  }

  pickCal(x, y) {
    if (this.state.pending == null) { this.setState({ hint: 'Primero toque una esquina en el plano chico; después, el mismo lugar en la foto.' }); return; }
    var B = this.basis(), sx = 2 * x / this.cw - 1, sy = 1 - 2 * y / this.ch;
    var d = [B.f[0] + B.r[0] * sx * B.tx + B.u[0] * sy * B.ty, B.f[1] + B.r[1] * sx * B.tx + B.u[1] * sy * B.ty, B.f[2] + B.r[2] * sx * B.tx + B.u[2] * sy * B.ty];
    var n = Math.hypot(d[0], d[1], d[2]); d = [d[0] / n, d[1] / n, d[2] / n];
    var c = this.calOf(this.state.cur), p = this.mv(this.matOf(c), d), v = this.verts[this.state.pending];
    var pairs = c.pairs.concat([{ v: [v[0], v[1], v[2]], p: [+p[0].toFixed(6), +p[1].toFixed(6), +p[2].toFixed(6)] }]);
    this.setState({ pending: null });
    this.setPairs(pairs, pairs.length < 2 ? 'Bien. Ahora elija otra esquina, lejos de la primera.' : null);
  }

  componentDidUpdate() {
    if (!this.anim && !this.mo && !this.jump && this.state.started) { var p = this.posOf(this.state.cur); this.cam = { x: p.x, y: p.y, h: p.h }; }
    if (!this.state.started && !this.anim) this.cloud = 1;
    this.req(); this.drawMini(); this.drawLocator();
  }

  renderVals() {
    var self = this, st = this.state, n = this.TOUR_COUNT;
    var cal = this.calOf(st.cur), curName = this.SCENES[st.cur].name, mo = this.mo;
    function num(e) { return parseFloat(e.target.value); }
    function fx(v, u) { return (v > 0 ? '+' : '') + Number(v).toFixed(1).replace('.', ',') + u; }
    var np = cal.pairs.length, localRows = [];
    this.SCENES.forEach(function (s, i) {
      if (!st.cals[s.id]) return;
      var c = self.calOf(i);
      var same = Math.abs(c.heading - s.heading) < 0.01 && Math.abs(c.agl - s.agl) < 0.05 && Math.abs(c.dx - (s.dx || 0)) < 0.01 &&
        Math.abs(c.dy - (s.dy || 0)) < 0.01 && Math.abs(c.tilt - (s.tilt || 0)) < 0.002 && Math.abs(c.roll - (s.roll || 0)) < 0.002;
      if (same) return;
      localRows.push({ txt: s.id + '  h ' + (+c.heading).toFixed(2) + '  a ' + (+c.agl).toFixed(1) + '  x ' + (+c.dx).toFixed(2) + '  y ' + (+c.dy).toFixed(2) + '  t ' + (+c.tilt).toFixed(3) + '  r ' + (+c.roll).toFixed(3) });
    });
    var near = mo ? st.near : st.cur;
    var chips = this.SCENES.slice(0, n).map(function (s, i) {
      return { n: (i < 9 ? '0' : '') + (i + 1), label: 'Ir a la vista ' + (i + 1) + ' de ' + n, current: i === near ? 'step' : 'false', go: function () { self.jumpTo(i); } };
    });
    var atEnd = !mo && st.cur >= n - 1, sp = this.SPEEDS[st.speed];
    function p2(x) { return (x < 10 ? '0' : '') + x; }
    var tot = ' / ' + p2(n);
    var viewTxt = !st.started ? n + ' vistas de dron'
      : this.jump ? 'Hacia la vista ' + p2(this.jump.j + 1) + tot
      : (mo ? (st.playing ? 'En vuelo · ' + p2(near + 1) + tot : 'En pausa · ' + p2(near + 1) + tot) : 'Vista ' + p2(st.cur + 1) + tot);
    if (this.jump && this.jump.j >= n) viewTxt = 'Hacia ' + this.SCENES[this.jump.j].name;
    else if (!this.jump && st.cur >= n) viewTxt = curName + ' · 360°';
    var B = st.sel && this.blockInfo ? this.blockInfo[st.sel] : null;
    var lotV = st.lot != null && this.data ? this.lotVals(st.lot) : null;
    var sel = B ? {
      title: 'Manzana ' + (st.sel < 10 ? '0' : '') + st.sel, lots: String(B.n), stage: Object.keys(B.e).map(function (x) { return (x < 10 ? '0' : '') + x; }).join(' y '),
      area: B.amin === B.amax ? B.amin.toLocaleString('es-AR') + ' m²' : B.amin.toLocaleString('es-AR') + ' a ' + B.amax.toLocaleString('es-AR') + ' m²'
    } : { title: '', lots: '', stage: '', area: '' };
    sel.lotItems = B && this.data ? this.data.lots.map(function(l,i){return {l:l,i:i};}).filter(function(x){return String(x.l.m)===String(st.sel);}).sort(function(a,b){return a.l.n-b.l.n;}).map(function(x){return {name:'Lote '+x.l.n,go:function(){self.selectLot(x.i);}};}) : [];
    return {
      setRoot: this.setRoot, setGl: this.setGl, setOv: this.setOv, setMm: this.setMm,
      setLabels: this.setLabels, setWorld: this.setWorld, setLocator: this.setLocator,
      skyCredit: !!this.gl && st.skyOn, skyTest: !!this.gl, skyPressed: st.skyOn ? 'true' : 'false', skyTxt: st.skyOn ? 'Cielo: hora azul. Cambiar a original' : 'Cielo: original. Cambiar a hora azul',
      skyShort: st.skyOn ? 'Hora azul' : 'Original',
      toggleSky: function () { self.setState({ skyOn: !self.state.skyOn }); self.req(); }, setTape: this.setTape, setRail: this.setRail, setEntList: this.setEntList,
      rootCls: (st.clean ? (st.clean === 'render' ? 'f-clean f-render' : 'f-clean') : '') + (st.started ? ' hz-started' : '') + (this.sunsetEntry && !st.entryFailed ? ' hz-sunset-entry' : ''),
      sunsetEntry: this.sunsetEntry && !st.entryFailed,
      entryError: function () { self.setState({ entryFailed: true }); },
      startPrimaryLabel: this.sunsetEntry && !st.entryFailed ? 'Entrar al recorrido' : 'Iniciar recorrido',
      startSecondaryLabel: this.sunsetEntry && !st.entryFailed ? 'Recorrido automático' : 'Explorar a mi ritmo',
      startPrimary: function () { self.intro(!(self.sunsetEntry && !self.state.entryFailed)); },
      startSecondary: function () { self.intro(!!(self.sunsetEntry && !self.state.entryFailed)); },
      titleCls: st.loading ? 'hz-off' : '',
      viewTxt: viewTxt,
      contextCls: st.cur >= n ? '' : 'hz-hide', returnToTour: function(){self.returnToTour();},
      loading: st.loading, loadTxt: st.loadTxt,
      showStart: !st.loading && !st.started,
      showUi: st.started && !st.loading,
      startAuto: function () { self.intro(true); },
      startFree: function () { self.intro(false); },
      // Entorno
      entOpen: st.entorno ? 'true' : 'false', entCls: st.entorno ? '' : 'hz-off',
      toggleEnt: function () { var open = !self.state.entorno; if (open && self.state.sel) self.selectBlock(self.state.sel); self.setState({ entorno: open, layersOpen: false }); },
      // Ficha de manzana
      selCls: B ? '' : 'hz-off', sel: sel,
      lotCls: lotV && !st.lotCardHidden ? '' : 'hz-off', lot: lotV || this.LOT_EMPTY,
      locatorCls: lotV && st.locatorOpen && !st.clean ? '' : 'hz-hide',
      closeLocator: function(){self.setState({locatorOpen:false,lotCardHidden:false});},
      locateLot: function(){self.setState({locatorOpen:true,lotCardHidden:true},()=>self.locatorEl?.closest('.hz-locator')?.focus({preventScroll:true}));self.setStatus('Lote resaltado en el plano.');},
      mediaEmptyCls: st.lotMedia === 'sector' ? 'hz-hide' : '',
      mediaHeading: st.lotMedia === '360' ? 'Vista 360° del lote' : 'Fotos del lote',
      mediaMessage: st.lotMedia === '360' ? 'Captura del lote pendiente de cargar.' : 'Fotos del lote pendientes de cargar.',
      mediaSectorPressed: String(st.lotMedia === 'sector'), media360Pressed: String(st.lotMedia === '360'), mediaPhotosPressed: String(st.lotMedia === 'fotos'),
      mediaSector: function(){self.setState({lotMedia:'sector'});}, media360: function(){self.openOwnMedia('panorama');}, mediaPhotos: function(){self.openOwnMedia('foto');},
      openProjectMedia: function(){self.openOwnMedia(null,true);},
      closeLot: function () { self.selectLot(null); },
      legendCls: st.started && !st.loading ? '' : 'hz-off', legend: this.legendVals(),
      closeSel: function () { if (self.state.sel) self.selectBlock(self.state.sel); },
      // Capas
      layersCls: st.layersOpen ? '' : 'hz-off', layersOpen: st.layersOpen ? 'true' : 'false',
      toggleLayers: function (event) {
        if (self.state.layersOpen) { self.closeLayers(); return; }
        self.setState({ layersOpen: true, entorno: false, helpDone: true }, function () {
          if (event && event.detail === 0) {
            var first = self.root && self.root.querySelector('.hz-layers .hz-layer');
            if (first) first.focus({ preventScroll: true });
          }
        });
      },
      closeLayers: function () { self.closeLayers(); },
      showHelp: st.started && !st.flying && !st.helpDone && st.lot == null && !st.sel && !st.layersOpen && !st.zone,
      dismissHelp: function () { self.setState({ helpDone: true }); },
      signsPressed: st.signs ? 'true' : 'false', accPressed: st.acc ? 'true' : 'false',
      toggleAcc: function () { self.setState({ acc: !self.state.acc }); self.req(); },
      toggleSigns: function () { self.setState({ signs: !self.state.signs }); self.req(); },
      zonePressed: st.zone ? 'true' : 'false', zoneBusy: st.zoneBusy,
      zoneLbl: st.zoneBusy ? (st.zone ? 'Construyendo la zona productiva…' : 'Quitando la zona productiva…') : (st.zone ? 'Quitar la zona productiva' : 'Ver la zona productiva (recreación)'),
      toggleZone: function () { self.toggleZone(); },
      zoneNote: st.zone && !st.zoneBusy && st.started && !st.clean,
      goClean: function () { self.setState({ clean: true, entorno: false, layersOpen: false, helpDone: true }); self.req(); },
      exitClean: function () { self.setState({ clean: false }); self.req(); },
      // Vuelo
      playing: st.playing,
      playLbl: st.cur >= n ? 'Volver al loteo' : st.playing ? 'Pausar el vuelo' : (mo ? 'Seguir el vuelo' : (atEnd ? 'Volver al punto 1' : 'Reproducir el recorrido')),
      iconPlay: !st.playing && !atEnd, iconBack: !st.playing && atEnd,
      togglePlay: function () { self.togglePlay(); },
      chips: chips,
      speedTxt: sp.t, speedLbl: 'Velocidad del vuelo: ' + sp.l + '. Cambiar',
      cycleSpeed: function () { self.setState({ speed: (self.state.speed + 1) % self.SPEEDS.length }); },
      nextOff: !st.started || (this.jump ? this.jump.j >= n - 1 : (!mo && st.cur >= n - 1) || (mo && Math.floor(mo.s + 1e-6) >= n - 1)),
      goNext: function () { self.step(1); },
      statusTxt: st.status, statusCls: st.status ? '' : 'hz-off',
      // Lote bajo el puntero
      hasTip: !!st.tip && !st.panel && !this.jump,
      tip: st.tip ? Object.assign({ col: ['', '#ffc561', '#73f2c2', '#8cbfff'][st.tip.e] }, st.tip) : { x: 0, y: 0, t1: '', t2: '', col: '#ffffff' },
      onLeave: function () { if (self.hBuf && self.data) self.setHover(null, 0, 0); },
      // Calce (herramienta interna con ?calzar=1)
      calMode: this.calMode, panelOff: !!mo || st.flying,
      hasLocal: localRows.length > 0 && !st.flying, localRows: localRows,
      aimZone: function () { self.aimZone(); },
      panelOpen: st.panel,
      togglePanel: function () {
        if (self.mo || self.state.flying) return;
        var open = !self.state.panel;
        self.setState({ panel: open, pending: null, hint: open ? '1. Toque una esquina de manzana en el plano chico. 2. Toque ese mismo lugar en la foto. Repita con 3 o 4 esquinas bien separadas.' : '', saveTxt: '' });
      },
      sceneName: curName,
      pairsTxt: np ? (np + (np === 1 ? ' punto' : ' puntos')) : 'sin puntos',
      hintTxt: st.hint, noPairs: np === 0,
      undoPair: function () { var c = self.calOf(self.state.cur); self.setPairs(c.pairs.slice(0, -1), 'Último punto quitado.'); },
      clearPairs: function () { self.setPairs([], 'Puntos borrados. Empiece de nuevo eligiendo una esquina en el plano chico.'); },
      saveCal: function () { self.saveCal(); },
      copyAll: function () { self.copyAll(); },
      yes: true,
      selectAll: function (e) { try { e.target.select(); } catch (err) {} },
      saveTxt: st.saveTxt, showJson: st.showJson, jsonTxt: st.jsonTxt || '',
      onMmClick: function (e) {
        if (!self.mmc || !self.verts) return;
        var rc = self.mmc.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top, X = self.miniXf();
        var best = -1, bd = 14 * 14;
        for (var i = 0; i < self.verts.length; i++) {
          var q = X.f(self.verts[i][0], self.verts[i][1]), dx = q[0] - x, dy = q[1] - y, dd = dx * dx + dy * dy;
          if (dd < bd) { bd = dd; best = i; }
        }
        if (best < 0) { self.setState({ hint: 'Toque más cerca de una esquina de manzana.' }); return; }
        self.setState({ pending: best, hint: 'Ahora toque en la foto el lugar exacto de esa esquina.' });
      },
      cal: cal,
      txt: { heading: Number(cal.heading).toFixed(1).replace('.', ',') + '°', agl: Math.round(cal.agl) + ' m', dx: fx(cal.dx, ' m'), dy: fx(cal.dy, ' m'), tilt: fx(cal.tilt, '°'), roll: fx(cal.roll, '°') },
      onHeading: function (e) { self.setCal('heading', num(e)); },
      onAgl: function (e) { self.setCal('agl', num(e)); },
      onDx: function (e) { self.setCal('dx', num(e)); },
      onDy: function (e) { self.setCal('dy', num(e)); },
      onTilt: function (e) { self.setCal('tilt', num(e)); },
      onRoll: function (e) { self.setCal('roll', num(e)); },
      resetCal: function () { var cals = Object.assign({}, self.state.cals); delete cals[self.SCENES[self.state.cur].id]; self.storeLocal(cals); self.setState({ cals: cals, hint: 'Ajuste fijado restablecido.' }); },
      // Mirar alrededor: libre siempre, también en vuelo y en pausa.
      onDown: function (e) {
        var c = self.ovc; if (!c) return;
        if (self.state.clean === 'render') { self.setState({ clean: false }); return; }
        self.pan = null;
        if (self.state.entorno || self.state.layersOpen || !self.state.helpDone) self.setState({ entorno: false, layersOpen: false, helpDone: true });
        try { c.setPointerCapture(e.pointerId); } catch (err) {}
        self.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (self.ptrs.size === 1) self.moved = 0;
        c.style.cursor = 'grabbing';
      },
      onMove: function (e) {
        var prev = self.ptrs.get(e.pointerId);
        if (!prev) {
          if (self.canPick() && e.pointerType === 'mouse') {
            var rc0 = self.ovc.getBoundingClientRect(), hx = e.clientX - rc0.left, hy = e.clientY - rc0.top;
            self.hoverTips = true; self.setHover(self.lotAt(hx, hy), hx, hy);
          }
          return;
        }
        var v = self.view;
        if (self.ptrs.size === 1) {
          var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
          var fovH = 2 * Math.atan(Math.tan(v.fov * Math.PI / 360) * self.cw / self.ch) * 180 / Math.PI;
          v.yaw -= dx * fovH / self.cw;
          v.pitch = Math.max(-89, Math.min(89, v.pitch + dy * v.fov / self.ch));
          self.moved += Math.abs(dx) + Math.abs(dy);
        } else if (self.ptrs.size === 2) {
          var pts = Array.from(self.ptrs.values()), other = pts[0] === prev ? pts[1] : pts[0];
          var d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
          if (d0 > 0 && d1 > 0) v.fov = Math.max(15, Math.min(100, v.fov * d0 / d1));
          self.moved += 10;
        }
        self.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        self.req();
        if (self.state.panel) self.drawMini();
      },
      onUp: function (e) {
        var had = self.ptrs.has(e.pointerId), single = self.ptrs.size === 1;
        self.ptrs.delete(e.pointerId);
        if (self.ovc) self.ovc.style.cursor = self.state.panel ? 'crosshair' : 'grab';
        if (had && single && self.moved < 6 && e.type === 'pointerup') {
          var rc = self.ovc.getBoundingClientRect(), tx_ = e.clientX - rc.left, ty_ = e.clientY - rc.top;
          if (self.state.panel) self.pickCal(tx_, ty_);
          else if (self.canPick()) self.pickLot(tx_, ty_, e.pointerType === 'mouse');
        }
      },
      onWheel: function (e) {
        if(self.autoInline&&document.documentElement.dataset.mwInlineScroll!=='full'&&!document.fullscreenElement&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey)return;
        e.preventDefault();
        self.view.fov = Math.max(15, Math.min(100, self.view.fov * Math.exp(e.deltaY * 0.001)));
        self.req();
      }
    };
  }
}

mountComponent(Component, document.getElementById("recorrido"), document.getElementById("recorrido-tpl"), {"lotColor": "#ffffff", "flightSeconds": 4.5, "clouds": 0.85});
