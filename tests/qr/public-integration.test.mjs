import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const ROOT=new URL('../../',import.meta.url);
const PUBLIC=[
  '404.html','index.html','propiedad.html','propiedades.html','proyectos.html',
  'servicios.html','js/burbuja-contacto.js','js/config.js'
];

async function sources(){
  return Promise.all(PUBLIC.map(async path=>[path,await readFile(new URL(path,ROOT),'utf8')]));
}

test('all public contact and pageview writes cross the same-origin server boundary',async()=>{
  for(const [path,source] of await sources()){
    assert.doesNotMatch(source,/\.from\(\s*['"](?:contactos|visitas)['"]\s*\)\s*\.insert\s*\(/,path);
    assert.doesNotMatch(source,/\b(?:canal_ref|canal_via)\s*:/,path);
  }
  const joined=(await sources()).map(([,source])=>source).join('\n');
  assert.match(joined,/fetch\(['"]\/api\/contacto['"]/);
  assert.match(joined,/fetch\(['"]\/api\/qr\/pageview['"]/);
});

test('legacy browser attribution cannot provide a channel identity',async()=>{
  const config=await readFile(new URL('js/config.js',ROOT),'utf8');
  assert.match(config,/export function getRef\(\) \{ return null \}/);
  assert.match(config,/export function getRefVia\(\) \{ return null \}/);
  assert.doesNotMatch(config,/REF_DIAS|capturarRef|leerRefGuardado/);
});

test('the seven public form sources are closed and mapped to the secure endpoint',async()=>{
  const joined=(await sources()).map(([,source])=>source).join('\n');
  for(const source of [
    'home_form','home_chatbot','propiedades_form','proyectos_form',
    'servicios_form','propiedad_form','proyecto_mini_form'
  ]) assert.match(joined,new RegExp(`fuente:\\s*['"]${source}['"]`),source);
  assert.match(joined,/fuente:\s*propiedadId\s*\?\s*['"]propiedad_form['"]\s*:\s*['"]burbuja_global['"]/);
});
