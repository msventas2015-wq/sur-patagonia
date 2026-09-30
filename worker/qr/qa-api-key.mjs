// Supabase accepts new sb_secret keys in apikey only. Legacy service_role JWTs
// also use Authorization: Bearer. Neither form is ever returned to callers.
const SECRET = /^sb_secret_[A-Za-z0-9_-]{20,}$/;
const LEGACY_JWT = /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function qaServiceHeaders(key) {
  if (typeof key !== 'string') throw new Error('invalid_qa_service_key');
  if (SECRET.test(key)) return { apikey: key };
  if (LEGACY_JWT.test(key)) return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  throw new Error('invalid_qa_service_key');
}
