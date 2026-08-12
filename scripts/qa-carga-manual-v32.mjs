#!/usr/bin/env node

/**
 * Runner local, preparado y no ejecutado, para la matriz QA Carga Manual V3.2.
 *
 * Por defecto sólo valida el artefacto local. No hace red ni escribe archivos.
 * Una futura ejecución remota contra un proyecto aislado, nunca producción,
 * exige, de manera acumulativa:
 *   --execute --phase=insert-cases
 *   QA_CARGA_MANUAL_V32_APPROVAL=QA-2-APROBADA
 *   SUPABASE_URL, SUPABASE_ANON_KEY, QA_ADMIN_USER_ID, QA_ACTIVO_USER_ID
 *   y los JWT QA efímeros indicados abajo.
 *
 * Este runner no crea cuentas, no cambia app_metadata, no ejecuta SQL, no hace
 * cleanup, deploy, commit, push ni operaciones Cloudflare. Los JWT frescos para
 * los estados temporales de B deben ser emitidos fuera del runner por la vía
 * Auth Admin aprobada y sólo se leen desde memoria de proceso.
 */

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_MATRIX = path.join(
  REPO_ROOT,
  'docs/auditorias/qa/MATRIZ-CASOS-QA-CARGA-MANUAL-V3.2-2026-07-19.json',
);
const EXECUTION_ACK = 'QA-2-APROBADA';
const MATRIX_SHA256 = '8bc08051f24899252ba55399e2eadf2419938262780ac86347882e35dae024fb';
const PRODUCTION_PROJECT_REF = 'wajkfydxutptcvvfwrvq';

const ACTOR_ENV = Object.freeze({
  anon: 'SUPABASE_ANON_KEY',
  admin: 'QA_ADMIN_ACCESS_TOKEN',
  activo: 'QA_ACTIVO_ACCESS_TOKEN',
  activo_user_metadata_spoofed: 'QA_ACTIVO_USER_METADATA_SPOOFED_ACCESS_TOKEN',
  activo_temporal_pasivo: 'QA_ACTIVO_TEMPORAL_PASIVO_ACCESS_TOKEN',
  activo_temporal_desarrollador: 'QA_ACTIVO_TEMPORAL_DESARROLLADOR_ACCESS_TOKEN',
});

const argv = new Set(process.argv.slice(2));
const valueArg = (prefix) => {
  const item = [...argv].find((arg) => arg.startsWith(`${prefix}=`));
  return item ? item.slice(prefix.length + 1) : null;
};
const matrixPath = path.resolve(valueArg('--matrix') || DEFAULT_MATRIX);
const shouldExecute = argv.has('--execute');
const shouldList = argv.has('--list');
const phase = valueArg('--phase');

const fail = (message) => {
  throw new Error(message);
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : null;

function projectRefFromSupabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('SUPABASE_URL no es una URL válida; no se inicia ninguna request');
  }
  const match = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
  if (parsed.protocol !== 'https:' || !match || (parsed.pathname !== '/' && parsed.pathname !== '')) {
    fail('SUPABASE_URL debe ser la raíz HTTPS de un proyecto Supabase; no se inicia ninguna request');
  }
  return match[1];
}

function decodeJwtPayload(jwt, actor) {
  const parts = jwt.split('.');
  if (parts.length !== 3) fail(`El token de ${actor} no tiene formato JWT`);
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    fail(`No se pudo decodificar localmente el JWT de ${actor}`);
  }
}

function validateActorClaims(actor, claims, { issuer, projectRef, adminUserId, activoUserId }) {
  if (actor === 'anon') {
    if (claims.role !== 'anon') fail('SUPABASE_ANON_KEY no declara role=anon');
    const legacyIssuerOk = claims.iss === 'supabase' && claims.ref === projectRef;
    const authIssuerOk = claims.iss === issuer && (!claims.ref || claims.ref === projectRef);
    if (!legacyIssuerOk && !authIssuerOk) fail('SUPABASE_ANON_KEY no pertenece al project ref esperado');
    return;
  }

  const app = claims.app_metadata || {};
  const isAdmin = actor === 'admin';
  const expectedSub = isAdmin ? adminUserId : activoUserId;
  const expectedEmail = isAdmin
    ? 'qa-carga-manual-admin-20260719@example.com'
    : 'qa-carga-manual-activo-20260719@example.com';
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== issuer || claims.role !== 'authenticated' || !aud.includes('authenticated')) {
    fail(`El JWT de ${actor} no declara issuer/role/audience del proyecto esperado`);
  }
  if (claims.sub !== expectedSub || normalizeEmail(claims.email) !== expectedEmail) {
    fail(`El JWT de ${actor} no pertenece a la cuenta QA reservada esperada`);
  }
  if (actor === 'admin' && app.rol !== 'admin') {
    fail('QA_ADMIN_ACCESS_TOKEN no declara app_metadata.rol=admin');
  }
  if (actor === 'activo' && (app.rol !== 'colaborador' || app.tipo_acceso !== 'activo')) {
    fail('QA_ACTIVO_ACCESS_TOKEN no declara colaborador/activo');
  }
  if (actor === 'activo_user_metadata_spoofed') {
    const user = claims.user_metadata || {};
    if (app.rol !== 'colaborador' || app.tipo_acceso !== 'activo') {
      fail('El JWT spoofed debe conservar app_metadata colaborador/activo');
    }
    if (user.rol !== 'admin' || user.tipo_acceso !== 'desarrollador') {
      fail('El JWT spoofed no contiene el user_metadata no confiable previsto');
    }
  }
  if (actor === 'activo_temporal_pasivo' && (app.rol !== 'colaborador' || app.tipo_acceso !== 'pasivo')) {
    fail('El JWT temporal pasivo no declara colaborador/pasivo');
  }
  if (actor === 'activo_temporal_desarrollador') {
    if (app.rol !== 'colaborador' || app.tipo_acceso !== 'desarrollador' || app.proyecto_slug) {
      fail('El JWT temporal desarrollador debe ser colaborador/desarrollador sin proyecto_slug');
    }
  }
  if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now() + 60_000) {
    fail(`El JWT de ${actor} está vencido o expira en menos de 60 segundos`);
  }
}

