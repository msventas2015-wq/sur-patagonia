import {unitPriceLabel,unitPriceText} from './lote-precio.mjs';
import {mediaList,mediaURL} from './recorrido-medios.mjs';
import {openMediaViewer} from './recorrido-visor-medios.mjs';

export function lotTitle(lot) {
  if (/^Manzana /i.test(lot.numero)) return lot.numero;
  return 'Lote ' + String(lot.numero ?? '').replace(/^lote\s+/i, '');
}
const present = value => value != null && value !== '';
const formatted = value => Number(value).toLocaleString('es-AR');

export function appendLotInformation(container, lot, config, {local=false}={}) {
  const append = (tag, value) => {
    const element = document.createElement(tag);
    element.textContent = value;
    container.append(element);
    return element;
  };
  const status = {proximamente:'Próximamente',disponible:'Disponible', reservado:'Reservado', vendido:'Vendido'}[lot.estado];
  append('p',status || 'Disponibilidad sin informar');
  if (present(lot.superficie_m2)) append('p','Superficie: '+formatted(lot.superficie_m2)+' m²');
  // Bajo la regla de estados de las miniwebs (opción estadosPlano del Explorador), un lote vendido no muestra importes.
  const soldRule = lot.estado==='vendido' && config?.bloques?.find(block=>block.tipo==='explorador')?.opciones?.estadosPlano==='regla';
  if (!soldRule) {
    append('p',present(lot.precio_usd) ? 'Precio: USD '+formatted(lot.precio_usd) : 'Precio a consultar');
    if (present(lot.precio_usd)) append('p',unitPriceLabel+' · '+unitPriceText(lot));
  }
  if (lot.tipo_lote) append('p','Sector: '+lot.tipo_lote);
  if (lot.frente_agua) append('p','Frente al agua');
  if (lot.notas) append('p',lot.notas);
  const items = mediaList(config,lot.id,{local});
  const photo = items.find(item=>item.tipo==='foto');
  if (photo) {
    const cover = document.createElement('img');
    cover.alt = photo.titulo || lotTitle(lot);
    cover.src = photo.miniatura || photo.url;
    container.append(cover);
  }
  if (items.length) {
    const button = append('button','Ver fotos y vistas del lote');
    button.type='button';
    button.onclick=()=>openMediaViewer(items,{title:lotTitle(lot),context:'recorrido'});
  }
  const external = mediaURL(config.lotes?.[lot.id]?.tour360,{local});
  if (external && !soldRule) {
    const link = append('a','Abrir vista 360 del lote');
    link.href=external;link.target='_blank';link.rel='noopener noreferrer';
  }
}

