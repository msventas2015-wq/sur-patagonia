#!/usr/bin/env node

// Validador local y read-only del paquete V3.2. No abre red ni escribe archivos.

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (name) => path.join(root, name);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fail = (message) => { throw new Error(message); };
const read = async (name) => readFile(rel(name), 'utf8');
const plpgsqlDollarTags = new Set([
  'assert_baseline', 'baseline', 'body', 'check', 'cleanup', 'data', 'function',
  'guard', 'post', 'postcheck', 'precheck', 'rollback_data', 'rollback_guard', 'setup',
]);

const sqlFiles = [
  'docs/auditorias/sql/PRECHECK-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/FORWARD-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/POSTCHECK-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/ROLLBACK-PREUSO-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/PRECHECK-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/FORWARD-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/POSTCHECK-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/ROLLBACK-OPERACIONAL-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/POSTCHECK-ROLLBACK-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/FORWARD-REACTIVAR-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/ROLLBACK-PREUSO-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/QA-CARGA-MANUAL-FIXTURES-SETUP-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/QA-CARGA-MANUAL-FIXTURES-CLEANUP-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/QA-CARGA-MANUAL-POSTCLEANUP-V3.2-2026-07-19.sql',
];

function validateSqlLexically(name, source, depth = 0) {
  if (depth > 16) fail(`${name}: anidamiento dollar-quote excesivo`);
  let parens = 0;
  let brackets = 0;
  let state = 'normal';
  let dollar = null;
  let dollarBodyStart = null;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const n = source[i + 1];
    if (state === 'line') {
      if (c === '\n') state = 'normal';
      continue;
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { state = 'normal'; i += 1; }
      continue;
    }
    if (state === 'string') {
      if (c === "'" && n === "'") { i += 1; continue; }
      if (c === "'") state = 'normal';
      continue;
    }
    if (state === 'identifier') {
      if (c === '"' && n === '"') { i += 1; continue; }
      if (c === '"') state = 'normal';
      continue;
    }
    if (state === 'dollar') {
      if (source.startsWith(dollar, i)) {
        const body = source.slice(dollarBodyStart, i);
        const tag = dollar.slice(1, -1);
        if (plpgsqlDollarTags.has(tag)) {
          validateSqlLexically(`${name}:${dollar}`, body, depth + 1);
          validatePlpgsqlIfBalance(`${name}:${dollar}`, body);
        }
        i += dollar.length - 1;
        state = 'normal';
        dollar = null;
        dollarBodyStart = null;
      }
      continue;
    }
    if (c === '-' && n === '-') { state = 'line'; i += 1; continue; }
    if (c === '/' && n === '*') { state = 'block'; i += 1; continue; }
    if (c === "'") { state = 'string'; continue; }
    if (c === '"') { state = 'identifier'; continue; }
    if (c === '$') {
      const match = source.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollar = match[0];
        state = 'dollar';
        i += dollar.length - 1;
        dollarBodyStart = i + 1;
        continue;
      }
    }
    if (c === '(') parens += 1;
    if (c === ')') parens -= 1;
    if (c === '[') brackets += 1;
    if (c === ']') brackets -= 1;
    if (parens < 0) fail(`${name}: paréntesis de cierre sin apertura`);
    if (brackets < 0) fail(`${name}: corchete de cierre sin apertura`);
  }
  if (state !== 'normal' && state !== 'line') fail(`${name}: literal/comentario sin cerrar (${state})`);
  if (parens !== 0) fail(`${name}: balance de paréntesis ${parens}`);
  if (brackets !== 0) fail(`${name}: balance de corchetes ${brackets}`);
}

function extractFunctionBody(source, functionName) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`create(?: or replace)? function public\\.${escaped}\\(\\)[\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`, 'i');
  const match = source.match(pattern);
  if (!match) fail(`No se encontró el cuerpo de ${functionName}`);
  return match[1];
}

function extractTaggedBody(source, tag) {
  const marker = `$${tag}$`;
  const start = source.indexOf(marker);
  const end = start < 0 ? -1 : source.indexOf(marker, start + marker.length);
  if (start < 0 || end < 0) fail(`No se encontró cuerpo $${tag}$ completo`);
  return source.slice(start + marker.length, end);
}

