/* ==========================================================================
   encuesta.js  —  Lógica del flujo del niño
   --------------------------------------------------------------------------
   Lo usan tres páginas:
     · index.html      → nombre, edad y género, y creación de la sesión
     · encuesta.html   → las 15 preguntas, una por pantalla
     · revelacion.html → la verdad + el resumen de sus propias respuestas

   El niño NO puede leer datos de 'sesiones' ni de 'respuestas' (política RLS),
   así que todo lo que necesita ver de vuelta se guarda también en localStorage.
   ========================================================================== */

import { crearCliente, configurado } from './config.js';

/* ------------------------------------------------------------- Claves --- */

const CLAVE_SESION     = 'encuesta_sesion_v1';     // uuid de la sesión
const CLAVE_DATOS      = 'encuesta_datos_v2';      // nombre, edad, genero
const CLAVE_RESPUESTAS = 'encuesta_respuestas_v2'; // { antes: {...}, despues: {...} }
const CLAVE_INDICE     = 'encuesta_indice_v2';     // { antes: n, despues: n }
const CLAVE_MOMENTO    = 'encuesta_momento_v1';    // 'antes' o 'despues'
const CLAVE_ORDEN      = 'encuesta_orden_v1';      // orden azaroso de profesiones
const CLAVE_HISTORIAS  = 'encuesta_historias_v1';  // true si ya vio el carrusel
const CLAVE_TERMINADA  = 'encuesta_terminada_v1';  // true cuando terminó todo

/** Las dos vueltas de la encuesta. */
export const MOMENTOS = ['antes', 'despues'];

/* ------------------------------------------------------- Utilidades ----- */

/** Lee un JSON de localStorage sin reventar si está corrupto o bloqueado. */
function leerLocal(clave, porDefecto) {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo === null ? porDefecto : JSON.parse(crudo);
  } catch {
    return porDefecto;
  }
}

/** Guarda un JSON en localStorage; si el navegador lo impide, no falla. */
function escribirLocal(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* modo privado o almacenamiento lleno: la encuesta sigue funcionando */
  }
}