// Terrazas del Piltriquitrón · rótulo comercial de los lotes (001 a 080).
// Sólo cambia el nombre que se muestra. El identificador de cada lote, su estado, su precio y su vínculo
// con el plano y el recorrido no cambian: la consulta sigue llegando con el mismo lote_id.
// Fuente: cruce comercial del 23-nov-2026 (catastral → comercial), unido por identificador con el inventario.
export const SLUG_TERRAZAS='terrazas-del-piltri';
// identificador del lote → 'manzana·número comercial'
const ROTULOS={
 'dd61669e-ac24-4bc8-b540-3a04fcc2e5ec':'920·001',
 'd3641d34-6afc-4015-a1e7-81fa23a5c56b':'920·002',
 'f641ae7f-d2fd-4778-990a-ee4391a75b53':'920·003',
 '84617b65-23f8-464c-9ac7-bc5d1fbcc71a':'920·004',
 'e3eba6e2-ea69-4044-8a69-4684832304de':'920·005',
 'd3dcc46e-9d31-4080-a151-2a4baf78b1c9':'920·006',
 '0a50ff0f-e086-4888-9cb7-d48bcf72f6ec':'920·007',
 'd464ae58-4aec-4c73-85cf-553b9160af70':'920·008',
 'c5b79ea3-fd19-4871-9013-fc3b2f1ba1dc':'920·009',
 '2e241e83-39a9-4745-b243-0d8d9bd6c728':'901·010',
 '86964008-b298-412a-b940-dd9dbc0129c2':'901·011',
 '32967a71-ef44-4dd7-ace0-f82f4c5ea439':'901·012',
 '203f4c30-82f3-4000-b7e7-00e250b3d0c9':'901·013',
 '02480f60-8f77-4b82-a339-60eee57e825d':'901·014',
 '156aa13f-bed7-438c-bddd-230b9f3ac4f7':'901·015',
 '3a2de190-148f-4496-a30f-5f86b4dba744':'901·016',
 'a62420ed-a9cc-4fa8-9ea1-0807d0392255':'901·017',
 '6eae0767-7491-4f13-9e74-7dc12fb8e5b2':'901·018',
 '3ec68eb3-2f75-4952-b95c-00261a0a4327':'901·019',
 'fc65205e-12ff-4e9b-94aa-dd21435fe5c0':'901·020',
 '7bd09f7d-f4ca-47a6-b368-544965738e4e':'901·021',
 '59fb1c42-98b5-453c-9d22-2a9037487f2d':'901·022',
 'f31a77e9-3129-4b20-a17f-ac2e1bd62900':'901·023',
 '9f2a02e9-54a9-47f9-a2df-ab7e936a1aa9':'901·024',
 'd96ac5a0-570e-4d7f-8f83-b6cf9ca34771':'901·025',
 '08aa4d0a-95f5-4ad5-bc38-135c59659501':'901·026',
 '0b5c053b-0e8a-4701-aad4-15fd25053f05':'901·027',
 '0441e5cc-bfb1-4ab4-b608-54667cfc114a':'901·028',
 'e9aa8328-5c18-4a35-9951-b1552774be79':'901·029',
 'a80c1712-0a78-49b0-b41d-a6446f177b67':'901·030',
 '677914f0-46ec-4e9e-9b8a-3173f7689d20':'901·031',
 '8d1cc624-6010-4bfb-9224-7f1c92b42fec':'901·032',
 '07ac5524-87c2-42ad-9745-0a51c024f962':'901·033',
 '0b2254c4-e80b-4868-b47a-3376682792ae':'901·034',
 'fdf862bd-63e6-4b91-ab0f-182b7bfe0366':'901·035',
 '3ef0cdb5-d1f7-40cf-9a42-8668f3e5133d':'901·036',
 '2b6872fc-876c-4628-96ec-340a414a3039':'901·037',
 '46947115-6fd1-4fe5-8fe6-844865ec6108':'901·038',
 'e1e6c799-a60a-4260-89ba-38b8c11a3f69':'901·039',
 '0db320f0-5f8e-4232-b00c-1ea27c8f93d7':'900·040',
 '6033cece-0624-4a3b-8f4d-b912aaa93c94':'900·041',
 '8776965a-4006-4a9e-8e0f-96ad3f00ad0b':'900·042',
 '610d42b3-4d9b-4dc9-bb02-6b847076bdb4':'900·043',
 'c5942376-7e55-4604-98de-d55d84995cd0':'900·044',
 '4a19edf7-3a34-4acf-848f-bb9283fafda6':'900·045',
 'efbe292c-d9be-4c46-b4b4-901b5705883f':'900·046',
 '52a871ac-e29b-4494-b2e8-a830128ac687':'900·047',
 '5cce00c0-df26-478f-9195-fcd8f7c84445':'910·048',
 '62d753ed-a9f3-4618-a33b-869ab7bb5f4a':'910·049',
 'bb1ffef3-21b0-42d2-b09c-16c49c315c45':'910·050',
 'd837da39-61d7-46be-a11b-df453f6b6e03':'910·051',
 '73bb73d7-246f-45ee-b9d6-ee3d70794733':'910·052',
 '45dc8793-a855-43ea-9a90-de941b73bf94':'910·053',
 '9b3bd80c-a94f-449c-b434-36e2289e90db':'910·054',
 '20ca22a2-62c2-4dd7-9822-6ef08838571b':'910·055',
 'ede691e7-868b-4442-963b-0d7c21ea5aab':'910·056',
 '3abe422d-08e6-4483-90e3-59e48e585b6f':'910·057',
 '6b767cda-e61f-4c6f-bebe-7fe0c6a0121e':'910·058',
 '346efb61-4cac-460b-b6a9-7fd76bba2ec1':'911·059',
 '225b460a-17de-4a11-876c-e857d36a70f8':'911·060',
 'dc33dc77-e06e-4f1e-9a9f-2210d2569d51':'911·061',
 '73b66bb6-a7a6-4e28-ab66-d7e4cb074fcd':'911·062',
 '5c93176c-2f5f-4805-8325-1430a99b8641':'911·063',
 '245c59a0-952f-4eb6-a53b-85f44f7aa5cb':'911·064',
 '6997e8f0-de3c-49e1-8288-044dd4e2a30f':'911·065',
 'f0deb384-9ca8-4e11-8f5a-2c59d46ef16a':'911·066',
 '983c91aa-a1b3-4cc8-ae8d-4c2c281bbed9':'911·067',
 'e46858fa-b617-49ab-a476-f0f8a2fa2499':'911·068',
 '9278b911-6a7d-436f-bafe-53d6250b42e0':'911·069',
 'ed3d9b0d-cf8d-4058-927a-f2904b7b2ef4':'911·070',
 '5669d69c-124d-4dbd-9252-57357781e33c':'911·071',
 '378cfc54-04ec-4d01-a763-724a0e7e358b':'911·072',
 '6ee414f4-8deb-4be5-8b25-63811bb68e26':'911·073',
 '6391c0d7-2b16-4b87-9d89-008d5246563e':'910·074',
 '85ad7a11-aa18-4a63-8987-71805de38ed8':'910·075',
 'd19fc26c-523a-4a73-865b-6347d375fa07':'910·076',
 '45f227fb-57f5-4fca-b118-0e47e25c0645':'910·077',
 '7cf758ab-4bae-4b80-8c1b-df5de1257646':'910·078',
 '04d6f84b-f5a5-4d7e-9868-b847ae93f175':'910·079',
 '0eac3521-8a88-4fc5-a211-1dabf928f8c5':'910·080'
};
export function rotuloComercialTerrazas(id){
 const value=Object.hasOwn(ROTULOS,id)?ROTULOS[id]:'';if(!value)return '';
 const [block,number]=value.split('·');return 'Manzana '+block+' · Lote '+number;
}
// Devuelve los mismos lotes con el número comercial a la vista; guarda el catastral en numero_catastral.
// Por identificador: aplicarlo dos veces da el mismo resultado y un lote ajeno queda igual.
export function rotularLotesTerrazas(slug,lots){
 if(slug!==SLUG_TERRAZAS||!Array.isArray(lots))return lots;
 return lots.map(lot=>{const label=rotuloComercialTerrazas(lot?.id);return label&&lot.numero!==label?{...lot,numero:label,numero_catastral:lot.numero_catastral??lot.numero}:lot});
}