function sqlTokens(source) {
  const tokens = [];
  for (let i = 0; i < source.length;) {
    const c = source[i];
    const n = source[i + 1];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '-' && n === '-') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && n === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) fail('Tokenizador SQL: comentario de bloque sin cerrar');
      i = end + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      let token = quote;
      i += 1;
      let closed = false;
      while (i < source.length) {
        token += source[i];
        if (source[i] === quote && source[i + 1] === quote) {
          token += source[i + 1];
          i += 2;
          continue;
        }
        if (source[i] === quote) { i += 1; closed = true; break; }
        i += 1;
      }
      if (!closed) fail('Tokenizador SQL: literal/identificador sin cerrar');
      tokens.push(token);
      continue;
    }
    if (c === '$') {
      const match = source.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        const marker = match[0];
        const end = source.indexOf(marker, i + marker.length);
        if (end < 0) fail(`Tokenizador SQL: ${marker} sin cerrar`);
        tokens.push(source.slice(i, end + marker.length));
        i = end + marker.length;
        continue;
      }
    }
    const word = source.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*|^[0-9]+(?:\.[0-9]+)?/);
    if (word) { tokens.push(word[0].toLowerCase()); i += word[0].length; continue; }
    const operator = source.slice(i).match(/^(?:::|<>|<=|>=|:=|->>|->|\|\||&&|@>|<@|!=)/);
    if (operator) { tokens.push(operator[0]); i += operator[0].length; continue; }
    tokens.push(c);
    i += 1;
  }
  return tokens;
}

function containsTokenSequence(haystack, needle) {
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function validatePlpgsqlIfBalance(name, source) {
  const tokens = sqlTokens(source);
  let balance = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] === 'end' && tokens[i + 1] === 'if') {
      balance -= 1;
      if (balance < 0) fail(`${name}: END IF sin IF`);
      i += 1;
      continue;
    }
    if (tokens[i] !== 'if') continue;
    let hasThen = false;
    for (let j = i + 1; j < tokens.length && tokens[j] !== ';'; j += 1) {
      if (tokens[j] === 'then') { hasThen = true; break; }
    }
    if (hasThen) balance += 1;
  }
  if (balance !== 0) fail(`${name}: balance IF/END IF ${balance}`);
}

validateSqlLexically('SELFTEST_SQL_VALID', 'do $check$ begin perform (1); select "valid)identifier"; end; $check$; select $$plain unmatched ( text$$;');
let invalidDollarBodyRejected = false;
try {
  validateSqlLexically('SELFTEST_SQL_INVALID', 'do $check$ begin perform (1)); end; $check$;');
} catch {
  invalidDollarBodyRejected = true;
}
if (!invalidDollarBodyRejected) fail('Autotest: el validador no inspecciona cuerpos dollar-quoted');
let unclosedIfRejected = false;
try {
  validateSqlLexically('SELFTEST_SQL_IF_INVALID', 'do $check$ begin if true then null; end; $check$;');
} catch {
  unclosedIfRejected = true;
}
if (!unclosedIfRejected) fail('Autotest: el validador no detecta IF sin END IF');

const brief = await read('docs/briefs/BRIEF-CODEX-CARGA-MANUAL-LEADS-V3.2-2026-07-19.md');
if (sha256(brief) !== '7c642f3bb8ae90523804e71cae5ebdd43977b7e30c7eb2638447fcca1bd1b791') {
  fail('El brief aprobado V3.2 cambió');
}

const snapshotSpecs = [
  ['docs/auditorias/snapshots/CANALES-BASELINE-M1-V3.2-2026-07-19.ndjson', 55,
    'a44e4696cb5d33aa828b4458bcd93d28968b9e5a6a318ccb3bd34e6e8a55d6de',
    ['id', 'nombre', 'codigo', 'destino', 'activo']],
  ['docs/auditorias/snapshots/REFERENCIAS-BASELINE-M1-V3.2-2026-07-19.ndjson', 72,
    '25fba6eb33b2ceff59eb50d5abadb786891f41a1d1d0721b2173e41a39d50a89',
    ['id', 'canal_id', 'codigo', 'activo', 'punto_tipo']],
];
for (const [name, rows, expectedHash, allowedKeys] of snapshotSpecs) {
  const source = await read(name);
  if (sha256(source) !== expectedHash) fail(`${name}: SHA-256 derivó`);
  const lines = source.trimEnd().split('\n');
  if (lines.length !== rows || !source.endsWith('\n')) fail(`${name}: filas o newline final inválidos`);
  for (const line of lines) {
    const value = JSON.parse(line);
    const keys = Object.keys(value).sort();
    if (keys.join('|') !== [...allowedKeys].sort().join('|')) fail(`${name}: proyección no sanitizada`);
  }
}