/** UUID v4, con respaldo para navegadores antiguos. */
function nuevoUuid() {
  if (window.crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Convierte el error de Supabase en un mensaje entendible. */
export function mensajeDeError(error) {
  if (!error) return 'Ocurrió un problema inesperado.';
  const texto = error.message || String(error);
  if (/Failed to fetch|NetworkError|network/i.test(texto)) {
    return 'No hay conexión con el servidor. Revisa tu internet e intenta otra vez.';
  }
  if (/row-level security|violates/i.test(texto)) {
    return 'El servidor rechazó los datos. Puede que la encuesta ya se haya cerrado; avisa a tu profesor/a.';
  }
  if (/JWT|apikey|Invalid API key/i.test(texto)) {
    return 'La aplicación no está bien configurada (clave de Supabase). Avisa al administrador.';
  }
  return texto;
}

/* ------------------------------------------------- Estado del niño ----- */

export function idSesion()            { return leerLocal(CLAVE_SESION, null); }
export function datosParticipante()   { return leerLocal(CLAVE_DATOS, {}); }
export function encuestaTerminada()   { return leerLocal(CLAVE_TERMINADA, false) === true; }
export function historiasVistas()     { return leerLocal(CLAVE_HISTORIAS, false) === true; }

/** En qué vuelta va el niño: 'antes' mientras no haya visto las historias. */
export function momentoActual()       { return leerLocal(CLAVE_MOMENTO, 'antes'); }

/** Respuestas guardadas en este navegador, de una vuelta concreta. */
export function respuestasLocales(momento = momentoActual()) {
  const todas = leerLocal(CLAVE_RESPUESTAS, {});
  return todas[momento] || {};
}

/** En qué pregunta se quedó, dentro de la vuelta indicada. */
export function indiceGuardado(momento = momentoActual()) {
  const todos = leerLocal(CLAVE_INDICE, {});
  return todos[momento] || 0;
}

export function guardarIndice(i, momento = momentoActual()) {
  const todos = leerLocal(CLAVE_INDICE, {});
  todos[momento] = i;
  escribirLocal(CLAVE_INDICE, todos);
}

export function marcarTerminadaLocal() { escribirLocal(CLAVE_TERMINADA, true); }

/** Se llama al salir del carrusel: a partir de aquí empieza la segunda vuelta. */
export function empezarSegundaVuelta() {
  escribirLocal(CLAVE_HISTORIAS, true);
  escribirLocal(CLAVE_MOMENTO, 'despues');
}

/** Borra todo el rastro local para empezar una encuesta nueva. */
export function reiniciarLocal() {
  [CLAVE_SESION, CLAVE_DATOS, CLAVE_RESPUESTAS, CLAVE_INDICE,
   CLAVE_MOMENTO, CLAVE_HISTORIAS, CLAVE_TERMINADA, CLAVE_ORDEN]
    .forEach((c) => { try { localStorage.removeItem(c); } catch { /* nada */ } });
}

/* ------------------------------------------------------- Supabase ------ */

let clienteCache = null;

/** Cliente único de Supabase para toda la página. */
export function db() {
  if (!clienteCache) clienteCache = crearCliente();
  return clienteCache;
}

export { configurado };

/* ------------------------------------------- Imágenes de la encuesta --- */

/**
 * Carpeta de donde salen las fotos que ve el niño mientras responde.
 *
 * 'assets/img_ppts/' son las del carrusel: muestran a la mujer y su nombre,
 * así que el niño ve la respuesta antes de responder.
 * 'assets/img/' son las fotos sin rostro, donde no se distingue quién trabaja.
 * Cambiar esta constante y USAR_IMAGEN_DE_CARPETA basta para volver atrás.
 */
export const CARPETA_IMAGENES = 'assets/img_ppts/';
export const USAR_IMAGEN_DE_CARPETA = true;

/** Una imagen representativa por carpeta, ligada a la etiqueta de cada profesión. */
const IMAGEN_POR_PROFESION = {
  astronauta: 'astronautas/01-koch-y-meir.png',
  excavadora: 'excavadora/01-juana-torres.png',
  nuclear:    'nucleares/01-marie-curie.png',
  camion:     'conductoras/01-maria-cruz.png',
  bombero:    'bomberas/01-bomberas.png'
};

/** Ruta final de la foto de un bloque, según la carpeta elegida arriba. */
export function rutaImagen(bloque) {
  if (USAR_IMAGEN_DE_CARPETA && IMAGEN_POR_PROFESION[bloque.etiqueta]) {
    return CARPETA_IMAGENES + IMAGEN_POR_PROFESION[bloque.etiqueta];
  }
  return 'assets/img/' + bloque.imagen;
}

/* ------------------------------------------------ Orden aleatorio ------ */

/** Baraja una copia del arreglo (Fisher-Yates). */
function barajar(lista) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Ordena las profesiones al azar, pero SOLO la primera vez.
 *
 * El orden se guarda en el navegador porque debe ser el mismo si el niño
 * recarga a media encuesta, y también en la segunda vuelta: si cambiara,
 * el antes y el después dejarían de ser comparables.
 */
function ordenarAlAzar(bloques) {
  let orden = leerLocal(CLAVE_ORDEN, null);
  const ids = bloques.map((b) => b.id);

  const sirve = Array.isArray(orden) && orden.length === ids.length &&
                ids.every((id) => orden.includes(id));
  if (!sirve) {
    orden = barajar(ids);
    escribirLocal(CLAVE_ORDEN, orden);
  }

  return orden.map((id) => bloques.find((b) => b.id === id));
}

/**
 * Trae el contenido completo de la encuesta: 5 profesiones, cada una con sus
 * 2 preguntas, cada una con sus opciones. Las profesiones salen barajadas.
 */
export async function cargarContenido() {
  const { data, error } = await db()
    .from('profesiones')
    .select(`
      id, orden, etiqueta, nombre_real, imagen,
      preguntas ( id, orden, codigo, texto,
        opciones ( id, orden, texto, emoji )
      )
    `);

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('La encuesta todavía no tiene contenido. Ejecuta sql/schema.sql en Supabase.');
  }

  // El orden lo garantizamos aquí, no en el servidor.
  const bloques = data.slice().sort((a, b) => a.orden - b.orden);
  bloques.forEach((bloque) => {
    bloque.preguntas.sort((a, b) => a.orden - b.orden);
    bloque.preguntas.forEach((p) => p.opciones.sort((a, b) => a.orden - b.orden));
  });

  // Cada niño ve las profesiones en un orden distinto, para que el cansancio
  // de las últimas preguntas no recaiga siempre sobre la misma profesión.
  return ordenarAlAzar(bloques);
}

/**
 * Aplana los 5 bloques en la lista de 10 pantallas que verá el niño.
 * Cada paso lleva su pregunta y también el bloque, porque la foto se
 * mantiene durante las 2 preguntas del mismo trabajo.
 */
export function aplanarPasos(bloques) {
  const pasos = [];
  bloques.forEach((bloque, i) => {
    bloque.preguntas.forEach((pregunta) => {
      pasos.push({ bloque, numeroBloque: i + 1, pregunta });
    });
  });
  return pasos;
}

/** Devuelve la ronda activa; si no hay ninguna, la encuesta está cerrada. */
async function rondaActiva() {
  const { data, error } = await db()
    .from('rondas')
    .select('id, nombre')
    .eq('activa', true)
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('La encuesta está cerrada en este momento. Avisa a tu profesor/a.');
  }
  return data[0];
}

