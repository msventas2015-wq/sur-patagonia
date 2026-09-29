// Binary primitives shared by the V1 runtime. No secrets or network access here.
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export function unicode(text) {
  if (typeof text !== 'string' || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)) throw new Error('invalid_text');
  return text;
}
export const utf8 = text => encoder.encode(unicode(text));
export const decodeUtf8 = bytes => decoder.decode(bytes);
export function concat(...parts) {
  if (parts.some(p => !(p instanceof Uint8Array))) throw new Error('invalid_bytes');
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
export function uint32(value) {
  if (!Number.isInteger(value) || Object.is(value, -0) || value < 0 || value > 0xffffffff) throw new Error('invalid_uint32');
  const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value); return bytes;
}
export function int64(value) {
  if (typeof value !== 'bigint' || value < -(1n << 63n) || value >= (1n << 63n)) throw new Error('invalid_int64');
  const bytes = new Uint8Array(8); new DataView(bytes.buffer).setBigInt64(0, value); return bytes;
}
export function lp(text) { const bytes = utf8(text); return concat(uint32(bytes.length), bytes); }
export function uuidBytes(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw new Error('invalid_uuid');
  return Uint8Array.from(value.replaceAll('-', '').match(/../g), byte => parseInt(byte, 16));
}
export function uuidText(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 16) throw new Error('invalid_uuid');
  const hex = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function base64url(bytes) {
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export function unbase64url(value, maximum = 1024) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > maximum) throw new Error('invalid_base64url');
  const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)), x => x.charCodeAt(0));
  if (base64url(bytes) !== value) throw new Error('noncanonical_base64url');
  return bytes;
}
export class Reader {
  constructor(bytes) { this.bytes = bytes; this.offset = 0; }
  take(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.bytes.length) throw new Error('short_buffer');
    const result = this.bytes.slice(this.offset, this.offset + length); this.offset += length; return result;
  }
  text(maximum) {
    const raw = this.take(4); const size = new DataView(raw.buffer).getUint32(0);
    if (size > maximum) throw new Error('oversized_text');
    return unicode(decodeUtf8(this.take(size)));
  }
  signed64() { return new DataView(this.take(8).buffer).getBigInt64(0); }
  end() { if (this.offset !== this.bytes.length) throw new Error('trailing_bytes'); }
}