const loadedSql = new Map();
for (const name of sqlFiles) {
  const source = await read(name);
  validateSqlLexically(name, source);
  if (!/NO EJECUTADO/i.test(source)) fail(`${name}: falta marca NO EJECUTADO`);
  loadedSql.set(name, source);
}

const m1ContractFiles = [
  'docs/auditorias/sql/PRECHECK-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/FORWARD-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/POSTCHECK-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/ROLLBACK-PREUSO-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.sql',
];
const m1CatalogPins = [
  'referencias_pkey',
  '14534c0dd2116469ed32314ce9a1034c3a02d3f01b3eec00938389b2eb074c31',
  '46f7853b5c5672ca434955cff1e2245be9ac636b2fec679a655c4dea45c27de9',
  'f49fd0d450f0c3ada588a612656ecf94e74cfd8a3e685fdccd47ae3dee1835f0',
  '64b1568d13449bf61f2a9ba721f697f8f12849310926365c8e90ad98fff2ae98',
  '98a845317f0d7d51f1f929d61fa30dfb071db1a19fca407c96af50b53b7027dc',
  'c10d3ecdb68d176c4ef7b01c3a1e54694ef57ab9c5da8db855e50997e3dfff31',
  '8ff92b6e05706663218a997d07afd5fb778ccc96cd0bbc8f16ec8e5d10c71b96',
  't.tgnargs=0',
];
for (const name of m1ContractFiles) {
  const source = loadedSql.get(name);
  for (const pin of m1CatalogPins) {
    if (!source.includes(pin)) fail(`${name}: falta pin M1 ${pin}`);
  }
}

const m2ContractFiles = [
  'docs/auditorias/sql/PRECHECK-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/FORWARD-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/POSTCHECK-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/ROLLBACK-OPERACIONAL-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/POSTCHECK-ROLLBACK-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/FORWARD-REACTIVAR-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/ROLLBACK-PREUSO-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/QA-CARGA-MANUAL-FIXTURES-SETUP-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/QA-CARGA-MANUAL-FIXTURES-CLEANUP-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/QA-CARGA-MANUAL-POSTCLEANUP-V3.2-2026-07-19.sql',
];
const aclPins = [
  "has_schema_privilege('anon','public','USAGE') is not true",
  "has_schema_privilege('authenticated','public','USAGE') is not true",
  "has_schema_privilege('authenticated','auth','USAGE') is not true",
  "has_function_privilege('authenticated','auth.uid()','EXECUTE') is not true",
  "has_function_privilege('authenticated','auth.jwt()','EXECUTE') is not true",
];
for (const name of m2ContractFiles) {
  const source = loadedSql.get(name);
  for (const pin of aclPins) {
    if (!source.includes(pin)) fail(`${name}: falta guarda ACL ${pin}`);
  }
  for (const pin of [
    "column_name='vence_atribucion_at'",
    "data_type='timestamp with time zone'",
    "udt_name='timestamptz'",
    "is_nullable='YES' and column_default is null",
  ]) {
    if (!source.includes(pin)) fail(`${name}: falta contrato de vence_atribucion_at ${pin}`);
  }
}