function validateMatrix(matrix) {
  if (matrix.schemaVersion !== '1.0.0') fail('schemaVersion inesperada');
  if (matrix.matrixId !== 'qa-carga-manual-v3.2-2026-07-19') fail('matrixId inesperado');
  if (matrix.projectRef !== 'wajkfydxutptcvvfwrvq') fail('projectRef inesperado');
  if (matrix.state !== 'PREPARADO_NO_EJECUTADO') fail('La matriz no está marcada PREPARADO_NO_EJECUTADO');
  if (!Array.isArray(matrix.positiveCases) || matrix.positiveCases.length !== 16) {
    fail(`Se esperaban 16 positivos; hay ${matrix.positiveCases?.length ?? 'ninguno'}`);
  }
  if (!Array.isArray(matrix.negativeCases) || matrix.negativeCases.length !== 21) {
    fail(`Se esperaban 21 negativos; hay ${matrix.negativeCases?.length ?? 'ninguno'}`);
  }

  const cases = [...matrix.positiveCases, ...matrix.negativeCases];
  const caseIds = new Set();
  const contactIds = new Set();
  for (const testCase of cases) {
    if (!testCase.id || caseIds.has(testCase.id)) fail(`case id inválido/duplicado: ${testCase.id}`);
    if (!testCase.contactId || contactIds.has(testCase.contactId)) {
      fail(`contactId inválido/duplicado: ${testCase.contactId}`);
    }
    if (!(testCase.actor in ACTOR_ENV)) fail(`Actor desconocido en ${testCase.id}: ${testCase.actor}`);
    if (!isObject(testCase.expected) || !Number.isInteger(testCase.expected.httpStatus)) {
      fail(`Status esperado faltante en ${testCase.id}`);
    }
    if (!Object.hasOwn(testCase.expected, 'sqlstate')) fail(`SQLSTATE esperado faltante en ${testCase.id}`);
    if (!isObject(testCase.expected.delta)) fail(`Delta esperado faltante en ${testCase.id}`);
    for (const required of ['contactos', 'crm_eventos']) {
      if (!Object.hasOwn(testCase.expected.delta, required)) {
        fail(`Delta ${required} faltante en ${testCase.id}`);
      }
    }
    if (testCase.id.startsWith('N') && testCase.expected.delta.personas !== 0) {
      fail(`Negativo ${testCase.id} debe declarar personas=0`);
    }
    caseIds.add(testCase.id);
    contactIds.add(testCase.contactId);
  }

  const positivesById = new Map(matrix.positiveCases.map((item) => [item.id, item]));
  if (!Array.isArray(matrix.concurrencyGroups) || matrix.concurrencyGroups.length !== 1) {
    fail('Debe existir exactamente un grupo de concurrencia');
  }
  const group = matrix.concurrencyGroups[0];
  if (group.caseIds.length !== 2 || group.caseIds.some((id) => !positivesById.has(id))) {
    fail('El grupo de concurrencia debe referir exactamente dos positivos existentes');
  }
  const groupDelta = group.expected?.delta;
  if (groupDelta?.contactos !== 2 || groupDelta?.personas !== 1 || groupDelta?.crm_eventos !== 2) {
    fail('El delta de concurrencia debe ser contactos=2/personas=1/eventos=2');
  }

  const fixture = matrix.fixtureConstants;
  const exactConstants = [
    fixture.marker === '[QA-CARGA-MANUAL-V3.2-20260719]',
    fixture.phone === '+5491100000000',
    fixture.channels.admin.id === 'e4b76929-a737-5286-a3e2-b0a4c25ff317',
    fixture.channels.activo.id === 'ff339da5-6615-5285-852a-1e11c6f734e4',
    fixture.references.activoSlot.id === 'cd6a556e-cf8f-5f7e-970d-182d69eba3c0',
    fixture.references.activoInactive.id === 'ab7d1c50-ca9d-5a16-8436-3c177f6e2151',
    fixture.orphanPersona.id === '203c2fad-cb5d-5732-be28-5e8d9ab2f1a4',
    fixture.destinations.activePropertyId === '0d9a4e83-af9b-4d0b-820f-f73314c2df6e',
    fixture.destinations.inactivePropertyId === '1b6d19b4-b5c4-4a85-8564-bd29fa65f0e1',
    fixture.destinations.activeProjectSlug === 'alamos',
    fixture.legacyExpiryDigest === '37c626728cce97a4c3a2ae6725f7459bda1d06bc892ab9c3254a5463c172daaa',
  ];
  if (exactConstants.some((ok) => !ok)) fail('Una o más constantes exactas derivaron del manifiesto/SQL');

  const i03 = matrix.supplementalAssertions?.principalInvariant
    ?.find((item) => item.id === 'I03_RECLASSIFY_MOVE_CODE');
  const expectedPrincipalB = {
    canal_id: fixture.channels.activo.id,
    codigo: fixture.channels.activo.code,
    punto_tipo: 'principal',
  };
  const expectedI03Attempts = [
    { id: 'I03A_PUNTO_TIPO_NO_PRINCIPAL', payload: { punto_tipo: 'mostrador' } },
    { id: 'I03B_MOVER_CANAL', payload: { canal_id: fixture.channels.admin.id } },
    { id: 'I03C_CAMBIAR_CODIGO', payload: { codigo: '__qa-mutated-code__' } },
  ];
  if (!i03
      || JSON.stringify(i03.endpointResolve) !== JSON.stringify(expectedPrincipalB)
      || JSON.stringify(i03.attempts) !== JSON.stringify(expectedI03Attempts)
      || i03.eachExpected?.httpStatus !== 400
      || i03.eachExpected?.sqlstate !== '23514'
      || JSON.stringify(i03.rowAfterEach) !== JSON.stringify(expectedPrincipalB)) {
    fail('I03 debe atacar por separado la principal B y exigir 400/23514 sin deriva de su triple exacta');
  }

  const identicalExpected = matrix.supplementalAssertions?.immutability?.identicalValueExpected;
  if (identicalExpected?.httpStatus !== 204
      || identicalExpected?.sqlstate !== null
      || identicalExpected?.rowUnchanged !== true
      || identicalExpected?.delta?.crm_eventos !== 0) {
    fail('IMMUTABLE_IDENTICAL debe exigir 204, fila exacta sin cambios y cero delta CRM');
  }

  const inspectKeys = (value) => {
    if (Array.isArray(value)) return value.forEach(inspectKeys);
    if (!isObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (['service_role_key', 'refresh_token', 'password'].includes(key.toLowerCase())) {
        fail(`La matriz no debe contener el campo sensible ${key}`);
      }
      inspectKeys(child);
    }
  };
  inspectKeys(matrix);
  return { positive: 16, negative: 21, concurrencyGroups: 1, cases: cases.length };
}

