import {utf8,unicode} from './codec.mjs';
import {strictJson} from './strict-json.mjs';
const REQUIRED=['version','request_id','nombre','mensaje','propiedad_id','proyecto_slug','fuente'];
const ALLOWED=new Set([...REQUIRED,'email','telefono']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const GENERAL=new Set(['home_form','home_chatbot','propiedades_form','proyectos_form','servicios_form','burbuja_global']);
const PROPERTY=new Set(['propiedad_form','propiedad_whatsapp']);
const SOURCES=new Set([...GENERAL,...PROPERTY,'proyecto_mini_form']);
function text(value) {
  const normalized=unicode(value).replace(/\r\n?/g,'\n').normalize('NFC');
  if(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(normalized)) throw Error('invalid_control');
  return normalized;
}
function bounded(value,characters,bytes) {
  if(!value || Array.from(value).length>characters || utf8(value).length>bytes) throw Error('invalid_text_size');
  return value;
}
function email(value) {
  if(value===undefined||value===null) return null;
  const v=text(value).trim(); if(!v) return null;
  if(/[\s\p{Cc}]/u.test(v)) throw Error('invalid_email');
  const parts=v.split('@');
  if(parts.length!==2||!parts[0]||!parts[1]||
    !/^[^\.]+(?:\.[^\.]+)+$/u.test(parts[1])||
    Array.from(parts[0]).length>64||Array.from(parts[1]).length>253) throw Error('invalid_email');
  const normalized=parts[0]+'@'+parts[1].toLowerCase();
  if(utf8(normalized).length>254) throw Error('invalid_email');
  return normalized;
}
const decimal=/\p{Decimal_Number}/u;
function digit(c) {
  if(!decimal.test(c)) return c;
  const point=c.codePointAt(0); let start=point;
  // Unicode Nd is arranged in ordered decimal sets. Some sets are adjacent
  // (mathematical digits); modulo 10 handles those without a partial locale list.
  while(start>0&&decimal.test(String.fromCodePoint(start-1))) start--;
  return String((point-start)%10);
}
function phone(value) {
  if(value===undefined||value===null) return null;
  const v=text(value).trim(); if(!v) return null;
  const normalized=Array.from(v,digit).join('').replace(/[\s()\-]/gu,'');
  if(!/^\+?[0-9]{7,15}$/.test(normalized)) throw Error('invalid_phone');
  return normalized;
}

// Syntax/normalization only, before payload hash/idempotency. This is not the
// consultation RPC; the DB must independently enforce its closed input contract.
export function parseContactPayload(bytes) {
  const p=strictJson(bytes,16384);
  if(REQUIRED.some(k=>!Object.hasOwn(p,k))||Object.keys(p).some(k=>!ALLOWED.has(k))) throw Error('invalid_schema');
  if(p.version!==1||typeof p.request_id!=='string'||!UUID4.test(p.request_id)||!SOURCES.has(p.fuente)) throw Error('invalid_schema');
  const nombre=bounded(text(p.nombre).trim().replace(/\s+/gu,' '),120,480);
  const mensaje=bounded(text(p.mensaje).trim(),2000,8000);
  const normalizedEmail=email(p.email),telefono=phone(p.telefono);
  if(normalizedEmail===null&&telefono===null) throw Error('missing_contact');
  if(p.propiedad_id!==null&&(typeof p.propiedad_id!=='string'||!UUID.test(p.propiedad_id))) throw Error('invalid_property_shape');
  if(p.proyecto_slug!==null&&(typeof p.proyecto_slug!=='string'||! /^[a-z0-9][a-z0-9-]*$/.test(p.proyecto_slug))) throw Error('invalid_project_shape');
  return Object.freeze({version:1,request_id:p.request_id,nombre,email:normalizedEmail,telefono,mensaje,propiedad_id:p.propiedad_id,proyecto_slug:p.proyecto_slug,fuente:p.fuente});
}

// A false matrix result is SEMANTIC, not a pre-ledger parse rejection. The RPC
// records payload_invalid for that normalized request/hash (48 h), also checking
// actual content existence/activity. A true result here does not prove either.
export function contactContentMatrix(p) {
  if(PROPERTY.has(p.fuente)) return p.propiedad_id!==null&&p.proyecto_slug===null;
  if(p.fuente==='proyecto_mini_form') return p.propiedad_id===null&&p.proyecto_slug!==null;
  return GENERAL.has(p.fuente)&&p.propiedad_id===null&&p.proyecto_slug===null;
}