const contactColumnTuples = [
  "('id','uuid','pg_catalog','uuid','NO')",
  "('persona_id','uuid','pg_catalog','uuid','YES')",
  "('nombre','text','pg_catalog','text','NO')",
  "('email','text','pg_catalog','text','NO')",
  "('telefono','text','pg_catalog','text','YES')",
  "('mensaje','text','pg_catalog','text','YES')",
  "('estado','text','pg_catalog','text','YES')",
  "('canal_ref','text','pg_catalog','text','YES')",
  "('canal_via','text','pg_catalog','text','YES')",
  "('propiedad_id','uuid','pg_catalog','uuid','YES')",
  "('proyecto_slug','text','pg_catalog','text','YES')",
  "('fecha','timestamp with time zone','pg_catalog','timestamptz','YES')",
  "('created_at','timestamp with time zone','pg_catalog','timestamptz','YES')",
];
let contactManifestCount = 0;
let contactPreManifestCount = 0;
for (const name of m2ContractFiles) {
  const source = loadedSql.get(name);
  const pattern = /if \(select count\(\*\)\s+from information_schema\.columns c\s+join \(values([\s\S]*?)where c\.table_schema='public' and c\.table_name='contactos'\)<>(13|14) then/g;
  for (const match of source.matchAll(pattern)) {
    const [, body, expectedCountText] = match;
    const expectedCount = Number(expectedCountText);
    contactManifestCount += 1;
    if (expectedCount === 13) contactPreManifestCount += 1;
    for (const tuple of contactColumnTuples) {
      if (!body.includes(tuple)) fail(`${name}: manifiesto contactos omite ${tuple}`);
    }
    const origenTuple = "('origen','text','pg_catalog','text','NO')";
    if ((expectedCount === 14) !== body.includes(origenTuple)) {
      fail(`${name}: contrato de contactos/origen no corresponde al estado ${expectedCount}`);
    }
    const tupleCount = (body.match(/\('[^']+','[^']+','[^']+','[^']+','(?:YES|NO)'\)/g) || []).length;
    if (tupleCount !== expectedCount) fail(`${name}: manifiesto contactos declara ${tupleCount}, esperaba ${expectedCount}`);
  }
}
if (contactManifestCount !== 14 || contactPreManifestCount !== 2) {
  fail(`Manifiestos contactos: ${contactManifestCount} totales/${contactPreManifestCount} pre-M2; esperado 14/2`);
}

const normalizerMetadataFiles = m2ContractFiles.slice(0, 8);
for (const name of normalizerMetadataFiles) {
  const source = loadedSql.get(name);
  for (const pin of [
    "l.lanname='sql'", "l.lanname='plpgsql'", "p.prokind='f'",
    "p.prorettype='text'::regtype", 'p.proconfig is null',
    "p.proowner=(select oid from pg_roles where rolname='postgres')",
  ]) {
    if (!source.includes(pin)) fail(`${name}: metadata de normalizadores incompleta (${pin})`);
  }
}

const manualPolicyMatches = [];
for (const [name, source] of loadedSql) {
  for (const match of source.matchAll(/\$manual_policy\$([\s\S]*?)\$manual_policy\$/g)) {
    manualPolicyMatches.push([name, match[1]]);
  }
}
if (manualPolicyMatches.length !== 11) {
  fail(`Policy manual: ${manualPolicyMatches.length} literales; se esperaban 11`);
}
for (const [name, expression] of manualPolicyMatches) {
  if (Buffer.byteLength(expression, 'utf8') !== 635
      || sha256(expression) !== 'd4526bbf79f9879b2cdd77b664926a68c2c987d615873a059f8f86428ed63d92') {
    fail(`${name}: expresión canónica completa de policy manual derivó`);
  }
}

const functionSpecs = [
  ['docs/auditorias/sql/FORWARD-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.sql', 'referencias_principal_guard_v32', 'ffa6c3688355f0702f2ff3841577e38285284936b30db362718404b7c24faae9'],
  ['docs/auditorias/sql/FORWARD-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.sql', 'canales_principal_guard_v32', '1a96e8946519dd865280e2a3e5273dc5385f027949b3f6d464ab7f7ada31ce91'],
  ['docs/auditorias/sql/FORWARD-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.sql', 'canales_principal_sync_v32', '7cce323163ce798964e878ff47ad8235f0d0882b879465f58b1971a9277d68db'],
  ['docs/auditorias/sql/FORWARD-M2-CARGA-MANUAL-V3.2-2026-07-19.sql', 'contactos_insert_guard_v32', '9cc8d352a7866a778fad9bfeaea0c8a3b6dd7cc895fb1e56b52bd2aac12ef346'],
  ['docs/auditorias/sql/FORWARD-M2-CARGA-MANUAL-V3.2-2026-07-19.sql', 'contactos_inmutabilidad_guard_v32', '1034ea271845111331027807e4c3853b62ecf6b136f170688074a9d0ad7d274c'],
  ['docs/auditorias/sql/FORWARD-M2-CARGA-MANUAL-V3.2-2026-07-19.sql', 'validar_canal_ref', '5c6f02b09de0f3f51ced6dc6bb3e3c3809a38f214d962861fd93b359f6b1f010'],
  ['docs/auditorias/sql/FORWARD-M2-CARGA-MANUAL-V3.2-2026-07-19.sql', 'contactos_resolver_persona', '8690c806cf8e54e7c560b90697bf8df36eae852d27718f54ec1b81652d54951d'],
  ['docs/auditorias/sql/ROLLBACK-OPERACIONAL-M2-CARGA-MANUAL-V3.2-2026-07-19.sql', 'contactos_manual_kill_switch_v32', 'b42f361d762e993db50d2790f071ad559792dc2ab4ca4bac9f868c64c7904659'],
];
for (const [name, functionName, expected] of functionSpecs) {
  const actual = sha256(extractFunctionBody(loadedSql.get(name), functionName));
  if (actual !== expected) fail(`${functionName}: prosrc SHA-256 ${actual}, esperado ${expected}`);
}

const matrixName = 'docs/auditorias/qa/MATRIZ-CASOS-QA-CARGA-MANUAL-V3.2-2026-07-19.json';
const matrixSource = await read(matrixName);
const matrixHash = sha256(matrixSource);
const matrix = JSON.parse(matrixSource);
if (matrix.positiveCases?.length !== 16 || matrix.negativeCases?.length !== 21) fail('Matriz: no es 16/21');
const caseIds = [...matrix.positiveCases, ...matrix.negativeCases].map((item) => item.contactId);
if (new Set(caseIds).size !== 37) fail('Matriz: UUID de contacto duplicado');
if (matrix.negativeCases.find((item) => item.id === 'N01_ANON_MANUAL')?.expected?.httpStatus !== 401) {
  fail('Matriz: el rechazo anónimo 42501 debe mapear a HTTP 401');
}
if (matrix.supplementalAssertions?.immutability?.mutations?.length !== 13) {
  fail('Matriz: deben existir 13 mutaciones inmutables exactas');
}
if (matrix.supplementalAssertions?.crm?.stateTransition?.contactId !== '76c429fc-2f29-5670-9251-bf38811f0b72'
    || matrix.supplementalAssertions?.crm?.nonStatePatch?.notas_log?.length !== 1) {
  fail('Matriz: transición CRM única o notas_log derivaron');
}
const setup = loadedSql.get('docs/auditorias/sql/QA-CARGA-MANUAL-FIXTURES-SETUP-V3.2-2026-07-19.sql');
const cleanup = loadedSql.get('docs/auditorias/sql/QA-CARGA-MANUAL-FIXTURES-CLEANUP-V3.2-2026-07-19.sql');
const postcleanup = loadedSql.get('docs/auditorias/sql/QA-CARGA-MANUAL-POSTCLEANUP-V3.2-2026-07-19.sql');
const rollbackIds = [
  'e8c32884-81f4-4b28-a3e4-51635a9eb5d7',
  '558823b6-4ab3-43c6-aebd-94d87f51b8d9',
  'b432226a-940b-4be3-9d38-693c52c60f9b',
  '1afe86a3-3bfc-45ca-864c-aaa9cbf5cf50',
];
const defensiveIds = [
  '994740cd-954f-5301-9c2a-0692aef17a35',
  '3c508117-0e18-5d37-910b-40d381d32cd8',
];
for (const id of [...caseIds, ...defensiveIds, ...rollbackIds]) {
  if (![setup, cleanup, postcleanup].every((source) => source.includes(id))) fail(`Cleanup incompleto para ${id}`);
}
for (const id of ['d8cad352-94df-5924-a6ae-060309bb823f', '602fe12e-84e9-454c-9798-97c3197491c6']) {
  if (![setup, cleanup, postcleanup].every((source) => source.includes(id))) {
    fail(`Cobertura defensiva incompleta para segunda principal ${id}`);
  }
}
if (![setup, cleanup, postcleanup].every((source) => source.includes('qa-manual-negative-20260719-at-example.com'))) {
  fail('Cobertura incompleta para email malformado N18');
}

const runner = await read('scripts/qa-carga-manual-v32.mjs');
for (const required of [
  '--execute', '--phase=insert-cases', '--phase=supplemental', 'QA-2-APROBADA',
  'QA_ADMIN_USER_ID', 'QA_ACTIVO_USER_ID', 'return=minimal', 'PASS_LOCAL_ONLY_NO_NETWORK',
  'S02 historial completo de Persona', 'S06 Persona resuelta por email',
  'CRM non-state relectura', 'IMMUTABLE_IDENTICAL relectura',
  'la principal B derivó pese al rechazo esperado', '${attempt.id}_REREAD', matrixHash,
]) {
  if (!runner.includes(required)) fail(`Runner: falta guarda ${required}`);
}
if (runner.includes('return=representation')) fail('Runner: no debe exigir SELECT al INSERT anónimo');

const evergreenFiles = [
  'docs/auditorias/sql/POSTCHECK-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/POSTCHECK-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/ROLLBACK-OPERACIONAL-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/POSTCHECK-ROLLBACK-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/FORWARD-REACTIVAR-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/ROLLBACK-PREUSO-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
];
for (const name of evergreenFiles) {
  const source = loadedSql.get(name);
  if (/count\(\*\) from public\.canales\)\s*<>\s*55/i.test(source)
      || /count\(\*\) from public\.referencias\)\s*<>\s*108/i.test(source)) {
    fail(`${name}: un check operativo conserva snapshot fijo 55/108`);
  }
  if (!source.includes("count(*) from public.referencias where punto_tipo='principal')")) {
    fail(`${name}: falta invariante dinámica de principales`);
  }
}

