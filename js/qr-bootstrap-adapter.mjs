import {runBootstrap} from './qr-bootstrap-core.mjs';
import {qrFallbackConfig} from './qr-public-config.mjs';

const message=document.getElementById('qrStatus');
const environment={
  fetch:(...args)=>fetch(...args),history,location,storage:sessionStorage,
  now:()=>Date.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id),
  config:qrFallbackConfig(location.hostname),
  status(value){if(message) message.textContent=value==='limited'
    ?'Demasiados intentos. Esperá un momento.'
    :value==='unavailable'?'No pudimos abrir este contenido.':'Abriendo contenido…';},
};
runBootstrap(environment);