/** Las únicas respuestas válidas para el género, iguales que en la base. */
export const GENEROS = ['Niño', 'Niña', 'Prefiero no decirlo'];

/**
 * Crea la sesión del niño y la guarda en localStorage.
 * Los tres datos son obligatorios; la portada ya los valida, esto es la
 * segunda barrera por si alguien llama a la función por su cuenta.
 */
export async function crearSesion({ nombre, edad, genero }) {
  const nombreLimpio = (nombre || '').trim().slice(0, 40);
  const edadNumero = Number(edad);

  if (nombreLimpio.length < 2) {
    throw new Error('Escribe tu nombre para poder empezar.');
  }
  if (!Number.isInteger(edadNumero) || edadNumero < 6 || edadNumero > 12) {
    throw new Error('Elige tu edad, entre 6 y 12, para poder empezar.');
  }
  if (!GENEROS.includes(genero)) {
    throw new Error('Elige una de las tres opciones para poder empezar.');
  }

  const ronda = await rondaActiva();
  const id = nuevoUuid();

  const fila = {
    id,
    ronda_id: ronda.id,
    nombre: nombreLimpio,
    edad: edadNumero,
    genero,
    completada: false
  };

  // Sin .select(): el rol anónimo no tiene permiso de lectura sobre 'sesiones'.
  const { error } = await db().from('sesiones').insert(fila);
  if (error) throw error;

  escribirLocal(CLAVE_SESION, id);
  escribirLocal(CLAVE_DATOS, { nombre: fila.nombre, edad: fila.edad, genero: fila.genero });
  escribirLocal(CLAVE_RESPUESTAS, { antes: {}, despues: {} });
  escribirLocal(CLAVE_INDICE, { antes: 0, despues: 0 });
  escribirLocal(CLAVE_MOMENTO, 'antes');
  escribirLocal(CLAVE_HISTORIAS, false);
  escribirLocal(CLAVE_TERMINADA, false);
  return id;
}

/**
 * Guarda (o corrige) una respuesta. Se llama al avanzar, no al final,
 * para no perder nada si el niño cierra la pestaña a mitad de camino.
 */
export async function guardarRespuesta(preguntaId, opcionId, momento = momentoActual()) {
  const sesion = idSesion();
  if (!sesion) throw new Error('Se perdió tu sesión. Vuelve a empezar desde el inicio.');

  // Va por una función del servidor, no por un upsert directo: el niño no tiene
  // permiso de lectura, y sin él un UPDATE con filtro no afectaría ninguna fila.
  const { error } = await db().rpc('guardar_respuesta', {
    p_sesion: sesion,
    p_pregunta: preguntaId,
    p_opcion: opcionId,
    p_momento: momento
  });
  if (error) throw error;

  const todas = leerLocal(CLAVE_RESPUESTAS, {});
  if (!todas[momento]) todas[momento] = {};
  todas[momento][preguntaId] = opcionId;
  escribirLocal(CLAVE_RESPUESTAS, todas);
}

