// Pure preparation for the authenticated Worker consultation writer.
// It performs no fetch, database write, cookie mutation or success projection.
import {concat, lp} from './codec.mjs';
import {scanFamily} from './handoff.mjs';
import {hashPayload} from './payload-codec.mjs';

const NETWORK_IDENTITY=/^[0-9A-Fa-f:.]{2,64}$/;
const UUID4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SOURCES=new Set(['home_form','home_chatbot','propiedades_form','proyectos_form',
  'servicios_form','burbuja_global','propiedad_form','propiedad_whatsapp','proyecto_mini_form']);

function key32(value,error) {
  if(!(value instanceof Uint8Array)||value.length!==32) throw Error(error);
  return value.slice();
}
async function hmac(keyBytes,message) {
  const key=await crypto.subtle.importKey('raw',key32(keyBytes,'invalid_rate_key'),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',key,message));
}
function validatePayload(p) {
  if(!p||p.version!==1||!UUID4.test(p.request_id)||!SOURCES.has(p.fuente)
    ||typeof p.nombre!=='string'||typeof p.mensaje!=='string'
    ||(p.email!==null&&typeof p.email!=='string')
    ||(p.telefono!==null&&typeof p.telefono!=='string')
    ||(p.propiedad_id!==null&&typeof p.propiedad_id!=='string')
    ||(p.proyecto_slug!==null&&typeof p.proyecto_slug!=='string')
    ||Object.keys(p).sort().join(',')!=='email,fuente,mensaje,nombre,propiedad_id,proyecto_slug,request_id,telefono,version') {
    throw Error('invalid_contact_payload');
  }
}
function config(context) {
  if(!context||typeof context.environment!=='string'||!/^[a-z0-9_-]{1,32}$/.test(context.environment)
    ||!['sp_attr_qa_','__Host-sp_attr_'].includes(context.cookiePrefix)) throw Error('invalid_contact_config');
  key32(context.rateKey,'invalid_contact_config');
  key32(context.payloadKey,'invalid_contact_config');
}
function payloadFields(p) {
  return [
    ['request_id','uuid',p.request_id],['nombre','text',p.nombre],['email','text',p.email],
    ['telefono','text',p.telefono],['mensaje','text',p.mensaje],
    ['propiedad_id','uuid',p.propiedad_id],['proyecto_slug','text',p.proyecto_slug],
    ['fuente','text',p.fuente],['version','int64',1n],
  ];
}

export async function deriveContactNetworkHash({environment,normalizedEdgeIp,rateKey}) {
  if(typeof environment!=='string'||!/^[a-z0-9_-]{1,32}$/.test(environment)
    ||typeof normalizedEdgeIp!=='string'||!NETWORK_IDENTITY.test(normalizedEdgeIp)) {
    throw Error('invalid_contact_network');
  }
  return hmac(rateKey,concat(lp('qr-rate-v1'),lp(environment),lp('network'),lp(normalizedEdgeIp)));
}

export async function prepareContactPlan({payload,cookieHeader=null,normalizedEdgeIp},context) {
  validatePayload(payload); config(context);
  const trustedNetwork=typeof normalizedEdgeIp==='function'
    ? await normalizedEdgeIp():normalizedEdgeIp;
  const [networkHash,cookies,identity]=await Promise.all([
    deriveContactNetworkHash({environment:context.environment,normalizedEdgeIp:trustedNetwork,rateKey:context.rateKey}),
    scanFamily(cookieHeader,{prefix:context.cookiePrefix}),
    hashPayload({environment:context.environment,operation:'contacto',fields:payloadFields(payload),key:context.payloadKey}),
  ]);
  return {
    rpc:'qr_contacto_registrar_interno_v1',
    args:{
      p_ambiente:context.environment,
      p_request_id:payload.request_id,
      p_payload_hash:identity.payload_hash,
      p_payload_key_id:identity.payload_key_id,
      p_nombre:payload.nombre,
      p_email:payload.email,
      p_telefono:payload.telefono,
      p_mensaje:payload.mensaje,
      p_propiedad_id:payload.propiedad_id,
      p_proyecto_slug:payload.proyecto_slug,
      p_fuente:payload.fuente,
      p_network_hash:networkHash,
      p_cookie_scan_state:cookies.state,
      p_cookie_family_count:cookies.count,
      p_cookie_family_bytes:cookies.bytes,
      p_cookie_candidates:cookies.candidates.map(candidate=>({
        slot:candidate.requestId.replaceAll('-',''),hash:candidate.handoffHash,kid:candidate.kid,
      })),
    },
  };
}