class RestClient {
  constructor({ baseUrl, anonKey, actorTokens }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.anonKey = anonKey;
    this.actorTokens = actorTokens;
  }

  async request(actor, table, { method = 'GET', query = '', body, prefer } = {}) {
    const token = this.actorTokens[actor];
    if (!token) fail(`Falta token en memoria para ${actor}`);
    const response = await fetch(`${this.baseUrl}/rest/v1/${table}${query ? `?${query}` : ''}`, {
      method,
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { malformed_json: true }; }
    }
    return { status: response.status, sqlstate: isObject(data) ? data.code ?? null : null, data };
  }
}

function reservedEmails(matrix) {
  return [...new Set([
    ...Object.values(matrix.fixtureConstants.emails),
    matrix.fixtureConstants.orphanPersona.email,
  ].map(normalizeEmail).filter(Boolean))];
}

function allContactIds(matrix) {
  return [...matrix.positiveCases, ...matrix.negativeCases].map((item) => item.contactId);
}

const inFilter = (values) => `in.(${values.join(',')})`;

async function snapshot(client, matrix, contactIds = allContactIds(matrix)) {
  const actor = 'admin';
  const ids = contactIds;
  const [contacts, people, events] = await Promise.all([
    client.request(actor, 'contactos', { query: `id=${encodeURIComponent(inFilter(ids))}&select=id` }),
    client.request(actor, 'personas', { query: `email_norm=${encodeURIComponent(inFilter(reservedEmails(matrix)))}&select=id` }),
    client.request(actor, 'crm_eventos', { query: `contacto_id=${encodeURIComponent(inFilter(ids))}&select=id` }),
  ]);
  for (const [name, result] of Object.entries({ contacts, people, events })) {
    if (result.status !== 200 || !Array.isArray(result.data)) fail(`Snapshot ${name} falló con HTTP ${result.status}`);
  }
  return { contactos: contacts.data.length, personas: people.data.length, crm_eventos: events.data.length };
}

const subtract = (after, before) => ({
  contactos: after.contactos - before.contactos,
  personas: after.personas - before.personas,
  crm_eventos: after.crm_eventos - before.crm_eventos,
});

function buildPayload(matrix, testCase) {
  if (testCase.payloadMode === 'web_origin_omitted') {
    return { id: testCase.contactId, ...testCase.payload };
  }
  return {
    ...matrix.defaults.manualPayload,
    id: testCase.contactId,
    ...testCase.payload,
  };
}

function expectedPersonDelta(testCase) {
  const value = testCase.expected.delta.personas;
  return Number.isInteger(value) ? value : null;
}

function assertTransport(testCase, result) {
  if (result.status !== testCase.expected.httpStatus || result.sqlstate !== testCase.expected.sqlstate) {
    fail(`${testCase.id}: esperado HTTP/SQLSTATE ${testCase.expected.httpStatus}/${testCase.expected.sqlstate}; recibido ${result.status}/${result.sqlstate}`);
  }
}

function assertDelta(testCase, delta, { group = false } = {}) {
  const expected = testCase.expected.delta;
  if (delta.contactos !== expected.contactos || delta.crm_eventos !== expected.crm_eventos) {
    fail(`${testCase.id}: delta contacto/evento inesperado ${JSON.stringify(delta)}`);
  }
  const personExpected = expectedPersonDelta(testCase);
  if (!group && personExpected !== null && delta.personas !== personExpected) {
    fail(`${testCase.id}: delta Persona esperado ${personExpected}; recibido ${delta.personas}`);
  }
}

async function readCreatedRow(client, testCase) {
  const result = await client.request('admin', 'contactos', {
    query: `id=eq.${testCase.contactId}&select=id,persona_id,origen,estado,canal_ref,canal_via,propiedad_id,proyecto_slug,fecha,created_at`,
  });
  if (result.status !== 200 || !Array.isArray(result.data) || result.data.length !== 1) {
    fail(`${testCase.id}: no se releyó exactamente una consulta por UUID`);
  }
  return result.data[0];
}

