import { decodeUtf8, unicode } from './codec.mjs';

// Parse original bytes: JSON.parse alone silently accepts duplicate object keys.
export function strictJson(bytes, maximum) {
  if (!(bytes instanceof Uint8Array) || bytes.length > maximum) throw new Error('invalid_size');
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error('bom');
  const text = decodeUtf8(bytes); let i = 0;
  const fail = () => { throw new Error('invalid_json'); };
  const space = () => { while (/[\t\n\r ]/.test(text[i] ?? '\0')) i++; };
  function string() {
    if (text[i++] !== '"') fail();
    const start = i - 1;
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') return unicode(JSON.parse(text.slice(start, i)));
      if (c.charCodeAt(0) < 32) fail();
      if (c === '\\') {
        const escaped = text[i++];
        if (escaped === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i, i + 4))) fail(); i += 4; }
        else if (!['"','\\','/','b','f','n','r','t'].includes(escaped)) fail();
      }
    }
    fail();
  }
  function value(depth = 0) {
    if (depth > 16) fail(); space();
    if (text[i] === '"') return string();
    if (text[i] === '{') {
      i++; space(); const result = Object.create(null); const seen = new Set();
      if (text[i] === '}') { i++; return result; }
      for (;;) {
        space(); const key = string(); if (seen.has(key)) fail(); seen.add(key);
        space(); if (text[i++] !== ':') fail(); result[key] = value(depth + 1); space();
        const next = text[i++]; if (next === '}') return result; if (next !== ',') fail();
      }
    }
    if (text[i] === '[') {
      i++; space(); const result = [];
      if (text[i] === ']') { i++; return result; }
      for (;;) { result.push(value(depth + 1)); space(); const next = text[i++]; if (next === ']') return result; if (next !== ',') fail(); }
    }
    for (const [literal, parsed] of [['true',true],['false',false],['null',null]]) {
      if (text.startsWith(literal, i)) { i += literal.length; return parsed; }
    }
    // All V1 numeric fields are safe integers; fractions/exponents/-0 are forbidden.
    const match = /^-?(?:0|[1-9][0-9]*)/.exec(text.slice(i)); if (!match) fail();
    i += match[0].length; const number = Number(match[0]);
    if (!Number.isSafeInteger(number) || Object.is(number, -0)) fail(); return number;
  }
  const result = value(); space();
  if (i !== text.length || !result || typeof result !== 'object' || Array.isArray(result)) fail();
  return result;
}

export function exactKeys(object, keys) {
  const found = Object.keys(object);
  if (found.length !== keys.length || keys.some(key => !Object.hasOwn(object, key))) throw new Error('invalid_schema');
}