const forwardM2 = loadedSql.get('docs/auditorias/sql/FORWARD-M2-CARGA-MANUAL-V3.2-2026-07-19.sql');
if (/drop\s+(?:trigger|function)\s+if\s+exists\s+(?:public\.)?(?:a0_contactos_manual_kill_switch_v32|contactos_manual_kill_switch_v32)/i.test(forwardM2)) {
  fail('M2 forward: no puede borrar un kill-switch homónimo sin identidad cerrada');
}
const baselineM2 = loadedSql.get('docs/auditorias/sql/PRECHECK-M2-CARGA-MANUAL-V3.2-2026-07-19.sql');
const postM2 = loadedSql.get('docs/auditorias/sql/POSTCHECK-M2-CARGA-MANUAL-V3.2-2026-07-19.sql');
const killedM2 = loadedSql.get('docs/auditorias/sql/POSTCHECK-ROLLBACK-M2-CARGA-MANUAL-V3.2-2026-07-19.sql');
for (const [label, source, total, triggerNames] of [
  ['baseline', baselineM2, 4, [
    'contactos_validar_canal', 'trg_crm_eventos_cambio_estado_auto',
    'trg_crm_eventos_ingreso', 'zz_contactos_resolver_persona',
  ]],
  ['activo', postM2, 6, [
    'aa_contactos_insert_guard_v32', 'ab_contactos_inmutabilidad_guard_v32',
    'contactos_validar_canal', 'trg_crm_eventos_cambio_estado_auto',
    'trg_crm_eventos_ingreso', 'zz_contactos_resolver_persona',
  ]],
  ['kill-switch', killedM2, 7, [
    'a0_contactos_manual_kill_switch_v32', 'aa_contactos_insert_guard_v32',
    'ab_contactos_inmutabilidad_guard_v32', 'contactos_validar_canal',
    'trg_crm_eventos_cambio_estado_auto', 'trg_crm_eventos_ingreso',
    'zz_contactos_resolver_persona',
  ]],
]) {
  if (!new RegExp(`where t\\.tgrelid='public\\.contactos'::regclass and not t\\.tgisinternal\\)<>${total}`).test(source)) {
    fail(`Triggers contactos ${label}: falta total exacto ${total}`);
  }
  for (const triggerName of triggerNames) {
    if (!source.includes(`('${triggerName}',`)) fail(`Triggers contactos ${label}: falta ${triggerName}`);
  }
  if (!source.includes('pg_get_triggerdef(t.oid,true)=e.triggerdef')) {
    fail(`Triggers contactos ${label}: falta igualdad exacta de pg_get_triggerdef`);
  }
}
for (const name of [
  'docs/auditorias/sql/PRECHECK-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  'docs/auditorias/sql/FORWARD-M2-CARGA-MANUAL-V3.2-2026-07-19.sql',
  ...evergreenFiles.slice(1),
]) {
  const source = loadedSql.get(name);
  if (!source.includes('9459cf0d230a9e8ac9f743a08e805f4795aa61a249857171f6a32329a3a03155')
      || !source.includes('250c24bdf5f43457164e57f49dc1ee87fbc4245a1e1f02df3322f6946efc6349')
      || !source.includes('relrowsecurity')
      || !source.includes("has_any_column_privilege('anon','public.persona_touches','SELECT')")
      || !source.includes("has_any_column_privilege('authenticated','public.persona_touches','SELECT')")) {
    fail(`${name}: falta pin de normalizadores o RLS`);
  }
}
if (!setup.includes('9459cf0d230a9e8ac9f743a08e805f4795aa61a249857171f6a32329a3a03155')
    || !setup.includes('250c24bdf5f43457164e57f49dc1ee87fbc4245a1e1f02df3322f6946efc6349')
    || !setup.includes("has_any_column_privilege('anon','public.persona_touches','SELECT')")
    || !setup.includes("has_any_column_privilege('authenticated','public.persona_touches','SELECT')")) {
  fail('QA setup: faltan pins de normalizadores/ACL');
}
for (const required of ['v_persona_ids', '48e2aacb-f85b-562e-bfda-c6f7c2eec532',
  'lower(btrim(email))=any(v_emails)', 'id=any(v_persona_ids)']) {
  if (!cleanup.includes(required)) fail(`QA cleanup: falta cobertura selectiva ${required}`);
}
const rollbackPost = loadedSql.get('docs/auditorias/sql/POSTCHECK-ROLLBACK-M2-CARGA-MANUAL-V3.2-2026-07-19.sql');
for (const required of [
  'a_referencias_principal_guard_v32', 'a0_referencias_principal_truncate_guard_v32',
  'a_canales_principal_guard_v32', 'a0_canales_principal_truncate_guard_v32',
  'z_canales_principal_sync_v32', 'trg_crm_eventos_ingreso',
  'trg_crm_eventos_cambio_estado_auto', 'PARTITION BY c.persona_id',
  '37c626728cce97a4c3a2ae6725f7459bda1d06bc892ab9c3254a5463c172daaa',
]) {
  if (!rollbackPost.includes(required)) fail(`Postcheck rollback M2: falta ${required}`);
}