async function assertExpectedRow(client, testCase, requestWindow) {
  const expected = testCase.expected.row;
  if (!expected) return;
  const row = await readCreatedRow(client, testCase);
  for (const [key, value] of Object.entries(expected)) {
    if (['reingreso', 'reingreso_order', 'email_norm', 'vence_atribucion_at', 'persona_distinct_from_case'].includes(key)) continue;
    if (key.endsWith('_not')) {
      const column = key.slice(0, -4);
      if (row[column] === value) fail(`${testCase.id}: ${column} conservó el valor cliente prohibido`);
      continue;
    }
    if (key === 'persona_id_not') {
      if (row.persona_id === value) fail(`${testCase.id}: el resolver conservó persona_id ajeno`);
      continue;
    }
    if (row[key] !== value) fail(`${testCase.id}: fila.${key} no coincide con lo esperado`);
  }
  if (requestWindow && (Object.hasOwn(expected, 'created_at_not') || Object.hasOwn(expected, 'fecha_not'))) {
    for (const column of ['created_at', 'fecha']) {
      const timestamp = Date.parse(row[column]);
      if (!Number.isFinite(timestamp)
          || timestamp < requestWindow.startMs - requestWindow.toleranceMs
          || timestamp > requestWindow.endMs + requestWindow.toleranceMs) {
        fail(`${testCase.id}: ${column} no quedó dentro de la ventana server-side aprobada`);
      }
    }
  }
  if (Object.hasOwn(expected, 'vence_atribucion_at') || expected.email_norm) {
    const person = await client.request('admin', 'personas', {
      query: `id=eq.${row.persona_id}&select=id,email_norm,vence_atribucion_at`,
    });
    if (person.status !== 200 || !Array.isArray(person.data) || person.data.length !== 1) {
      fail(`${testCase.id}: Persona resuelta no legible de forma exacta`);
    }
    if (Object.hasOwn(expected, 'vence_atribucion_at') && person.data[0].vence_atribucion_at !== expected.vence_atribucion_at) {
      fail(`${testCase.id}: vence_atribucion_at no coincide`);
    }
    if (expected.email_norm && person.data[0].email_norm !== expected.email_norm) {
      fail(`${testCase.id}: email_norm no coincide`);
    }
  }
}

async function runOne(client, matrix, testCase) {
  const before = await snapshot(client, matrix, [testCase.contactId]);
  const startMs = Date.now();
  const result = await client.request(testCase.actor, 'contactos', {
    method: 'POST',
    body: buildPayload(matrix, testCase),
    prefer: 'return=minimal',
  });
  const endMs = Date.now();
  assertTransport(testCase, result);
  const after = await snapshot(client, matrix, [testCase.contactId]);
  const delta = subtract(after, before);
  assertDelta(testCase, delta);
  if (testCase.expected.httpStatus === 201) {
    await assertExpectedRow(client, testCase, { startMs, endMs, toleranceMs: 30_000 });
  }
  return { id: testCase.id, status: result.status, sqlstate: result.sqlstate, delta, result: 'PASS' };
}

async function runConcurrencyGroup(client, matrix, group) {
  const cases = group.caseIds.map((id) => matrix.positiveCases.find((item) => item.id === id));
  const ids = cases.map((item) => item.contactId);
  const before = await snapshot(client, matrix, ids);
  const results = await Promise.all(cases.map((testCase) => client.request(testCase.actor, 'contactos', {
    method: 'POST',
    body: buildPayload(matrix, testCase),
    prefer: 'return=minimal',
  })));
  results.forEach((result, index) => assertTransport(cases[index], result));
  const after = await snapshot(client, matrix, ids);
  const delta = subtract(after, before);
  const expected = group.expected.delta;
  if (delta.contactos !== expected.contactos || delta.personas !== expected.personas || delta.crm_eventos !== expected.crm_eventos) {
    fail(`${group.id}: delta agregado inesperado ${JSON.stringify(delta)}`);
  }
  const rows = await Promise.all(cases.map((testCase) => readCreatedRow(client, testCase)));
  if (!rows[0].persona_id || rows[0].persona_id !== rows[1].persona_id) {
    fail(`${group.id}: las dos consultas no resolvieron una única Persona`);
  }
  return cases.map((testCase, index) => ({
    id: testCase.id,
    status: results[index].status,
    sqlstate: results[index].sqlstate,
    delta: { contactos: 1, personas: 'aggregate=1', crm_eventos: 1 },
    result: 'PASS',
  }));
}

function assertHttp(label, result, httpStatus, sqlstate = null) {
  if (result.status !== httpStatus || result.sqlstate !== sqlstate) {
    fail(`${label}: esperado HTTP/SQLSTATE ${httpStatus}/${sqlstate}; recibido ${result.status}/${result.sqlstate}`);
  }
}

async function getRows(client, actor, table, query, label) {
  const result = await client.request(actor, table, { query });
  if (result.status !== 200 || !Array.isArray(result.data)) {
    fail(`${label}: lectura esperada falló con HTTP ${result.status}`);
  }
  return result.data;
}

async function exactContact(client, id, select, label) {
  const rows = await getRows(client, 'admin', 'contactos', `id=eq.${id}&select=${select}`, label);
  if (rows.length !== 1) fail(`${label}: se esperaba exactamente una consulta`);
  return rows[0];
}

async function eventCount(client, ids) {
  const rows = await getRows(
    client,
    'admin',
    'crm_eventos',
    `contacto_id=${encodeURIComponent(inFilter(ids))}&select=id`,
    'conteo CRM',
  );
  return rows.length;
}

