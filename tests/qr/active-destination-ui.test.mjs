import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../../admin/nuevo-canal.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('window.guardarDestinoRef = async'),html.indexOf('window.agregarReferencia = async'));
async function run({name='Agencia Mendoza',dest='/propiedades',cancel=false,fail=false}={}){
  const calls=[],alerts=[];
  const context={window:{},_referenciasPorId:new Map([['r',{id:'r',nombre:'Agencia Mendoza',destino:'/'}]]),
    document:{getElementById:id=>({value:id==='tipo'?'activo':id.startsWith('edit-nombre')?name:JSON.stringify({destino:dest})})},
    esActivo:()=>true,alert:s=>alerts.push(s),e2MensajeError:e=>e.message,
    cargarReferencias:async()=>calls.push(['read']),
    cambiarDestinoActivoExcepcional:async()=>{calls.push(['exception']);return {cancelada:cancel};},
    ejecutarOperacionE2:async(op,payload)=>{
      assert.deepEqual(Object.keys(payload.referencia).sort(),['destino','nombre']);
      assert.equal(typeof payload.referencia.destino,'string');
      calls.push([op,payload]);if(fail)throw Error('network');return {};}};
  vm.runInNewContext(source,context);await context.window.guardarDestinoRef('r');return {calls,alerts};
}
test('destination-only saves once, then reloads',async()=>{
  assert.deepEqual((await run()).calls.map(x=>x[0]),['exception','read']);
});
test('cancelled exceptional destination never runs E2',async()=>{
  assert.deepEqual((await run({cancel:true})).calls.map(x=>x[0]),['exception']);
});
test('combined name edit preserves the exact destination required by E2',async()=>{
  const {calls}=await run({name:'Otro'});
  assert.deepEqual(calls.map(x=>x[0]),['exception','referencia_guardar','read']);
  assert.deepEqual(Object.keys(calls[1][1].referencia).sort(),['destino','nombre']);
  assert.equal(calls[1][1].referencia.destino,'/propiedades');
});
test('error after destination commit discloses success and reloads',async()=>{
  const result=await run({name:'Otro',fail:true});
  assert.match(result.alerts[0],/destino ya fue cambiado/);
  assert.equal(result.calls.at(-1)[0],'read');
});
test('unchanged destination retains existing E2 path',async()=>{
  assert.deepEqual((await run({dest:'/'})).calls.map(x=>x[0]),['referencia_guardar','read']);
});
