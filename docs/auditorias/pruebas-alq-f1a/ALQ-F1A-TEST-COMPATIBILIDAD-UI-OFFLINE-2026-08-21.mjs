#!/usr/bin/env node
// Verificacion estatica/sintactica de los dos consumidores QA de ALQ F1-A.
// No carga URLs, no ejecuta Supabase y no necesita dependencias externas.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const QA_REF = 'rsjwqmpseknvydistgfr';
const PROD_REF = 'wajkfydxutptcvvfwrvq';
const PREFIX = 'ALQ_F1A_UI_RECEIPT|';
const EXPECTED_V2 = new Set([
  'nota_emitir',
  'credito_consumir',
  'transferencia_interna',
  'deposito_evento_registrar',
  'deposito_liquidar_y_devolver',
  'reversa_con_reapertura',
  'cargo_manual_emitir',
  'pago_multimoneda',
]);
const EXPECTED_REFS = new Map([
  ['nota_emitir', 'nota_ref'],
  ['credito_consumir', 'consumo_ref'],
  ['transferencia_interna', 'transferencia_ref'],
  ['deposito_evento_registrar', 'evento_ref'],
  ['deposito_liquidar_y_devolver', 'liquidacion_ref'],
  ['reversa_con_reapertura', 'reversa_ref'],
  ['cargo_manual_emitir', 'cargo_fuente_ref'],
  ['pago_multimoneda', 'pago_fuente_ref'],
]);
const EXPECTED_SIGNATURES = new Map([
  ['alq_admin_preparar_v2', ['p_comando_request_id', 'p_operacion', 'p_payload']],
  ['alq_admin_aplicar_v2', ['p_operacion_request_id', 'p_comando_request_id', 'p_operacion', 'p_firma', 'p_payload']],
  ['alq_admin_cancelar_v2', ['p_operacion_request_id', 'p_comando_request_id', 'p_motivo']],
  ['alq_admin_reintentar_v2', ['p_hecho_id', 'p_comando_request_id', 'p_motivo']],
]);
const CONSUMERS = [
  'admin/alquileres-admin-qa.html',
  'admin/alquileres-franjas-qa.html',
];

function fail(message) {
  throw new Error(message);
}

function inlineScripts(html, relative) {
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? '';
    if (type && !/^(?:text\/javascript|application\/javascript)$/i.test(type)) continue;
    scripts.push({code: match[2], line: html.slice(0, match.index).split('\n').length});
  }
  if (scripts.length === 0) fail(`${relative}: no tiene script inline clasico`);
  return scripts;
}

function compileScripts(html, relative) {
  for (const script of inlineScripts(html, relative)) {
    try {
      new vm.Script(script.code, {filename: `${relative}:${script.line}`});
    } catch (error) {
      fail(`${relative}: syntax error inline: ${error.message}`);
    }
  }
}