async function executeSupplemental(matrix) {
  const client = loadRuntime(matrix);
  const evidence = [];
  const positiveIds = matrix.positiveCases.map((item) => item.contactId);
  const negativeIds = matrix.negativeCases.map((item) => item.contactId);

  const positives = await getRows(
    client,
    'admin',
    'contactos',
    `id=${encodeURIComponent(inFilter(positiveIds))}&select=id,persona_id,canal_ref,origen,estado,created_at,fecha`,
    'S01 contactos positivos',
  );
  const negatives = await getRows(
    client,
    'admin',
    'contactos',
    `id=${encodeURIComponent(inFilter([...negativeIds, matrix.fixtureConstants.defensiveIds.mutatedContact]))}&select=id`,
    'S01 contactos negativos',
  );
  const people = await getRows(
    client,
    'admin',
    'personas',
    `email_norm=${encodeURIComponent(inFilter(reservedEmails(matrix)))}&select=id,email_norm,vence_atribucion_at`,
    'S01 Personas',
  );
  if (positives.length !== 16 || negatives.length !== 0 || people.length !== 11
      || await eventCount(client, positiveIds) !== 16) {
    fail('S01: total cerrado 16 consultas/11 Personas/16 ingresos no coincide');
  }
  if (people.some((person) => person.vence_atribucion_at !== null)) {
    fail('S05: una Persona QA nueva recibió vencimiento automático');
  }
  evidence.push({ id: 'S01_TOTALS_S05_EXPIRIES', result: 'PASS' });

  const reentryIds = ['b8c859cc-4c68-5694-bdc0-7ec66eaaade5', 'f118dad2-89be-5fbb-864d-216f64cb8ec2', '00133a67-a91d-5607-a1d4-37cea1db8fba'];
  const reentries = await getRows(
    client,
    'admin',
    'contactos',
    `id=${encodeURIComponent(inFilter(reentryIds))}&select=id,persona_id,canal_ref,created_at&order=created_at.asc,id.asc`,
    'S02 Reingreso',
  );
  if (reentries.length !== 3 || new Set(reentries.map((row) => row.persona_id)).size !== 1
      || JSON.stringify(reentries.map((row) => row.canal_ref)) !== JSON.stringify([null, 'qa-manual-admin-20260719', 'qa-manual-activo-20260719'])) {
    fail('S02: historial/reingreso/canales no coincide con el orden estable');
  }
  const fullPersonaHistory = await getRows(
    client,
    'admin',
    'contactos',
    `persona_id=eq.${reentries[0].persona_id}&select=id,created_at&order=created_at.asc,id.asc`,
    'S02 historial completo de Persona',
  );
  const reentrySpec = matrix.supplementalAssertions.afterPositiveInserts.find((item) => item.id === 'S02_REENTRY')?.expected;
  const derivedFlags = fullPersonaHistory.map((_, index) => index > 0);
  if (JSON.stringify(fullPersonaHistory.map((row) => row.id)) !== JSON.stringify(reentryIds)
      || JSON.stringify(derivedFlags) !== JSON.stringify(reentrySpec?.reingresoFlags)) {
    fail('S02: los flags derivados de Reingreso no son false/true/true sobre el historial completo');
  }
  const samePhone = await getRows(
    client,
    'admin',
    'contactos',
    `id=${encodeURIComponent(inFilter(['b16c28dd-c27f-5ca3-9318-86db7ef440db', '390cebc8-3343-5a7c-aa48-a560a3691e7b']))}&select=id,persona_id,telefono`,
    'S03 teléfono no identidad',
  );
  if (samePhone.length !== 2 || samePhone[0].telefono !== samePhone[1].telefono
      || samePhone[0].persona_id === samePhone[1].persona_id) {
    fail('S03: el mismo teléfono no produjo dos Personas distintas');
  }
  const orphan = await exactContact(client, '6356e0d2-f539-51ef-961d-9762f83f18ae', 'id,persona_id', 'S04 Persona huérfana');
  const ignored = await exactContact(client, 'fe39c414-e2b4-549d-b550-c99f6dfc9f4a', 'id,persona_id', 'S06 persona_id cliente');
  const ignoredPerson = await getRows(
    client,
    'admin',
    'personas',
    `id=eq.${ignored.persona_id}&select=id,email_norm`,
    'S06 Persona resuelta por email',
  );
  const ignoredSpec = matrix.supplementalAssertions.afterPositiveInserts.find((item) => item.id === 'S06_PERSONA_ID_INPUT_IGNORED')?.expected;
  if (orphan.persona_id !== matrix.fixtureConstants.orphanPersona.id
      || ignored.persona_id === matrix.fixtureConstants.orphanPersona.id
      || ignoredPerson.length !== 1
      || ignoredPerson[0].email_norm !== ignoredSpec?.personaEmailNorm) {
    fail('S04/S06: resolución de Persona incorrecta');
  }
  evidence.push({ id: 'S02_TO_S06_PERSONA', result: 'PASS' });

  const immutable = matrix.supplementalAssertions.immutability;
  const immutableSelect = 'id,nombre,email,telefono,mensaje,persona_id,origen,canal_ref,canal_via,propiedad_id,proyecto_slug,fecha,created_at,estado,leido,notas_log';
  const immutableBefore = await exactContact(client, immutable.contactId, immutableSelect, 'inmutabilidad baseline');
  const immutableEvents = await eventCount(client, [immutable.contactId]);
  for (const mutation of immutable.mutations) {
    const result = await client.request('admin', 'contactos', {
      method: 'PATCH',
      query: `id=eq.${immutable.contactId}`,
      body: { [mutation.field]: mutation.attemptedValue },
      prefer: 'return=minimal',
    });
    assertHttp(`IMMUTABLE_${mutation.field}`, result, 400, '23514');
    const after = await exactContact(client, immutable.contactId, immutableSelect, `inmutabilidad ${mutation.field}`);
    if (JSON.stringify(after) !== JSON.stringify(immutableBefore)
        || await eventCount(client, [immutable.contactId]) !== immutableEvents) {
      fail(`IMMUTABLE_${mutation.field}: hubo delta pese al rechazo`);
    }
  }
  const identical = await client.request('admin', 'contactos', {
    method: 'PATCH', query: `id=eq.${immutable.contactId}`, body: { origen: immutableBefore.origen }, prefer: 'return=minimal',
  });
  assertHttp('IMMUTABLE_IDENTICAL', identical, 204, null);
  const identicalAfter = await exactContact(
    client,
    immutable.contactId,
    immutableSelect,
    'IMMUTABLE_IDENTICAL relectura',
  );
  if (JSON.stringify(identicalAfter) !== JSON.stringify(immutableBefore)
      || await eventCount(client, [immutable.contactId]) !== immutableEvents) {
    fail('IMMUTABLE_IDENTICAL: la fila o el conteo CRM cambió tras repetir un valor idéntico');
  }
  evidence.push({ id: 'IMMUTABILITY_13_PLUS_IDENTICAL', result: 'PASS' });

  const crm = matrix.supplementalAssertions.crm;
  const crmEventsBefore = await eventCount(client, [crm.nonStateContactId]);
  const crmPatch = await client.request('admin', 'contactos', {
    method: 'PATCH', query: `id=eq.${crm.nonStateContactId}`, body: crm.nonStatePatch, prefer: 'return=minimal',
  });
  assertHttp('CRM_NON_STATE', crmPatch, 204, null);
  const crmAfter = await exactContact(client, crm.nonStateContactId, immutableSelect, 'CRM non-state relectura');
  const captureKeys = [
    'id', 'nombre', 'email', 'telefono', 'mensaje', 'persona_id', 'origen', 'canal_ref',
    'canal_via', 'propiedad_id', 'proyecto_slug', 'fecha', 'created_at', 'estado',
  ];
  if (crmAfter.leido !== true
      || JSON.stringify(crmAfter.notas_log) !== JSON.stringify(crm.nonStatePatch.notas_log)
      || captureKeys.some((key) => JSON.stringify(crmAfter[key]) !== JSON.stringify(immutableBefore[key]))) {
    fail('CRM_NON_STATE: el PATCH no afectó exactamente leido/notas_log o alteró datos de captura');
  }
  if (await eventCount(client, [crm.nonStateContactId]) !== crmEventsBefore) {
    fail('CRM_NON_STATE: se generó un evento de estado indebido');
  }

  let channelArchived = false;
  try {
    const archive = await client.request('admin', 'canales', {
      method: 'PATCH', query: `id=eq.${crm.stateTransition.afterArchivingChannelId}`, body: { activo: false }, prefer: 'return=minimal',
    });
    assertHttp('CRM_ARCHIVE_CHANNEL', archive, 204, null);
    channelArchived = true;
    const archivedChannel = await getRows(client, 'admin', 'canales', `id=eq.${crm.stateTransition.afterArchivingChannelId}&select=id,activo`, 'canal archivado');
    const archivedPrincipal = await getRows(client, 'admin', 'referencias', `canal_id=eq.${crm.stateTransition.afterArchivingChannelId}&punto_tipo=eq.principal&select=id,activo`, 'principal archivada');
    if (archivedChannel.length !== 1 || archivedChannel[0].activo !== false
        || archivedPrincipal.length !== 1 || archivedPrincipal[0].activo !== false) {
      fail('I06: archivo no sincronizó canal/principal');
    }
    const directPrincipal = crm.archiveChannelBThenStateOnly.directPrincipalReactivationWhileArchived;
    const directPrincipalPatch = await client.request('admin', 'referencias', {
      method: 'PATCH', query: `id=eq.${archivedPrincipal[0].id}`,
      body: directPrincipal.payload, prefer: 'return=minimal',
    });
    assertHttp('I06_DIRECT_PRINCIPAL_WHILE_ARCHIVED', directPrincipalPatch,
      directPrincipal.expected.httpStatus, directPrincipal.expected.sqlstate);
    const principalAfterRejectedPatch = await getRows(client, 'admin', 'referencias',
      `id=eq.${archivedPrincipal[0].id}&select=id,activo`, 'principal tras PATCH directo rechazado');
    if (principalAfterRejectedPatch.length !== 1
        || principalAfterRejectedPatch[0].activo !== directPrincipal.expected.principalRemainsActive) {
      fail('I06_DIRECT_PRINCIPAL_WHILE_ARCHIVED: la principal cambió fuera del sync del canal');
    }
    const beforeStateEvents = await eventCount(client, [crm.stateTransition.contactId]);
    const statePatch = await client.request('admin', 'contactos', {
      method: 'PATCH', query: `id=eq.${crm.stateTransition.contactId}`, body: crm.stateTransition.patch, prefer: 'return=minimal',
    });
    assertHttp('CRM_STATE_AFTER_ARCHIVE', statePatch, 204, null);
    const historical = await exactContact(client, crm.stateTransition.contactId, 'id,estado,canal_ref', 'historia tras archivo');
    const stateEvents = await getRows(client, 'admin', 'crm_eventos', `contacto_id=eq.${crm.stateTransition.contactId}&tipo_evento=eq.cambio_estado_auto&select=tipo_evento,estado_anterior,estado_nuevo,canal_ref`, 'evento cambio estado');
    if (await eventCount(client, [crm.stateTransition.contactId]) !== beforeStateEvents + 1
        || stateEvents.length !== 1 || stateEvents[0].estado_anterior !== crm.stateTransition.from
        || stateEvents[0].estado_nuevo !== crm.stateTransition.to
        || historical.canal_ref !== crm.archiveChannelBThenStateOnly.expectedCanalRef) {
      fail('CRM_STATE_AFTER_ARCHIVE: evento o canal histórico incorrecto');
    }
  } finally {
    if (channelArchived) {
      const reactivate = await client.request('admin', 'canales', {
        method: 'PATCH', query: `id=eq.${crm.stateTransition.afterArchivingChannelId}`, body: { activo: true }, prefer: 'return=minimal',
      });
      assertHttp('CRM_REACTIVATE_CHANNEL', reactivate, 204, null);
      const activePair = await Promise.all([
        getRows(client, 'admin', 'canales', `id=eq.${crm.stateTransition.afterArchivingChannelId}&activo=is.true&select=id`, 'canal reactivado'),
        getRows(client, 'admin', 'referencias', `canal_id=eq.${crm.stateTransition.afterArchivingChannelId}&punto_tipo=eq.principal&activo=is.true&select=id`, 'principal reactivada'),
      ]);
      if (activePair[0].length !== 1 || activePair[1].length !== 1) fail('I06: reactivación no sincronizó canal/principal');
    }
  }
  if (await eventCount(client, positiveIds) !== 17) fail('CRM: total final no es 16 ingresos + 1 cambio');
  evidence.push({ id: 'CRM_AND_ARCHIVE_REACTIVATE', result: 'PASS' });

  const uniqueness = matrix.supplementalAssertions.personaUniqueness;
  const insertDuplicate = await client.request('admin', 'personas', {
    method: 'POST', body: uniqueness.attempts[0].payload, prefer: 'return=minimal',
  });
  assertHttp('PERSONA_DUPLICATE_INSERT', insertDuplicate, 409, '23505');
  const personaSource = await exactContact(client, '7a3173ba-8240-5751-9a2d-85024e53d98b', 'id,persona_id', 'Persona origen update duplicate');
  const updateDuplicate = await client.request('admin', 'personas', {
    method: 'PATCH', query: `id=eq.${personaSource.persona_id}`, body: uniqueness.attempts[1].payload, prefer: 'return=minimal',
  });
  assertHttp('PERSONA_DUPLICATE_UPDATE', updateDuplicate, 409, '23505');
  evidence.push({ id: 'PERSONA_UNIQUENESS_INSERT_UPDATE', result: 'PASS' });

  for (const invariant of matrix.supplementalAssertions.principalInvariant.filter((item) => item.method)) {
    if (invariant.id.startsWith('I02')) {
      const result = await client.request('admin', 'referencias', { method: invariant.method, body: invariant.payload, prefer: 'return=minimal' });
      assertHttp(invariant.id, result, invariant.expected.httpStatus, invariant.expected.sqlstate);
      continue;
    }
    if (invariant.id === 'I03_RECLASSIFY_MOVE_CODE') {
      const target = invariant.endpointResolve;
      const principal = await getRows(
        client,
        'admin',
        'referencias',
        `canal_id=eq.${target.canal_id}&codigo=eq.${encodeURIComponent(target.codigo)}&punto_tipo=eq.${target.punto_tipo}&select=id,canal_id,codigo,punto_tipo`,
        invariant.id,
      );
      if (principal.length !== 1) fail(`${invariant.id}: principal B no resolvió exactamente`);
      for (const attempt of invariant.attempts) {
        const result = await client.request('admin', 'referencias', {
          method: invariant.method,
          query: `id=eq.${principal[0].id}`,
          body: attempt.payload,
          prefer: 'return=minimal',
        });
        assertHttp(attempt.id, result, invariant.eachExpected.httpStatus, invariant.eachExpected.sqlstate);
        const after = await getRows(
          client,
          'admin',
          'referencias',
          `id=eq.${principal[0].id}&select=id,canal_id,codigo,punto_tipo`,
          `${attempt.id}_REREAD`,
        );
        const expected = invariant.rowAfterEach;
        if (after.length !== 1
            || after[0].canal_id !== expected.canal_id
            || after[0].codigo !== expected.codigo
            || after[0].punto_tipo !== expected.punto_tipo) {
          fail(`${attempt.id}: la principal B derivó pese al rechazo esperado`);
        }
      }
      continue;
    }
    const principal = await getRows(
      client,
      'admin',
      'referencias',
      `canal_id=eq.${matrix.fixtureConstants.channels.activo.id}&codigo=eq.${matrix.fixtureConstants.channels.activo.code}&punto_tipo=eq.principal&select=id`,
      invariant.id,
    );
    if (principal.length !== 1) fail(`${invariant.id}: principal B no resolvió exactamente`);
    const result = await client.request('admin', 'referencias', {
      method: invariant.method,
      query: `id=eq.${principal[0].id}`,
      ...(invariant.payload ? { body: invariant.payload } : {}),
      prefer: 'return=minimal',
    });
    assertHttp(invariant.id, result, invariant.expected.httpStatus, invariant.expected.sqlstate);
  }
  evidence.push({ id: 'PRINCIPAL_INVARIANT_NEGATIVES', result: 'PASS' });

  const privacyChecks = [
    ['R01', 'activo', 'contactos', 'id=eq.76c429fc-2f29-5670-9251-bf38811f0b72&select=id', 200, 1, null],
    ['R02', 'activo', 'contactos', 'id=eq.7a3173ba-8240-5751-9a2d-85024e53d98b&select=id', 200, 0, null],
    ['R03', 'activo', 'personas', 'select=id&limit=1', 200, 0, null],
    ['R04', 'activo', 'crm_eventos', 'contacto_id=eq.7a3173ba-8240-5751-9a2d-85024e53d98b&select=id', 200, 0, null],
    ['R05', 'activo', 'persona_touches', 'select=*&limit=1', 403, null, '42501'],
    ['R06P', 'activo_temporal_pasivo', 'personas', 'select=id&limit=1', 200, 0, null],
    ['R06P2', 'activo_temporal_pasivo', 'crm_eventos', 'select=id&limit=1', 200, 0, null],
    ['R06D', 'activo_temporal_desarrollador', 'personas', 'select=id&limit=1', 200, 0, null],
    ['R06D2', 'activo_temporal_desarrollador', 'crm_eventos', 'select=id&limit=1', 200, 0, null],
    ['R07A', 'activo_user_metadata_spoofed', 'contactos', 'id=eq.7a3173ba-8240-5751-9a2d-85024e53d98b&select=id', 200, 0, null],
    ['R07B', 'activo_user_metadata_spoofed', 'personas', 'select=id&limit=1', 200, 0, null],
    ['R07C', 'activo_user_metadata_spoofed', 'persona_touches', 'select=*&limit=1', 403, null, '42501'],
  ];
  for (const [id, actor, table, query, status, rows, sqlstate] of privacyChecks) {
    const result = await client.request(actor, table, { query });
    assertHttp(id, result, status, sqlstate);
    if (rows !== null && (!Array.isArray(result.data) || result.data.length !== rows)) {
      fail(`${id}: cantidad de filas privada inesperada`);
    }
  }
  evidence.push({ id: 'PRIVACY_R01_TO_R07', result: 'PASS' });

  process.stdout.write(`${JSON.stringify({
    matrixId: matrix.matrixId,
    phase: 'QA-2/supplemental',
    state: 'EXECUTED_REQUIRES_SQL_POSTCHECK_AND_STOP',
    pass: evidence.length,
    fail: 0,
    evidence,
  }, null, 2)}\n`);
}

