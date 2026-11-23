const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const project = { id: 'ensayo', slug: 'terrazas-del-piltri', nombre: 'Proyecto de ensayo' };
const id = n => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');

test('teléfono sin correo, dígitos Unicode y límites del mensaje completo', async ()=>{
  const {validarConsulta}=await import('../js/consulta-miniweb.mjs');
  const base={nombre:' Nombre ',telefono:'+٥٤ (٢٩٤) ٤٥٦-٧٨٩٠',mensaje:'Hola'};
  assert.equal(validarConsulta(base).telefono,'+542944567890');
  assert.throws(()=>validarConsulta({...base,telefono:'abc'}),/^Error: telefono$/);
  assert.throws(()=>validarConsulta({...base,telefono:''}),/^Error: contacto$/);
  assert.throws(()=>validarConsulta({...base,email:'a@b'}),/^Error: email$/);
  const prefijo='[Proyecto] ',lote='Consulta por lote 10.\n\n';
  const limite=lote+'😀'.repeat(2000-prefijo.length-lote.length);
  assert.equal(validarConsulta({...base,mensaje:limite},prefijo).mensaje,limite);
  assert.throws(()=>validarConsulta({...base,mensaje:limite+'x'},prefijo),/^Error: mensaje$/);
  assert.throws(()=>validarConsulta({...base,nombre:'a'.repeat(121)}),/^Error: nombre$/);
});

test('reintentar una consulta tras perder la respuesta no duplica el contacto', async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
  t.after(()=>browser.close());
  const page=await browser.newPage();
  const attempts=[];
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:'export const createClient=()=>({});'});
    if(url.hostname!=='ensayo.invalid')return route.abort();
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<form></form>'});
    if(url.pathname==='/api/contacto'){
      attempts.push(route.request().postDataJSON());
      if([1,4].includes(attempts.length))return route.abort('connectionreset');
      return route.fulfill({status:201,json:{ok:true}});
    }
    return route.fulfill({path:path.join(process.env.MINIWEB_TEST_ROOT||path.join(__dirname,'..'),url.pathname),contentType:'text/javascript'});
  });
  await page.goto('https://ensayo.invalid');
  await page.evaluate(async()=>{
    const {enviarContactoSeguro}=await import('/js/config.js');
    const form=document.querySelector('form'),payload={nombre:'Ensayo',mensaje:'Consulta',fuente:'proyecto_mini_form',proyecto_slug:'ensayo'};
    window.send=(message=payload.mensaje)=>enviarContactoSeguro({...payload,mensaje:message},form);
  });
  await assert.rejects(page.evaluate(()=>window.send()));
  await page.evaluate(()=>Promise.all([window.send(),window.send()]));
  assert.equal(attempts.length,2);
  assert.deepEqual(attempts[1],attempts[0]);
  await page.evaluate(()=>window.send());
  assert.notEqual(attempts[2].request_id,attempts[0].request_id);
  await assert.rejects(page.evaluate(()=>window.send()));
  await page.evaluate(()=>window.send('Otro mensaje'));
  assert.notEqual(attempts[4].request_id,attempts[3].request_id);
});
const lots = ['disponible', 'disponible', 'reservado', 'vendido', 'disponible', 'disponible'].map((estado, index) => ({
  id: id(index + 1), numero: 'M1 L' + (index + 1), estado
}));
const config = {
  estilo: 'inmersivo',
  lotes: { [id(2)]: { idEnlace: id(22) }, [id(5)]: { zonaVenta: 'oculta' }, [id(6)]: { zonaVenta: 'suspendida' } },
  recursos: { zonasVenta: { zonas: ['oculta', 'suspendida'].map(estado => ({ id: estado, estado })) } },
  controlBloques: 1,
  bloques: ['portada', 'explorador', 'contacto'].map(tipo => ({ id: tipo, tipo, activo: true, opciones: {} }))
};