const rollbackM1 = loadedSql.get('docs/auditorias/sql/ROLLBACK-PREUSO-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.sql');
for (const pin of aclPins) {
  if (!rollbackM1.includes(pin)) fail(`Rollback M1: falta guarda ACL copiada ${pin}`);
}
for (const required of [
  'b42f361d762e993db50d2790f071ad559792dc2ab4ca4bac9f868c64c7904659',
  'a65db406aa0e171a5b9270c43d0912d98cb7b26dfd3070f6d32c72dbe60aa03f',
  '9459cf0d230a9e8ac9f743a08e805f4795aa61a249857171f6a32329a3a03155',
  '250c24bdf5f43457164e57f49dc1ee87fbc4245a1e1f02df3322f6946efc6349',
  '9cc8d352a7866a778fad9bfeaea0c8a3b6dd7cc895fb1e56b52bd2aac12ef346',
  '1034ea271845111331027807e4c3853b62ecf6b136f170688074a9d0ad7d274c',
  '5c6f02b09de0f3f51ced6dc6bb3e3c3809a38f214d962861fd93b359f6b1f010',
  '8690c806cf8e54e7c560b90697bf8df36eae852d27718f54ec1b81652d54951d',
  'e38a3f5d4d9aec76c69619f3d230ce4a83e042bfe9080546390cea3096647980',
  'fefa431bccb39536544751915221f19695921e3f8ba417bad485c98818edd654',
  "where c.table_schema='public' and c.table_name='contactos')<>14",
  "column_name='vence_atribucion_at'", "column_default is null",
  "where t.tgrelid='public.contactos'::regclass and not t.tgisinternal)<>7",
  'a0_contactos_manual_kill_switch_v32,aa_contactos_insert_guard_v32,contactos_validar_canal,zz_contactos_resolver_persona',
  'Conjunto y orden exactos de triggers operacionales de contactos derivaron',
  'PARTITION BY c.persona_id', 'referencias_pkey',
]) {
  if (!rollbackM1.includes(required)) fail(`Rollback M1: falta cobertura M2/M1 ${required}`);
}
const rollbackPostBody = extractTaggedBody(rollbackPost, 'check');
const rollbackPostBegin = rollbackPostBody.search(/\bbegin\b/i);
const rollbackPostEnd = rollbackPostBody.toLowerCase().lastIndexOf('end;');
if (rollbackPostBegin < 0 || rollbackPostEnd < 0 || rollbackPostEnd <= rollbackPostBegin) {
  fail('Postcheck rollback M2: no se pudo aislar el bloque ejecutable');
}
const rollbackPostLogic = rollbackPostBody.slice(rollbackPostBegin + 'begin'.length, rollbackPostEnd);
const rollbackM1Comparable = extractTaggedBody(rollbackM1, 'rollback_guard')
  .replaceAll('and t.tgnargs=0', '');
