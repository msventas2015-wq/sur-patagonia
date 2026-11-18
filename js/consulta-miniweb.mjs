const bytes = new TextEncoder();
const decimal = /\p{Decimal_Number}/u;
const mensajes = {
  nombre: 'Escriba un nombre de hasta 120 caracteres.',
  mensaje: 'Revise el mensaje. La consulta completa admite hasta 2000 caracteres.',
  contacto: 'Indique un correo o un teléfono para recibir respuesta.',
  email: 'Revise el correo electrónico.',
  telefono: 'Escriba un teléfono de 7 a 15 dígitos. Puede incluir el código de país.',
  contacto_400: 'Revise los datos de la consulta antes de enviarla.',
  contacto_429: 'Se alcanzó el límite de consultas. Espere unos minutos antes de volver a enviar.',
  lote_no_disponible: 'Este lote ya no está disponible para consultas. Actualice el plano para elegir otro lote.'
};

function digito(valor) {
  if (!decimal.test(valor)) return valor;
  const punto = valor.codePointAt(0);
  let inicio = punto;
  while (inicio > 0 && decimal.test(String.fromCodePoint(inicio - 1))) inicio--;
  return String((punto - inicio) % 10);
}

function texto(valor, campo) {
  const normal = String(valor ?? '').replace(/\r\n?/g, '\n').normalize('NFC');
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\p{Cs}]/u.test(normal)) throw Error(campo);
  return normal.trim();
}

export function validarConsulta(campos, prefijoProyecto = '') {
  const nombre = texto(campos.nombre, 'nombre').replace(/\s+/gu, ' ');
  const mensaje = texto(campos.mensaje, 'mensaje');
  const completo = texto(prefijoProyecto + mensaje, 'mensaje');
  if (!nombre || [...nombre].length > 120 || bytes.encode(nombre).length > 480) throw Error('nombre');
  if (!completo || [...completo].length > 2000 || bytes.encode(completo).length > 8000) throw Error('mensaje');
  const email = texto(campos.email, 'email');
  const telefono = Array.from(texto(campos.telefono, 'telefono'), digito).join('').replace(/[\s()-]/gu, '');
  if (!email && !telefono) throw Error('contacto');
  if (email) {
    const partes = email.split('@');
    if (partes.length !== 2 || !partes[0] || /[\s\p{Cc}]/u.test(email) ||
        !/^[^.]+(?:\.[^.]+)+$/u.test(partes[1]) || [...partes[0]].length > 64 ||
        [...partes[1]].length > 253 || bytes.encode(partes[0] + '@' + partes[1].toLowerCase()).length > 254) throw Error('email');
  }
  if (texto(campos.telefono, 'telefono') && !/^\+?[0-9]{7,15}$/.test(telefono)) throw Error('telefono');
  return {...campos, nombre, mensaje, email, telefono};
}

export function errorConsulta(error) {
  return mensajes[error?.message] || 'No pudimos confirmar el envío. Sus datos siguen en el formulario. Puede volver a intentarlo.';
}