test('selección y consulta de lotes en la miniweb pública', async t => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  // El host activa las reglas de Terrazas. Todas las respuestas salen de memoria o del checkout.
  const origin = 'https://staging.surpatagonian.com';
  const routeLocal=async route => {
    const url = new URL(route.request().url());
    if (![origin,'https://comprador.example.invalid'].includes(url.origin)) return route.abort();
    if (url.pathname === '/ensayo' || url.pathname === '/alamos') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><main id="miniweb-root"></main></body>' });
    if (url.pathname === '/recorrido' && ['alamos','terrazas-del-piltri'].includes(url.searchParams.get('proyecto'))) return route.fulfill({contentType:'text/html',body:`<main class="rg-tour"><nav class="rg-actions"></nav><div data-panorama-state="ready"></div><script type="module">import {appendLotReturnLinks} from '/js/recorrido-enlaces.mjs';appendLotReturnLinks(document.querySelector('main'),${JSON.stringify(url.searchParams.get('proyecto'))},'${id(1)}',{estado:'disponible'});</script></main>`});
    if (url.pathname === '/recorrido') return route.fulfill({contentType:'text/html',body:'<main class="rg-tour"><nav class="rg-actions"></nav><div data-panorama-state="ready"></div></main>'});
    if (!/^\/(js\/[\w.-]+\.m?js|css\/[\w.-]+\.css)$/.test(url.pathname)) return route.abort();
    return route.fulfill({
      path: path.join(process.env.MINIWEB_TEST_ROOT || path.join(__dirname, '..'), url.pathname),
      contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript'
    });
  };
  await context.route('**/*',routeLocal);

  async function open(t, key, { compare = false, hash = '#consulta-lote', slug = project.slug, inventory = lots, theme = config, viewport, reducedMotion, entryUrl, publicPage = true, touch = false } = {}) {
    const page = touch?await browser.newPage({hasTouch:true,isMobile:true,viewport:viewport||{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'}):await context.newPage();
    if(touch)await page.route('**/*',routeLocal);
    t.after(() => page.close());
    if (viewport) await page.setViewportSize(viewport);
    if (reducedMotion) await page.emulateMedia({reducedMotion});
    await page.goto(entryUrl || origin + '/ensayo' + (key ? '?lote=' + key + hash : ''));
    await page.evaluate(async options => {
      const { mountMiniweb } = await import('/js/miniweb.mjs');
      await mountMiniweb(document.querySelector('main'), { ...options, onContact: fields => { window.sent = fields; } });
    }, { project:{...project,slug}, lots:inventory, config:theme, compare, publicPage });
    return page;
  }

  async function checkForm(page, expected) {
    const message = expected ? 'Quisiera información sobre el lote ' + expected.numero + ' de Proyecto de ensayo.' : 'Quisiera información sobre Proyecto de ensayo.';
    assert.equal(await page.locator('#contactMessage').inputValue(), message);
    assert.equal(await page.locator('#contactLotNumber').inputValue(), expected ? 'Lote ' + expected.numero : '');
    const form = page.locator('#contactForm');
    await form.locator('[name=nombre]').fill('Ensayo');
    await form.locator('[name=email]').fill('ensayo@example.invalid');
    await form.evaluate(form => form.requestSubmit());
    const sent = await page.evaluate(() => window.sent);
    assert.equal(sent.lote_id, expected?.id);
    assert.equal(sent.lote_numero, expected?.numero);
    assert.equal(sent.mensaje, expected ? 'Consulta por lote ' + expected.numero + '.\n\n' + message : message);
  }
  await t.test('el enlace general del 360 conserva el proyecto y la versión',async t=>{
    const page=await open(t,null,{theme:{...config,recorrido:{proyectoId:project.id,escena:{enabled:true}}}});
    const href=await page.locator('.intro-links a').filter({hasText:'Recorrer el loteo en 360°'}).getAttribute('href');
    const url=new URL(href,origin);
    assert.equal(url.pathname,'/recorrido');
    assert.equal(url.searchParams.get('proyecto'),project.slug);
    assert.ok(url.searchParams.has('v'));
  });

  await t.test('un lote Próximamente conserva su ficha y consulta por identidad', async t=>{
    const inventory=lots.map(lot=>lot.id===id(1)?{...lot,estado:'proximamente'}:lot);
    const page=await open(t,id(1),{inventory});
    await checkForm(page,inventory[0]);
    const row=page.locator('[data-select="'+id(1)+'"]');
    assert.match(await row.first().innerText(),/Próximamente/i);
  });
  for (const [label, key] of [['vencido', id(99)], ['oculto', id(5)], ['no a la venta', id(6)], ['vendido', id(4)]]) {
    await t.test(label, async t => {
      const page = await open(t, key);
      await checkForm(page, null);
      assert.equal(await page.getByText('Ese lote ya no está disponible en este enlace.', { exact: true }).count(), 1);
      assert.equal(await page.locator('#lotRows tr[aria-selected=true]').count(), 0);
      if (label === 'vencido') {
        await page.locator('.nav-links').getByRole('link', { name: 'Consultar', exact: true }).click();
        await checkForm(page, null);
        const selector = page.locator('.sel');
        await selector.locator('[data-select="' + id(3) + '"]').click();
        await selector.locator('[data-action=consult]').click();
        await checkForm(page, lots[2]);
        await selector.locator('[data-action=compare]').click();
        await selector.locator('[data-select="' + id(2) + '"]').click();
        await checkForm(page, null);
        await selector.locator('[data-compare-consult="' + id(2) + '"]').click();
        await checkForm(page, lots[1]);
      }
    });
  }
  for (const [label, key, row] of [['vigente', id(2), 2], ['alias idEnlace', id(22), 2], ['reservado', id(3), 3]]) {
    await t.test(label, async t => checkForm(await open(t, key), lots[row - 1]));
  }
  await t.test('un desarrollo nuevo incrusta su propio recorrido y sus controles en Inmersivo', async t => {
    const block={id:'tour',tipo:'panoramica360',variante:'recorrido',activo:true,opciones:{},contenido:{}};
    const theme={...config,recorrido:{proyectoId:project.id,escena:{enabled:true}},bloques:[config.bloques[0],block,...config.bloques.slice(1)]};
    const page=await open(t,null,{slug:'desarrollo-con-recorrido',theme});
    const section=page.locator('[data-block-id="tour"]');
    const iframe=section.locator('iframe');
    await iframe.waitFor({state:'visible',timeout:4000});
    const src=new URL(await iframe.getAttribute('src'));
    assert.equal(src.searchParams.get('proyecto'),'desarrollo-con-recorrido');
    assert.equal(src.searchParams.get('interfaz'),'inmersivo');
    await section.frameLocator('iframe').getByRole('button',{name:'Pantalla completa'}).waitFor();
    assert.equal(await section.locator('.tour-expand,[data-open-project-tour]').count(),0);
  });
  await t.test('un enlace vencido que pide el formulario lleva a una consulta general', async t => {
    const page = await open(t, id(99));
    const name = page.locator('#contactForm [name=nombre]');
    assert.ok(await name.evaluate(input => input.matches(':focus')), 'el comprador debe llegar al formulario');
    assert.equal(await page.locator('#contactLotNumber').inputValue(), '');
    assert.equal(await page.locator('#lotRows tr[aria-selected=true]').count(), 0);
  });
  await t.test('consultar desde el 360 incrustado abre y vuelve a enfocar el formulario sin recargar el proyecto', async t => {
    const block={id:'tour',tipo:'panoramica360',variante:'recorrido',activo:true,opciones:{},contenido:{}};
    const theme={...config,estilo:'manifiesto',recorrido:{proyectoId:project.id,escena:{enabled:true}},bloques:[config.bloques[0],block,...config.bloques.slice(1)]};
    const page=await open(t,null,{slug:'alamos',theme,entryUrl:origin+'/alamos?lote='+id(1)+'#lotes'});
    const section=page.locator('[data-block-id="tour"]');
    await section.scrollIntoViewIfNeeded();
    await section.locator('iframe').waitFor({state:'visible'});
    const frame=section.frameLocator('iframe');
    const timeOrigin=await page.evaluate(()=>performance.timeOrigin);
    for(let attempt=0;attempt<2;attempt++){
      await frame.getByRole('link',{name:'Consultar este lote',exact:true}).click();
      await page.locator('#contactForm [name=nombre]').waitFor({state:'visible'});
      assert.ok(await page.locator('#contactForm [name=nombre]').evaluate(input=>input.matches(':focus')),'el clic debe abrir y enfocar la consulta del lote, incluso con el mismo hash');
      assert.equal(await page.evaluate(()=>performance.timeOrigin),timeOrigin,'no debe recargar el proyecto');
      await checkForm(page,lots[0]);
    }
    for(const fallback of [false,true]){
      if(fallback)await page.evaluate(()=>Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false}));
      await section.getByRole('button',{name:'Pantalla completa',exact:true}).click();
      await section.locator('.tour-embed').evaluate(stage=>new Promise(resolve=>{const limit=performance.now()+3000,check=()=>stage.matches(':fullscreen')||stage.classList.contains('tour-expanded')?resolve(true):performance.now()>limit?resolve(false):requestAnimationFrame(check);check()})).then(expanded=>assert.ok(expanded,'el visor debe estar expandido antes de consultar'));
      await frame.getByRole('link',{name:'Consultar este lote',exact:true}).click();
      await page.waitForFunction(()=>!document.fullscreenElement&&!document.querySelector('main').shadowRoot.querySelector('.tour-expanded'),null,{timeout:3000});
      await page.waitForFunction(()=>document.querySelector('main').shadowRoot.activeElement?.name==='nombre',null,{timeout:3000}).catch(()=>{});
      assert.ok(await page.locator('#contactForm [name=nombre]').evaluate(input=>input.matches(':focus')),'la consulta debe quedar delante del visor al salir de pantalla completa');
      await checkForm(page,lots[0]);
    }
  });
  await t.test('la consulta desde explorar con un dedo libera la página y conserva el formulario después de Escape', async t=>{
    const block={id:'tour',tipo:'panoramica360',variante:'recorrido',activo:true,opciones:{},contenido:{}};
    const theme={...config,recorrido:{proyectoId:project.id,escena:{enabled:true}},bloques:[config.bloques[0],block,...config.bloques.slice(1)]};
    for(const expanded of [false,true]){
      const page=await open(t,id(1),{hash:'#lotes',theme,touch:true});
      const section=page.locator('[data-block-id="tour"]');
      await section.getByRole('button',{name:'Explorar 360°',exact:true}).tap();
      assert.equal(await page.evaluate(()=>getComputedStyle(document.body).position),'fixed','el ensayo debe entrar en el modo de exploración que bloquea la página');
      const frame=section.frameLocator('iframe');
      if(expanded){
        await page.evaluate(()=>Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false}));
        await frame.getByRole('button',{name:'Pantalla completa',exact:true}).tap();
        assert.ok(await section.locator('.tour-embed').evaluate(stage=>stage.classList.contains('tour-expanded')),'el ensayo debe entrar en el modo expandido que conserva la posición de regreso');
      }
      await frame.getByRole('link',{name:'Consultar este lote',exact:true}).tap();
      assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).position),'fixed','consultar debe liberar el desplazamiento de la página');
      const name=page.locator('#contactForm [name=nombre]');
      assert.ok(await name.evaluate(input=>input.matches(':focus')));
      const y=await page.evaluate(()=>scrollY);
      await name.press('Escape');
      assert.equal(await page.evaluate(()=>scrollY),y,'Escape no debe restaurar una posición vieja del visor después de abrir la consulta');
      await checkForm(page,lots[0]);
    }
  });
  await t.test('la dirección compartida abre la consulta elegida después de un enlace vencido', async t => {
    const from = origin + '/ensayo?canal=red&via=qr&lote=' + id(99) + '#consulta-lote';
    const page = await open(t, null, { entryUrl: from });
    const historyLength = await page.evaluate(() => {
      history.replaceState({ origen: 'comprador' }, '', location.href);
      return history.length;
    });
    const selector = page.locator('.sel');
    assert.equal(page.url(), from, 'el ingreso retirado sigue identificable antes de la elección');
    for (const [row, linkId] of [[1, id(22)], [2, id(3)]]) {
      await selector.locator('[data-select="' + lots[row].id + '"]').click();
      await selector.locator('[data-action=consult]').click();
      assert.equal(page.url(), origin + '/ensayo?canal=red&via=qr&lote=' + linkId + '#consulta-lote');
      assert.equal(await page.evaluate(() => history.length), historyLength);
      assert.deepEqual(await page.evaluate(() => history.state), { origen: 'comprador' });
      const reopened = await open(t, null, { entryUrl: page.url() });
      await checkForm(reopened, lots[row]);
    }
    await selector.locator('[data-action=close]').click();
    const cleared = await open(t, null, { entryUrl: page.url() });
    assert.equal(new URL(cleared.url()).hash, '#consulta-lote');
    assert.ok(await cleared.locator('#contactForm [name=nombre]').evaluate(input => input.matches(':focus')));
    await checkForm(cleared, null);
    await page.locator('.nav-links').getByRole('link', { name: 'Consultar', exact: true }).click();
    await checkForm(page, null);
    const general = new URL(page.url());
    assert.equal(general.searchParams.has('lote'), false, 'la consulta general conserva el lote anterior en la dirección');
    assert.equal(general.searchParams.get('via'), 'qr');
    assert.equal(general.searchParams.get('canal'), 'red');
    await checkForm(await open(t, null, { entryUrl: general.href }), null);
    const preview = await open(t, null, { entryUrl: from, publicPage: false });
    await preview.locator('.sel [data-select="' + lots[1].id + '"]').click();
    await preview.locator('.sel [data-action=consult]').click();
    assert.equal(preview.url(), from);
    const otherFrom = from.replace(origin, 'https://comprador.example.invalid');
    const otherPage = await open(t, null, { entryUrl: otherFrom });
    await otherPage.locator('.sel [data-select="' + lots[1].id + '"]').click();
    await otherPage.locator('.sel [data-action=consult]').click();
    assert.equal(otherPage.url(), otherFrom.replace(id(99), id(22)));
  });
  await t.test('el Consultar del encabezado lleva al formulario y enfoca Nombre en Manifiesto e Inmersivo',async t=>{
    for(const style of ['manifiesto','inmersivo'])for(const width of [390,1440]){
      const theme={...config,estilo:style,bloques:[config.bloques[0],{id:'texto',tipo:'foto-texto',activo:true,opciones:{},contenido:{titulo:'El proyecto',texto:'Contenido del proyecto. '.repeat(40)}},{id:'contacto',tipo:'contacto',activo:true,opciones:{},contenido:{titulo:'Hablemos del proyecto',texto:'Información anterior al formulario. '.repeat(30)}}]};
      const page=await open(t,null,{slug:'alamos',theme,viewport:{width,height:844}});
      const link=page.locator('.project-nav').getByRole('link',{name:'Consultar',exact:true});
      await link.click();
      const name=page.locator('#contactForm [name=nombre]');
      const bounds=await name.evaluate(input=>({focused:input.matches(':focus'),top:input.getBoundingClientRect().top,bottom:input.getBoundingClientRect().bottom,height:innerHeight}));
      assert.ok(bounds.focused&&bounds.top>=0&&bounds.bottom<=bounds.height,JSON.stringify({style,width,...bounds}));
      assert.match(await page.locator('#contactMessage').inputValue(),/Quisiera información sobre Proyecto de ensayo/);
      assert.equal(await page.evaluate(()=>window.sent),undefined);
      await page.close();
    }
  });
  for (const [width,height] of [[390,787],[1440,900]]) {
    await t.test('el enlace de consulta deja Nombre visible y permite seguir desplazándose a '+width+' px', async t => {
      for (const key of [id(99),id(1)]) {
        const page=await open(t,key,{viewport:{width,height},reducedMotion:'no-preference'});
        const name=page.locator('#contactForm [name=nombre]');
        await name.evaluate(async input=>{
          await document.fonts.ready;
          await new Promise(resolve=>{
            const start=performance.now();
            let previous,stable=0;
            function frame(){
              const position=input.getBoundingClientRect().top;
              stable=previous===position?stable+1:0;
              previous=position;
              if ((performance.now()-start>=900 && stable>=5) || performance.now()-start>3000) resolve();
              else requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
          });
        });
        const bounds=await name.evaluate(input=>({
          label:input.closest('label').getBoundingClientRect().top,
          bottom:input.getBoundingClientRect().bottom,
          height:innerHeight,
          focused:input.matches(':focus')
        }));
        assert.ok(bounds.focused && bounds.label>=0 && bounds.bottom<=bounds.height, JSON.stringify(bounds));
        const initial=await page.evaluate(()=>scrollY);
        await page.mouse.wheel(0,-100);
        await page.waitForFunction(before=>scrollY<=before-90,initial,{timeout:1500});
        await page.close();
      }
    });
  }
  await t.test('un nombre completo conserva sus ceros, su zona y su estado en la página', async t => {
    const named = {id:id(7), numero:'Manzana QA Grilla · Lote 007', superficie_m2:396, estado:null};
    const theme = {...config, lotes:{...config.lotes,[named.id]:{zonaVenta:'norte'}},
      recursos:{zonasVenta:{zonas:[{id:'norte',nombre:'Zona Norte',estado:'activa'}]}}};
    const page = await open(t,named.id,{inventory:[named],theme});
    assert.equal(await page.locator('#contactLotNumber').inputValue(), named.numero);
    const card = page.locator('.lot-card').first();
    assert.equal(await card.locator('h3').textContent(), named.numero);
    assert.match(await card.locator('.lot-card-info p').textContent(), /396 m².*Zona Norte/);
    assert.equal((await card.locator('.lot-status').textContent()).trim(), 'Sin informar');
  });
  await t.test('vendido en otro proyecto no prepara una consulta', async t => checkForm(await open(t, id(4), {slug:'desarrollo-de-ensayo'}), null));
  await t.test('vendido conserva la ficha informativa', async t => {
    const page = await open(t, id(4), { hash: '#lotes' });
    assert.equal(await page.locator('#lotRows tr[aria-selected=true] [data-lot]').getAttribute('data-lot'), id(4));
    await checkForm(page, null);
  });
  await t.test('entrada sin elección permite una consulta general', async t => checkForm(await open(t), null));
  await t.test('consulta móvil desde la lista con zonas y precios', async t => {
    const inventory = Array.from({length: 40}, (_, i) => ({
      id: id(i + 1), numero: 'Manzana 901 · Lote ' + String(i + 1).padStart(3, '0'),
      estado: 'disponible', superficie_m2: 400, precio_usd: 40000, mapa_x: 30 + i, mapa_y: 50
    }));
    const theme = {...config, lotes: Object.fromEntries(inventory.map(l => [l.id, {zonaVenta: 'b'}])),
      recursos: {zonasVenta: {zonas: [{id: 'b', nombre: 'Zona B', estado: 'activa'}]}}};
    const page = await open(t, null, {inventory, theme, viewport: {width: 390, height: 787}});
    const row = page.locator('.side [data-select="' + id(5) + '"]');
    const tab = page.getByRole('button', {name: /Ver lista/});
    if (await tab.isVisible()) await tab.click();
    await row.waitFor();
    const bounds = await row.evaluate(el => {
      const row = el.getBoundingClientRect(), text = el.querySelector('.t').getBoundingClientRect();
      return {height: row.height, top: text.top - row.top, bottom: text.bottom - row.top};
    });
    await row.click();
    await page.locator('.card [data-action="consult"]').click();
    await page.waitForFunction(() => document.querySelector('main').shadowRoot.activeElement?.name === 'nombre');
    const measureForm = () => page.locator('#contactForm [name=nombre]').evaluate(input => ({
      label: input.closest('label').getBoundingClientRect().top,
      menu: input.getRootNode().querySelector('.project-nav').offsetHeight
    }));
    const position = await measureForm();
    assert.ok(bounds.top >= 0 && bounds.bottom <= bounds.height + 1, JSON.stringify(bounds));
    assert.ok(position.label >= position.menu, JSON.stringify(position));
    assert.match(await page.locator('#contactMessage').inputValue(), /Manzana 901 · Lote 005/);
    await page.setViewportSize({width: 390, height: 667});
    await page.locator('.card [data-action="consult"]').evaluate(button => button.click());
    const smaller = await measureForm();
    assert.ok(smaller.label >= smaller.menu, JSON.stringify(smaller));
  });
  await t.test('comparación de estilos ignora el enlace', async t => checkForm(await open(t, id(2), { compare: true }), null));

  for (const width of [390, 1440]) {
    for (const {broken, slug} of [
      {broken:true, slug:project.slug}, {broken:false, slug:project.slug},
      {broken:true, slug:'desarrollo-de-ensayo'}
    ]) {
      await t.test('selector a ' + width + ' px con foto ' + (broken ? 'caída' : 'sana') + ' en ' + slug, async t => {
        const page = await context.newPage();
        t.after(() => page.close());
        page.setDefaultTimeout(4000);
        await page.setViewportSize({ width, height: 844 });
        await page.route(origin + '/plano.svg', route => broken ? route.abort() : route.fulfill({
          contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="silver"/></svg>'
        }));
        await page.goto(origin + '/ensayo');
        await page.evaluate(async options => {
          const { mountSelector } = await import('/js/miniweb-selector.mjs');
          mountSelector(document.querySelector('main'), {
            ...options, safeUrl: url => url, mapUrl: location.origin + '/plano.svg', shapeFor: () => null,
            onConsult: key => { window.consulted = key; }
          });
        }, { project: {...project, slug}, config, lots: lots.map((lot, i) => ({ ...lot, mapa_x: 10 + 5 * i, mapa_y: 35 })) });
        const selector = page.locator('.sel');
        const list = selector.locator('.side');
        await page.locator('.sel:not([aria-busy])').waitFor();
        if (broken) await page.locator('.sel[data-list-only=true]').waitFor();
        assert.equal(await selector.locator('.map').isVisible(), !broken);
        assert.equal(await selector.locator('.zoom').isVisible(), !broken);
        if (broken) {
          assert.equal(await list.evaluate(el => el.inert), false, 'la lista debe aceptar interacción tras el fallo');
          assert.equal(await selector.locator('[data-map-failure]').isVisible(), true);
          assert.equal(await selector.locator('[data-list-open]').isVisible(), false);
        } else if (width === 390) {
          assert.equal(await list.isVisible(), false);
          await selector.getByRole('button', { name: /Ver lista/ }).click();
        }
        assert.equal(await list.isVisible(), true);
        const row = list.locator('[data-select="' + id(2) + '"]');
        await row.focus();
        assert.equal(await row.evaluate(el => el.matches(':focus')), true);
        await row.press('Enter');
        await selector.getByRole('button', { name: 'Consultar este lote' }).click();
        assert.equal(await page.evaluate(() => window.consulted), id(2));
      });
    }
  }
  for(const width of [390,1440]){
    await t.test('un nuevo loteo por zonas encuadra la foto sin tapar sus lotes a '+width,async t=>{
      const page=await context.newPage();
      t.after(()=>page.close());
      page.setDefaultTimeout(4000);
      await page.setViewportSize({width,height:850});
      await page.goto('https://comprador.example.invalid/ensayo');
      await page.evaluate(async ({lots,config})=>{
        const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900"></svg>');
        const {mountSelector}=await import('/js/miniweb-selector.mjs');
        const inventory=lots.slice(0,4);
        const theme={...config,lotes:Object.fromEntries(inventory.map(l=>[l.id,{zonaVenta:'norte'}])),
          recursos:{zonasVenta:{zonas:[{id:'norte',nombre:'Norte',estado:'activa'}]}}};
        mountSelector(document.querySelector('main'),{
          project:{slug:'ensayo-zonas',nombre:'Ensayo'},config:theme,lots:inventory,
          mapUrl:image,safeUrl:url=>url,mapHasPhoto:true,
          shapeFor:l=>{
            const x=120+inventory.indexOf(l)*175;
            return {feature:{block:'1'},points:[[x,570],[x+25,570],[x+25,610],[x,610]].map(p=>p.join(',')).join(' ')};
          }
        });
      },{lots,config});
      const map=page.locator('svg.map'),list=page.locator('.side');
      const shapes=map.locator('polygon.lot');
      await shapes.last().waitFor({state:'attached'});
      if(width===1440){
        const svg=await map.boundingBox(),aside=await list.boundingBox();
        assert.ok(Math.abs(aside.width-380)<=1 && svg.x+svg.width<=aside.x+1,'la lista ocupa su propia columna');
      }
      const measure=()=>shapes.evaluateAll(nodes=>{
        const map=nodes[0].closest('svg'),section=map.closest('section'),box=map.getBoundingClientRect();
        const head=section.querySelector('.head').getBoundingClientRect(),sheet=section.querySelector('.card');
        return nodes.map(n=>{
          const r=n.getBoundingClientRect();
          return r.left>=box.left-1&&r.right<=box.right+1&&r.top>=head.bottom-1&&r.bottom<=box.bottom+1
            &&(sheet.hidden||r.bottom<=sheet.getBoundingClientRect().top+1);
        });
      });
      assert.deepEqual(await measure(),[true,true,true,true],'los cuatro contornos deben entrar en el encuadre inicial');
      const zone=page.locator('button[data-zone="norte"]');
      await zone.press('Enter');
      assert.equal(await zone.evaluate(el=>el.matches(':focus')),true,'el filtro de zona conserva el foco');
      await page.locator('button[data-state="vendido"]').press('Enter');
      if(width===390){
        const opener=page.getByRole('button',{name:'Ver lista (1)',exact:true});
        await opener.press('Enter');
        await list.locator('[data-select="'+id(4)+'"]').press('Enter');
        await page.locator('.card:not([hidden])').waitFor();
        assert.equal(await page.locator('.card').evaluate(el=>el.matches(':focus-within')),true);
        assert.equal((await measure())[3],true,'el lote de la lista debe quedar por encima de la ficha');
        await page.locator('[data-action="close"]').press('Enter');
        assert.equal(await opener.evaluate(el=>el.matches(':focus')),true);
      }
    });
  }
  await t.test('el plano acompaña un dedo en ambos sentidos y deja el gesto vertical a la página',async t=>{
    const page=await context.newPage();
    t.after(()=>page.close());
    await page.setViewportSize({width:390,height:844});
    await page.goto(origin+'/ensayo');
    await page.evaluate(async ({config,lots,project})=>{
      document.body.style.margin='0';
      document.body.style.paddingBottom='150vh';
      const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900"></svg>');
      const {mountSelector}=await import('/js/miniweb-selector.mjs');
      mountSelector(document.querySelector('main'),{
        project:{...project,slug:'alamos'},config,mapUrl:image,safeUrl:url=>url,
        lots:lots.slice(0,3).map((lot,i)=>({...lot,mapa_x:45+i*5,mapa_y:50})),shapeFor:()=>null
      });
    },{config,lots,project});
    const map=page.locator('svg.map');
    await map.locator('image').waitFor({state:'attached'});
    const session=await context.newCDPSession(page);
    async function swipe(dx,dy){
      const r=await map.boundingBox(),x=Math.round(r.x+r.width*.48),y=Math.round(r.y+r.height*.52);
      for(let step=0;step<=6;step++){
        await session.send('Input.dispatchTouchEvent',{type:step?'touchMove':'touchStart',
          touchPoints:[{x:x+dx*step/6,y:y+dy*step/6,id:0}]});
      }
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    }
    const originX=()=>map.evaluate(el=>el.viewBox.baseVal.x);
    const x=await originX();
    await swipe(60,2);
    assert.ok(await originX()<x-1,'al mover el dedo a la derecha, el dibujo también va a la derecha');
    const moved=await originX();
    await swipe(-60,-2);
    assert.ok(await originX()>moved+1,'el arrastre de regreso mueve el dibujo a la izquierda');
    const y=await page.evaluate(()=>scrollY);
    await swipe(1,-90);
    assert.ok(await page.evaluate(()=>scrollY)>y,'el gesto vertical desplaza el documento');
  });
  await t.test('un lote DXF fuera de la cenital queda dentro del plano al encuadrar y elegir desde la lista',async t=>{
    const page=await context.newPage();
    t.after(()=>page.close());
    page.setDefaultTimeout(4000);
    await page.setViewportSize({width:1440,height:900});
    await page.route(origin+'/cenital.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="silver"/></svg>'}));
    await page.goto(origin+'/ensayo');
    await page.evaluate(async ({project,lots,config})=>{
      const {mountSelector}=await import('/js/miniweb-selector.mjs');
      mountSelector(document.querySelector('main'),{
        project:{...project,slug:'ensayo-dxf'},config:{...config,recorrido:{escena:{planoActivo:'vectorial'}}},lots:lots.slice(0,2),
        safeUrl:url=>url,mapUrl:location.origin+'/cenital.svg',mapHasPhoto:true,
        shapeFor:l=>({feature:{block:'1'},points:l.id===lots[0].id?'-530,990 -485,990 -485,1030 -530,1030':'400,910 445,910 445,950 400,950'}),
      });
    },{project,lots,config});
    const shape=page.locator('svg.map polygon[aria-label="M1 L1, Disponible"]');
    await shape.waitFor({state:'attached'});
    const observations=()=>shape.evaluate(n=>{
      const map=n.closest('svg'),im=map.querySelector('image'),r=n.getBoundingClientRect(),m=map.getBoundingClientRect(),pic=im.getBoundingClientRect();
      return {fullyVisible:r.left>=m.left-1&&r.right<=m.right+1&&r.top>=m.top-1&&r.bottom<=m.bottom+1,
        outsidePhoto:r.right<pic.left,ratio:pic.width/pic.height};
    });
    const all=page.getByRole('button',{name:'Ver todo el plano'});
    await all.click();let result=await observations();
    assert.equal(result.fullyVisible,true,'encuadrar debe incluir el contorno fuera de la foto');
    assert.equal(result.outsidePhoto,true,'el lote sigue en su lugar respecto de la foto');
    assert.ok(Math.abs(result.ratio-4/3)<0.001);
    await page.locator('[data-select="'+id(1)+'"]').click();
    await page.getByRole('button',{name:'Consultar este lote'}).waitFor();
    result=await observations();
    assert.equal(result.fullyVisible,true,'el lote seleccionado debe poder verse');
    assert.equal(result.outsidePhoto,true);
    for(const action of ['botón','teclado']){
      if(action==='botón') await all.click();
      else{
        await page.locator('[data-select="'+id(1)+'"]').click();
        const map=page.locator('svg.map');
        await map.focus();
        await map.press('Home');
      }
      assert.ok(await page.locator('article.card').isHidden(),'la vista general debe liberar el plano');
      assert.ok(await shape.evaluate(n=>{
        const rect=n.getBoundingClientRect();
        const hit=n.getRootNode().elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
        return hit===n || n.contains(hit);
      }),'el lote debe poder tocarse al volver al mapa completo');
    }
  });

});