function loadRuntime(matrix) {
  if (process.env.QA_CARGA_MANUAL_V32_APPROVAL !== EXECUTION_ACK) {
    fail(`Falta QA_CARGA_MANUAL_V32_APPROVAL=${EXECUTION_ACK}`);
  }
  const baseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) fail('Faltan SUPABASE_URL/SUPABASE_ANON_KEY');
  const targetProjectRef = projectRefFromSupabaseUrl(baseUrl);
  if (targetProjectRef === PRODUCTION_PROJECT_REF) {
    fail(`BLOQUEO DE SEGURIDAD E0: el runner QA no puede ejecutarse contra producción (${PRODUCTION_PROJECT_REF}); no se inició ninguna request`);
  }
  const expectedUrl = `https://${targetProjectRef}.supabase.co`;
  if (baseUrl.replace(/\/$/, '') !== expectedUrl) fail(`SUPABASE_URL debe ser exactamente ${expectedUrl}`);
  const adminUserId = process.env.QA_ADMIN_USER_ID;
  const activoUserId = process.env.QA_ACTIVO_USER_ID;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(adminUserId || '') || !uuid.test(activoUserId || '') || adminUserId === activoUserId) {
    fail('QA_ADMIN_USER_ID/QA_ACTIVO_USER_ID deben ser UUID distintos capturados al crear A/B');
  }
  const claimsContext = {
    issuer: `${expectedUrl}/auth/v1`,
    projectRef: targetProjectRef,
    adminUserId,
    activoUserId,
  };

  const requiredActors = new Set([...matrix.positiveCases, ...matrix.negativeCases].map((item) => item.actor));
  requiredActors.add('admin');
  const actorTokens = {};
  for (const actor of requiredActors) {
    const envName = ACTOR_ENV[actor];
    const token = process.env[envName];
    if (!token) fail(`Falta ${envName}; no se inicia ninguna request`);
    validateActorClaims(actor, decodeJwtPayload(token, actor), claimsContext);
    actorTokens[actor] = token;
  }
  return new RestClient({ baseUrl, anonKey, actorTokens });
}

