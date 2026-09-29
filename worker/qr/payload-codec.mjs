import {concat, lp, int64, uint32, uuidBytes, unicode} from './codec.mjs';

const TYPES = new Set(['text', 'uuid', 'int64', 'ts_us', 'bytes', 'bool', 'uuid[]']);
const flag = value => Uint8Array.of(value);

// Internal serialization primitive, NOT a schema accepted from HTTP. Each
// endpoint must supply its own closed ordered schema after normalization.
// Nullability and semantic validation remain the responsibility of that schema.
export function encodePayloadField(name, type, value) {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name) || !TYPES.has(type)) throw Error('invalid_field');
  if (value === null) return concat(lp(name), flag(0));
  let encoded;
  switch (type) {
    case 'text':
      unicode(value);
      if (value !== value.normalize('NFC')) throw Error('not_normalized');
      encoded = lp(value); break;
    case 'uuid': encoded = uuidBytes(value); break;
    case 'int64':
    case 'ts_us': encoded = int64(value); break; // BigInt only: no precision loss.
    case 'bytes':
      if (!(value instanceof Uint8Array)) throw Error('invalid_bytes');
      encoded = concat(uint32(value.length), value); break;
    case 'bool':
      if (typeof value !== 'boolean') throw Error('invalid_boolean');
      encoded = flag(value ? 1 : 0); break;
    case 'uuid[]':
      if (!Array.isArray(value)) throw Error('invalid_uuid_array');
      // Preserve order. A set-valued endpoint must sort during normalization;
      // this codec must not silently turn an ordered list into a set.
      encoded = concat(uint32(value.length), ...value.map(uuidBytes)); break;
  }
  return concat(lp(name), flag(1), lp(type), encoded);
}

export function encodePayloadEnvelope(environment, operation, fields) {
  if (typeof environment !== 'string' || !environment || typeof operation !== 'string' || !operation || !Array.isArray(fields)) throw Error('invalid_envelope');
  const names = new Set();
  const encoded = fields.map(field => {
    if (!Array.isArray(field) || field.length !== 3 || names.has(field[0])) throw Error('invalid_fields');
    names.add(field[0]);
    return encodePayloadField(...field);
  });
  return concat(lp('qr-payload-v1'), lp(environment), lp(operation), ...encoded);
}

// Key isolation, immutable V1 key readiness and endpoint schemas are enforced by
// the runtime configuration/adapter, not claimed by this standalone primitive.
export async function hashPayload({environment, operation, fields, key}) {
  if (!(key instanceof Uint8Array) || key.length !== 32) throw Error('invalid_key');
  const body = encodePayloadEnvelope(environment, operation, fields);
  const imported = await crypto.subtle.importKey('raw', key, {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return {payload_key_id:'v1', payload_hash:new Uint8Array(await crypto.subtle.sign('HMAC', imported, body))};
}
