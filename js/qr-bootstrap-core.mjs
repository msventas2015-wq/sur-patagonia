// DOM adapter is separate. This state machine has one navigation decision per document.
export const STATE_KEY = 'sp_qr_bootstrap_v1';
export const LANDING_KEY = 'sp_qr_landing_v1';
const runs = new WeakMap();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const closed = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === keys.length && keys.every(k=>Object.hasOwn(o,k));

export function observedRoute(href) {
  const url = new URL(href);
  const path = url.pathname;
  if (/[\\%]/.test(path) || !/^\/r\/[A-Za-z0-9-]{2,80}\/?$/.test(path)) throw new Error('invalid_route');
  const noFragment = href.split('#')[0];
  if (noFragment.includes('?') && url.search !== '?via=link') throw new Error('invalid_query');
  const codigo = path.slice(3).replace(/\/$/,'').toLowerCase();
  return {codigo,via:url.search === '?via=link'?'link':'qr',path:'/r/'+codigo+(url.search === '?via=link'?'?via=link':'')};
}
export function safeDestination(destino) {
  if (typeof destino !== 'string') return false;
  return ['/', '/propiedades', '/proyectos', '/servicios'].includes(destino)
    || /^\/propiedad\.html\?id=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(destino)
    || /^\/proyecto-mini\?slug=[a-z0-9][a-z0-9-]*$/.test(destino)
    || /^\/[a-z0-9][a-z0-9-]*$/.test(destino);
}
export function trackedResponse(value) {
  if (!closed(value,['ok','tracked','destino','landing']) || value.ok!==true || value.tracked!==true || !safeDestination(value.destino)) return false;
  const l=value.landing;
  if (!closed(l,['landing_id','pageview_request_id','path','propiedad_id','proyecto_slug']) || !UUID.test(l.landing_id) || !UUID.test(l.pageview_request_id)) return false;
  if (['/','/propiedades','/proyectos','/servicios'].includes(value.destino)) return l.path===value.destino && l.propiedad_id===null && l.proyecto_slug===null;
  if (value.destino.startsWith('/propiedad.html?')) return l.path==='/propiedad' && l.propiedad_id===value.destino.split('=')[1] && l.proyecto_slug===null;
  const slug=value.destino.startsWith('/proyecto-mini?')?value.destino.split('=')[1]:value.destino.slice(1);
  return l.path==='/proyecto-mini' && l.propiedad_id===null && l.proyecto_slug===slug;
}
const untrackedResponse = value => closed(value,['ok','tracked','destino','landing']) && value.ok===true && value.tracked===false && value.landing===null && safeDestination(value.destino);