async function executeInsertCases(matrix) {
  const client = loadRuntime(matrix);
  const evidence = [];
  const concurrencyIds = new Set(matrix.concurrencyGroups.flatMap((group) => group.caseIds));

  // Negativos primero: cualquier residuo aborta antes de crear los positivos.
  for (const testCase of matrix.negativeCases) evidence.push(await runOne(client, matrix, testCase));

  for (const testCase of matrix.positiveCases) {
    if (concurrencyIds.has(testCase.id)) continue;
    if (testCase.id === 'P12_TELEFONO_IGUAL_EMAIL_A') {
      evidence.push(...await runConcurrencyGroup(client, matrix, matrix.concurrencyGroups[0]));
    }
    evidence.push(await runOne(client, matrix, testCase));
  }

  // Salida sanitizada: jamás incluye payloads, respuestas, tokens, emails o UUIDs de Auth.
  process.stdout.write(`${JSON.stringify({
    matrixId: matrix.matrixId,
    phase: 'QA-2/insert-cases',
    state: 'EXECUTED_REQUIRES_SUPPLEMENTAL_ASSERTIONS_AND_STOP',
    pass: evidence.length,
    fail: 0,
    evidence,
  }, null, 2)}\n`);
}

async function main() {
  const raw = await readFile(matrixPath, 'utf8');
  if (createHash('sha256').update(raw).digest('hex') !== MATRIX_SHA256) {
    fail('La matriz ejecutable no coincide con su SHA-256 fijado en el runner');
  }
  const matrix = JSON.parse(raw);
  const summary = validateMatrix(matrix);

  if (shouldList) {
    const lines = [...matrix.positiveCases, ...matrix.negativeCases]
      .map((item) => `${item.id}\t${item.actor}\t${item.expected.httpStatus}\t${item.expected.sqlstate ?? '-'}`);
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }

  if (!shouldExecute) {
    process.stdout.write(`${JSON.stringify({
      matrixId: matrix.matrixId,
      state: matrix.state,
      validation: 'PASS_LOCAL_ONLY_NO_NETWORK',
      ...summary,
    }, null, 2)}\n`);
    return;
  }

  if (phase === 'insert-cases') await executeInsertCases(matrix);
  else if (phase === 'supplemental') await executeSupplemental(matrix);
  else fail('La ejecución remota sólo admite --phase=insert-cases o --phase=supplemental; setup/metadata/SQL/cleanup quedan fuera del runner');
}

main().catch((error) => {
  // Mensaje deliberadamente sanitizado: no imprime objetos request/response ni entorno.
  process.stderr.write(`QA runner abortado: ${error.message}\n`);
  process.exitCode = 1;
});