if (!containsTokenSequence(sqlTokens(rollbackM1Comparable), sqlTokens(rollbackPostLogic))) {
  fail('Rollback M1: el bloque completo del postcheck kill-switch M2 no está contenido');
}

const documentationFiles = [
  'docs/auditorias/BASELINE-COMPUERTA-2-CARGA-MANUAL-LEADS-V3.2-2026-07-19.md',
  'docs/auditorias/MANIFIESTO-M1-REFERENCIAS-PRINCIPALES-V3.2-2026-07-19.md',
  'docs/auditorias/MANIFIESTO-FIXTURES-QA-CARGA-MANUAL-V3.2-2026-07-19.md',
  'docs/auditorias/PLAN-QA-ACTIVA-CARGA-MANUAL-V3.2-2026-07-19.md',
  'docs/auditorias/PLAN-QA-ROLLBACKS-CARGA-MANUAL-V3.2-2026-07-19.md',
  'docs/auditorias/snapshots/CANALES-BASELINE-M1-V3.2-2026-07-19.ndjson',
  'docs/auditorias/snapshots/REFERENCIAS-BASELINE-M1-V3.2-2026-07-19.ndjson',
];
const documentationSources = await Promise.all(documentationFiles.map(read));
const allSources = [brief, ...documentationSources, ...loadedSql.values(), matrixSource, runner].join('\n');
if (/(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+)/i.test(allSources)) {
  fail('El paquete contiene material con forma de secreto');
}
for (const match of allSources.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
  const email = match[0].toLowerCase();
  if (!email.startsWith('qa-') || !email.endsWith('@example.com')) {
    fail('El paquete contiene un email que no pertenece a la allowlist QA example.com');
  }
}
if (/[a-z0-9._%+-]{3,}(?:gmail|hotmail|outlook|yahoo|icloud|protonmail|live)com/i.test(allSources)) {
  fail('El paquete contiene un email de proveedor codificado reversiblemente');
}
const referencesSnapshot = await read('docs/auditorias/snapshots/REFERENCIAS-BASELINE-M1-V3.2-2026-07-19.ndjson');
const redactionMarker = '[PII_REDACTED_SHA256:70ea85cd1a37ec209cd4357eb402f8e9d4d43311e7675e179d6272dd61eb1581]';
if (referencesSnapshot.split(redactionMarker).length !== 2) {
  fail('Snapshot referencias: la redacción PII cerrada falta o aparece más de una vez');
}

process.stdout.write(`${JSON.stringify({
  result: 'PASS_LOCAL_ONLY_NO_NETWORK',
  briefSha256: sha256(brief),
  sqlFiles: sqlFiles.length,
  matrix: { positive: 16, negative: 21 },
  snapshots: { canales: 55, referencias: 72 },
  functionBodyHashes: functionSpecs.length,
}, null, 2)}\n`);