export function runBootstrap(environment) {
  if (!runs.has(environment.history)) runs.set(environment.history, execute(environment));
  return runs.get(environment.history);
}
async function execute(e) {
  let route;
  try { route=observedRoute(e.location.href); } catch { e.status('invalid'); return {status:'invalid'}; }
  let state, decided=false;
  const now=()=>Math.floor(e.now()/1000);
  function save(next) {
    const previous=e.history.state;
    if (previous!==null && (typeof previous!=='object' || Array.isArray(previous))) throw new Error('invalid_history');
    e.history.replaceState({...previous,[STATE_KEY]:next},'',route.path);
    // Read-back is part of the durability precondition for sending consume.
    if (JSON.stringify(e.history.state?.[STATE_KEY])!==JSON.stringify(next)) throw new Error('history_not_saved');
    state=next;
  }
  function stop(status, retryAfterUntil = state?.retry_after_until ?? null) {
    try { save({...state,version:1,path:route.path,phase:'terminal',reason:status,retry_after_until:retryAfterUntil}); } catch { /* no further write request */ }
    e.status(status,{retryAfterUntil}); return {status};
  }
  function navigate(destino) {
    if (!decided) {
      decided=true;
      try { e.location.replace(destino); }
      catch { e.status('navigation_failed'); return {status:'navigation_failed',destino}; }
    }
    return {status:'navigated',destino};
  }
  async function request(url, body, options={}) {
    const controller=new AbortController(); let timer;
    try {
      return await Promise.race([
        (async()=>{
          const response=await e.fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,...options});
          const json=/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type')??'');
          const retryHeader=response.headers?.get('retry-after');
          let retryAfterUntil=null;
          if (retryHeader && /^\d+$/.test(retryHeader)) {
            const seconds=Number(retryHeader);
            if (Number.isSafeInteger(seconds) && Number.isSafeInteger(now()+seconds)) retryAfterUntil=now()+seconds;
          } else if (retryHeader) {
            const seconds=Math.ceil(Date.parse(retryHeader)/1000);
            if (Number.isSafeInteger(seconds)) retryAfterUntil=Math.max(now(),seconds);
          }
          if (response.status!==200 || !json) return {status:response.status,body:null,json,retryAfterUntil};
          return {status:response.status,body:await response.json(),json,retryAfterUntil};
        })(),
        new Promise((_,reject)=>{timer=e.setTimeout(()=>{controller.abort();reject(new Error('timeout'));},8000);})
      ]);
    } finally { e.clearTimeout(timer); }
  }
  async function fallback() {
    try { save({...state,version:1,path:route.path,phase:'terminal'}); } catch { /* still pure resolution only */ }
    try {
      // Pending from another opening is never removed by this opening.
      if (state?.owned_landing_id) {
        const pending=JSON.parse(e.storage.getItem(LANDING_KEY));
        if (pending?.landing_id===state.owned_landing_id) e.storage.removeItem(LANDING_KEY);
      }
    } catch { /* unavailable storage does not block pure resolution */ }
    if (typeof e.config.rpcUrl!=='string' || !/^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\/rpc\/qr_resolver_anon_v1$/.test(e.config.rpcUrl)
      || typeof e.config.anonKey!=='string' || !e.config.anonKey) return stop('unavailable');
    try {
      const result=await request(e.config.rpcUrl,{p_codigo:route.codigo},{credentials:'omit',headers:{'Content-Type':'application/json',apikey:e.config.anonKey}});
      if (result.status===200 && untrackedResponse(result.body)) return navigate(result.body.destino);
    } catch { /* no fabricated destination or entry */ }
    return stop('unavailable');
  }
  function hardFailure(result) {
    if (result.status===429) return 'limited';
    // Asset/proxy 404/405 without a JSON contract is technical unavailability.
    // JSON rejections, authentication failures and rate limits NEVER bypass.
    if ([404,405].includes(result.status) && !result.json) return null;
    if ([400,404,409,413,415,405,401,403].includes(result.status)) return 'rejected';
    return null;
  }
  try {
    const prior=e.history.state?.[STATE_KEY];
    if (prior) {
      if (prior.version!==1 || prior.path!==route.path || !['init_enviado','ready','consuming','terminal'].includes(prior.phase) || !Number.isInteger(prior.attempts) || prior.attempts<0 || prior.attempts>2) return fallback();
      state={...prior};
      if (state.phase==='terminal' && ['limited','rejected'].includes(state.reason)) return stop(state.reason);
      if (state.phase==='terminal' || state.phase==='init_enviado') return fallback();
      if (typeof state.init!=='string' || !Number.isSafeInteger(state.expires_at)) return fallback();
    } else {
      save({version:1,path:route.path,phase:'init_enviado',attempts:0});
      let init;
      try { init=await request('/api/qr/init',{version:1,codigo:route.codigo,via:route.via}); }
      catch { return fallback(); }
      const hard=hardFailure(init); if (hard) return stop(hard,init.retryAfterUntil);
      if (init.status!==200 || !closed(init.body,['ok','init','expires_at']) || init.body.ok!==true || typeof init.body.init!=='string' || !/^v1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+$/.test(init.body.init) || init.body.init.length>400 || !Number.isSafeInteger(init.body.expires_at)) return fallback();
      save({...state,phase:'ready',init:init.body.init,expires_at:init.body.expires_at});
    }
    while(state.attempts<2 && now()<state.expires_at) {
      save({...state,phase:'consuming',attempts:state.attempts+1});
      let result;
      try { result=await request('/api/qr/consume',{version:1,init:state.init}); }
      catch { continue; }
      const hard=hardFailure(result); if (hard) return stop(hard,result.retryAfterUntil);
      if (result.status===200 && trackedResponse(result.body)) {
        // Do not fall back after an accepted tracked outcome if ACK storage fails.
        try {
          save({...state,phase:'terminal',owned_landing_id:result.body.landing.landing_id});
          e.storage.setItem(LANDING_KEY,JSON.stringify(result.body.landing));
        } catch { /* landing degrades to navigation with null via */ }
        return navigate(result.body.destino);
      }
      if (result.status===200 && untrackedResponse(result.body)) { stop('resolved'); return navigate(result.body.destino); }
      if (result.status<500 && result.status!==200 && !([404,405].includes(result.status)&&!result.json)) return stop('rejected');
    }
  } catch { return fallback(); }
  return fallback();
}
