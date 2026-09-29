// Public, read-only fallback configuration. It contains no credential capable
// of writing data. Unknown hosts fail closed instead of crossing environments.
const PROD={
  rpcUrl:'https://wajkfydxutptcvvfwrvq.supabase.co/rest/v1/rpc/qr_resolver_anon_v1',
  anonKey:'sb_publishable_RKpmv1VDwMOB25phyfFrog_OdI-wB8s'
};
const QA={
  rpcUrl:'https://rsjwqmpseknvydistgfr.supabase.co/rest/v1/rpc/qr_resolver_anon_v1',
  anonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzandxbXBzZWtudnlkaXN0Z2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NDE1OTEsImV4cCI6MjEwMjMxNzU5MX0.X31f3AGUg0Oi01daBktS9ltfcp3ID6uZFJd7tGIlUKg'
};
export function qrFallbackConfig(hostname){
  const host=String(hostname??'').toLowerCase();
  if(host==='surpatagonian.com'||host==='www.surpatagonian.com') return PROD;
  if(host==='127.0.0.1'||host==='localhost') return QA;
  return {rpcUrl:'',anonKey:''};
}