function declaredAllowlist(html, relative) {
  const match = /ALQ_F1A_V2_OPERACIONES\s*=\s*(?:new\s+Set\s*\()?\s*(?:Object\.freeze\s*\()?\s*(\[[\s\S]*?\])/m.exec(html);
  if (!match) fail(`${relative}: falta declaracion ALQ_F1A_V2_OPERACIONES`);
  const values = [...match[1].matchAll(/["']([a-z0-9_]+)["']/g)].map((item) => item[1]);
  if (values.length !== new Set(values).size) fail(`${relative}: allowlist v2 tiene duplicados`);
  const actual = new Set(values);
  const missing = [...EXPECTED_V2].filter((value) => !actual.has(value));
  const extra = [...actual].filter((value) => !EXPECTED_V2.has(value));
  if (missing.length || extra.length || actual.size !== EXPECTED_V2.size) {
    fail(`${relative}: allowlist v2 no exacta; faltan=${missing.join(',')} sobran=${extra.join(',')}`);
  }
}

function declaredReferences(html, relative) {
  const match = /ALQ_F1A_V2_REFERENCIAS?\s*=\s*(?:Object\.freeze\s*\()?\s*\{([\s\S]*?)\}\s*\)?\s*;/m.exec(html);
  if (!match) fail(`${relative}: falta mapa ALQ_F1A_V2_REFERENCIA(S)`);
  const actual = new Map(
    [...match[1].matchAll(/([a-z0-9_]+)\s*:\s*["']([a-z0-9_]+)["']/g)]
      .map((item) => [item[1], item[2]]),
  );
  const wrong = [];
  for (const [operation, field] of EXPECTED_REFS) {
    if (actual.get(operation) !== field) wrong.push(`${operation}:${actual.get(operation) ?? 'ausente'}`);
  }
  const extra = [...actual.keys()].filter((operation) => !EXPECTED_REFS.has(operation));
  if (wrong.length || extra.length || actual.size !== EXPECTED_REFS.size) {
    fail(`${relative}: mapa de refs no exacto; mal=${wrong.join(',')} sobran=${extra.join(',')}`);
  }
}

function rpcObject(html, relative, rpc) {
  const escaped = rpc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `alqF1aRpcCrudo\\(\\s*["']${escaped}["']\\s*,\\s*\\{([\\s\\S]{0,1000}?)\\}\\s*\\)`,
    'm',
  ).exec(html);
  if (!match) fail(`${relative}: ${rpc} no usa el wrapper v2 con objeto visible`);
  return match[1];
}

function requireSignatures(html, relative) {
  for (const [rpc, required] of EXPECTED_SIGNATURES) {
    const body = rpcObject(html, relative, rpc);
    const keys = new Set([...body.matchAll(/\b(p_[a-z0-9_]+)\s*:/g)].map((item) => item[1]));
    const missing = required.filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !required.includes(key));
    if (missing.length || extra.length || keys.size !== required.length) {
      fail(`${relative}: firma ${rpc} distinta; faltan=${missing.join(',')} sobran=${extra.join(',')}`);
    }
  }
}

function functionBody(html, name) {
  const marker = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`, 'm').exec(html);
  if (!marker) return null;
  const start = marker.index + marker[0].length;
  let depth = 1;
  let quote = null;
  let escaped = false;
  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return html.slice(start, i);
  }
  return null;
}

function requireDurabilityAndRetry(html, relative) {
  for (const token of [
    'localStorage.getItem', 'localStorage.setItem', 'localStorage.removeItem',
    'JSON.parse', 'JSON.stringify', 'payload_sha256', 'comandos', 'terminal',
    'ALQ_F1A_V2_EN_VUELO', '.has(vuelo)', '.set(vuelo', '.delete(vuelo)',
    "estado==='preparada'", "estado==='aplicada'", "'rechazada'",
    'rechazada_sin_fila', 'requiere_nueva_preparacion', 'reintentable', 'hecho_id',
  ]) {
    if (!html.includes(token)) fail(`${relative}: persistencia/state-machine sin ${token}`);
  }
  if (!/return\s+envelope\.resultado\s*;/.test(html)) {
    fail(`${relative}: no desempaqueta envelope.resultado para consumidores v1/v2`);
  }
  const retry = functionBody(html, 'alqF1aReintentarV2');
  if (!retry || !retry.includes("'alq_admin_reintentar_v2'")) {
    fail(`${relative}: falta funcion de reintento explicito cableada al RPC`);
  }
  if (/\bset(?:Timeout|Interval)\s*\(/.test(retry)) {
    fail(`${relative}: alqF1aReintentarV2 no puede usar timers`);
  }
  if (!/textContent\s*=\s*["']Reintentar["']/.test(html)
      || !/(?:\.onclick\s*=|addEventListener\s*\(\s*["']click["'])/.test(html)
      || !/alqF1aReintentarV2\s*\(/.test(html)) {
    fail(`${relative}: reintento no esta ligado a un click humano visible`);
  }
}

function requireContract(html, relative) {
  if (!html.includes(QA_REF) || html.includes(PROD_REF)) {
    fail(`${relative}: destino QA ausente o produccion presente`);
  }
  declaredAllowlist(html, relative);
  declaredReferences(html, relative);
  requireSignatures(html, relative);
  if (!/ALQ_F1A_V2_OPERACIONES\.(?:has|includes)\s*\(/.test(html)) {
    fail(`${relative}: el dispatch no consulta el allowlist v2`);
  }
  if (!html.includes('crypto.randomUUID')) fail(`${relative}: no genera UUID por comando`);
  requireDurabilityAndRetry(html, relative);
  if (html.includes('sessionStorage')) fail(`${relative}: sessionStorage no es durable para respuesta perdida`);
  if (!/\.ok\s*===\s*true|\[\s*["']ok["']\s*\]\s*===\s*true/.test(html)) {
    fail(`${relative}: falta compuerta explicita ok === true`);
  }
  if (!html.includes('rechazada_sin_fila')) {
    fail(`${relative}: no trata rechazada_sin_fila`);
  }
  if (/\bsetInterval\s*\(/.test(html)) fail(`${relative}: setInterval prohibido para retry`);
  if (/setTimeout\s*\([\s\S]{0,240}alq_admin_reintentar_v2/.test(html)) {
    fail(`${relative}: reintento automatico por timer prohibido`);
  }
  for (const legacy of ["'alq_admin_preparar'", "'alq_admin_aplicar'"]) {
    if (!html.includes(legacy)) fail(`${relative}: falta fallback v1 ${legacy}`);
  }
}

function main() {
  const repo = path.resolve(process.argv[2] ?? '.');
  for (const relative of CONSUMERS) {
    const absolute = path.join(repo, relative);
    const html = fs.readFileSync(absolute, 'utf8');
    compileScripts(html, relative);
    requireContract(html, relative);
  }
  const receipt = {
    schema_version: 1,
    status: 'ALQ_F1A_UI_OFFLINE_PASS',
    network: false,
    syntax_pass: true,
    consumers_checked: 2,
    exact_v2_allowlist: true,
    uuid_per_click: true,
    no_automatic_retry: true,
    explicit_ok_gate: true,
    rejected_without_row_handled: true,
    signatures_pass: true,
    stable_refs_pass: true,
    result_unwrap_pass: true,
    durable_state_machine_pass: true,
    explicit_retry_wired: true,
    v1_fallback_pass: true,
    inflight_dedup_pass: true,
  };
  process.stdout.write(`${PREFIX}${JSON.stringify(receipt)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`STOP ALQ F1-A UI OFFLINE: ${error.message}\n`);
  process.exitCode = 2;
}
