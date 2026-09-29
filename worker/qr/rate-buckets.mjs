// V1 §7 binary bucket identities. No counter, network lookup or admission here.
// Inputs must already be authenticated by the caller's transport/ledger layer.
import { concat, utf8 } from './codec.mjs';

const rules = Object.freeze({
  resolver_network: [null, 1, 120, 60],
  resolver_code: [null, 1, 1000, 60],
  resolver_network_code: ['qr-rate-v1/resolver/network-code', 2, 20, 60],
  pageview_network: [null, 1, 180, 60],
  contacto_network: [null, 1, 5, 600],
  contacto_handoff: ['qr-rate-v1/contact/handoff', 1, 3, 600],
  report_network: [null, 1, 120, 60],
  report_network_token: ['qr-rate-v1/report/network-token', 2, 30, 60],
  report_token: ['qr-rate-v1/report/token', 1, 600, 60],
});

export async function rateBucket(scope, ...hashes) {
  if (typeof scope !== 'string' || !Object.hasOwn(rules, scope)) throw new Error('invalid_rate_scope');
  const [label, arity, limit, windowSeconds] = rules[scope];
  if (hashes.length !== arity || hashes.some(h => !(h instanceof Uint8Array) || h.length !== 32)) {
    throw new Error('invalid_rate_hashes');
  }
  // Copy synchronously; callers cannot mutate an input while hashing is pending.
  const identity = label === null ? hashes[0].slice() : new Uint8Array(
    await crypto.subtle.digest('SHA-256', concat(utf8(label), new Uint8Array([0]), ...hashes)),
  );
  return { scope, identity, limit, windowSeconds };
}
