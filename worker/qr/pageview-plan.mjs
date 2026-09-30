// Pure pageview preparation. The database, not this untrusted cookie parser,
// authenticates a handoff and decides whether a navigation has attribution.
import {scanFamily} from './handoff.mjs';
import {hashPayload} from './payload-codec.mjs';
import {deriveContactNetworkHash} from './contact-plan.mjs';

const UUID4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GENERAL=new Set(['/','/propiedades','/proyectos','/servicios']);

function validPayload(p) {
  if(!p||typeof p!=='object'||Array.isArray(p)
    ||Object.keys(p).sort().join(',')!==
      'landing_id,path,propiedad_id,proyecto_slug,request_id,version'
    ||p.version!==1||!UUID4.test(p.request_id)
    ||(p.landing_id!==null&&!UUID4.test(p.landing_id))) return false;
  if(GENERAL.has(p.path)) return p.propiedad_id===null&&p.proyecto_slug===null;
  if(p.path==='/propiedad') return UUID.test(p.propiedad_id)&&p.proyecto_slug===null;
  if(p.path==='/proyecto-mini') return p.propiedad_id===null
    &&typeof p.proyecto_slug==='string'&&p.proyecto_slug.length<=120
    &&/^[a-z0-9][a-z0-9-]*$/.test(p.proyecto_slug);
  return false;
}

export async function preparePageviewPlan({payload,cookieHeader=null,normalizedEdgeIp},context) {
  if(!validPayload(payload)) throw Error('invalid_pageview_payload');
  if(!context||typeof context.environment!=='string'
    ||!/^[a-z0-9_-]{1,32}$/.test(context.environment)
    ||!['sp_attr_qa_','__Host-sp_attr_'].includes(context.cookiePrefix)
    ||!(context.rateKey instanceof Uint8Array)||context.rateKey.length!==32
    ||!(context.payloadKey instanceof Uint8Array)||context.payloadKey.length!==32) {
    throw Error('invalid_pageview_config');
  }
  const trustedNetwork=typeof normalizedEdgeIp==='function'
    ? await normalizedEdgeIp():normalizedEdgeIp;
  const [networkHash,cookies,identity]=await Promise.all([
    deriveContactNetworkHash({environment:context.environment,
      normalizedEdgeIp:trustedNetwork,rateKey:context.rateKey}),
    scanFamily(cookieHeader,{prefix:context.cookiePrefix,
      landingAck:payload.landing_id!==null}),
    hashPayload({environment:context.environment,operation:'pageview',key:context.payloadKey,
      fields:[['request_id','uuid',payload.request_id],
        ['landing_id','uuid',payload.landing_id],['path','text',payload.path],
        ['propiedad_id','uuid',payload.propiedad_id],
        ['proyecto_slug','text',payload.proyecto_slug],['version','int64',1n]]}),
  ]);
  return {
    rpc:'qr_pageview_registrar_interno_v1',
    args:{
      p_ambiente:context.environment,
      p_request_id:payload.request_id,
      p_payload_hash:identity.payload_hash,
      p_payload_key_id:identity.payload_key_id,
      p_landing_id:payload.landing_id,
      p_path:payload.path,
      p_propiedad_id:payload.propiedad_id,
      p_proyecto_slug:payload.proyecto_slug,
      p_network_hash:networkHash,
      p_cookie_scan_state:cookies.state,
      p_cookie_family_count:cookies.count,
      p_cookie_family_bytes:cookies.bytes,
      p_cookie_candidates:cookies.candidates.map(candidate=>({
        slot:candidate.requestId.replaceAll('-',''),hash:candidate.handoffHash,
        kid:candidate.kid,
      })),
    },
    // Used only to expire a demonstrably overflowed family after a committed
    // real navigation. An ACK never scans or mutates cookies.
    familySlots:cookies.familySlots,
  };
}