/** Marca la sesión como completada al terminar las 15 preguntas. */
export async function completarSesion() {
  const sesion = idSesion();
  if (!sesion) throw new Error('Se perdió tu sesión.');

  const { error } = await db().rpc('completar_sesion', { p_sesion: sesion });
  if (error) throw error;

  marcarTerminadaLocal();
}

/* ----------------------------------------- Resumen personal del niño --- */

/** Texto de la opción que eligió, o null si esa pregunta quedó sin responder. */
function textoElegido(pregunta, respuestas) {
  const opcion = pregunta.opciones.find((o) => o.id === respuestas[pregunta.id]);
  return opcion ? opcion.texto : null;
}

/**
 * Cuenta, en la pregunta 1 de los 5 trabajos, cuántas veces dijo cada cosa
 * en una de las dos vueltas.
 */
export function resumenPersonal(bloques, momento = momentoActual()) {
  const respuestas = respuestasLocales(momento);
  const detalle = [];
  let varon = 0, mujer = 0, dudas = 0;

  bloques.forEach((bloque) => {
    const p1 = bloque.preguntas.find((p) => p.codigo === 'p1');
    if (!p1) return;

    const texto = textoElegido(p1, respuestas);
    if (texto === 'Un varón') varon += 1;
    else if (texto === 'Una mujer') mujer += 1;
    else if (texto) dudas += 1;

    detalle.push({
      etiqueta: bloque.etiqueta,
      profesion: bloque.nombre_real,
      respuesta: texto
    });
  });

  return { total: detalle.length, varon, mujer, dudas, detalle };
}

/**
 * Compara las dos vueltas, que es lo que mide el proyecto.
 * Devuelve, por cada una de las 15 preguntas, lo que respondió antes y después,
 * y de paso el conteo de "Un varón" en la pregunta 1 de cada momento.
 */
export function comparacionPersonal(bloques) {
  const antes = respuestasLocales('antes');
  const despues = respuestasLocales('despues');

  const preguntas = [];
  let cambios = 0;
  let varonAntes = 0, varonDespues = 0, totalP1 = 0;

  bloques.forEach((bloque) => {
    bloque.preguntas.forEach((pregunta) => {
      const a = textoElegido(pregunta, antes);
      const d = textoElegido(pregunta, despues);
      const cambio = a !== null && d !== null && a !== d;
      if (cambio) cambios += 1;

      if (pregunta.codigo === 'p1') {
        totalP1 += 1;
        if (a === 'Un varón') varonAntes += 1;
        if (d === 'Un varón') varonDespues += 1;
      }

      preguntas.push({
        profesion: bloque.nombre_real,
        etiqueta: bloque.etiqueta,
        codigo: pregunta.codigo,
        texto: pregunta.texto,
        antes: a,
        despues: d,
        cambio
      });
    });
  });

  return { preguntas, cambios, totalP1, varonAntes, varonDespues };
}

/* -------------------------------------------- Ayudas para la interfaz --- */

/** Pinta un aviso rojo cuando faltan las credenciales de Supabase. */
export function avisarSiFaltaConfiguracion(contenedor) {
  if (configurado()) return false;
  contenedor.innerHTML = `
    <div class="aviso-config" role="alert">
      ⚠️ Falta configurar Supabase. Copia <code>assets/js/config.example.js</code>
      como <code>assets/js/config.js</code> y pega la URL y la anon key de tu proyecto.
    </div>`;
  contenedor.classList.remove('oculto');
  return true;
}

/** Muestra un mensaje de error en un contenedor de Bootstrap. */
export function mostrarError(contenedor, error) {
  contenedor.innerHTML = `
    <div class="alert alert-danger rounded-4 fw-bold mb-0" role="alert">
      ${mensajeDeError(error)}
    </div>`;
  contenedor.classList.remove('oculto');
}

/** Oculta el contenedor de errores. */
export function limpiarError(contenedor) {
  contenedor.innerHTML = '';
  contenedor.classList.add('oculto');
}
