/* ==========================================================================
   dashboard.js  —  Resultados de la encuesta (solo administrador)
   --------------------------------------------------------------------------
   La encuesta se responde DOS veces: 'antes' de ver las historias de las
   mujeres y 'despues' de verlas. Casi todo lo que hay aquí compara esas dos
   vueltas, porque esa diferencia es lo que mide el proyecto.

   Todo exige una sesión de Supabase Auth: las políticas RLS solo dejan leer
   'sesiones' y 'respuestas' al rol 'authenticated'.
   ========================================================================== */

import { db, exigirSesion, cerrarSesion, reautenticar, configurado } from './auth.js?v=5';

/* --------------------------------------------------------- Constantes --- */

const COLORES = {
  'Un varón':          '#6C5CE7',
  'Una mujer':         '#FF6B9D',
  'Ambos':             '#00B8A9',
  'Sí':                '#00B8A9',
  'No':                '#E8452C',
  'No estoy seguro/a': '#B8B5CC'
};
const COLOR_POR_DEFECTO = '#FFC93C';

// Las dos vueltas, con su color y su nombre en pantalla.
const MOMENTOS = [
  { clave: 'antes',   nombre: 'Antes',   color: '#6C5CE7' },
  { clave: 'despues', nombre: 'Después', color: '#00B8A9' }
];

const TAMANO_PAGINA = 1000; // límite por consulta en PostgREST

/* -------------------------------------------------------- Estado vivo --- */

const estado = {
  rondas: [],
  sesiones: [],
  respuestas: [],
  profesiones: [],
  filtros: { ronda: 'activa', genero: '', desde: '', hasta: '' }
};

const graficos = new Map();

/* ------------------------------------------------------------ Ayudas --- */

const $ = (id) => document.getElementById(id);

function mostrarAviso(mensaje, tipo = 'danger') {
  const caja = $('avisos');
  caja.innerHTML = `<div class="alert alert-${tipo} rounded-4 mb-0" role="alert">${mensaje}</div>`;
  caja.classList.remove('oculto');
}

function limpiarAviso() {
  $('avisos').innerHTML = '';
  $('avisos').classList.add('oculto');
}

function cargando(activo) {
  $('cargando').classList.toggle('oculto', !activo);
  $('contenido').classList.toggle('oculto', activo);
  $('btn-actualizar').disabled = activo;
}

function porcentaje(parte, total) {
  if (!total) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

function fechaLegible(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Trae todas las filas de una tabla o vista, en páginas de 1000. */
async function traerTodo(origen, columnas, ordenarPor, aplicarFiltros) {
  let desde = 0;
  const filas = [];

  for (;;) {
    let consulta = db().from(origen).select(columnas)
      .order(ordenarPor, { ascending: true })
      .range(desde, desde + TAMANO_PAGINA - 1);

    if (aplicarFiltros) consulta = aplicarFiltros(consulta);

    const { data, error } = await consulta;
    if (error) throw error;

    filas.push(...data);
    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  return filas;
}

/* ------------------------------------------------- Carga de los datos --- */

function rondaSeleccionada() {
  const valor = estado.filtros.ronda;
  if (valor === 'todas') return null;
  if (valor === 'activa') {
    const activa = estado.rondas.find((r) => r.activa);
    return activa ? activa.id : null;
  }
  return Number(valor);
}

async function cargarDatos() {
  cargando(true);
  limpiarAviso();

  try {
    estado.rondas = await traerTodo('rondas', 'id, nombre, activa, creada_en', 'id');
    estado.profesiones = await traerTodo(
      'profesiones', 'id, orden, etiqueta, nombre_real, imagen', 'orden');

    pintarSelectorDeRondas();
    const idRonda = rondaSeleccionada();

    estado.sesiones = await traerTodo(
      'sesiones', 'id, ronda_id, nombre, edad, genero, grado, completada, creada_en', 'creada_en',
      (q) => (idRonda ? q.eq('ronda_id', idRonda) : q)
    );

    estado.respuestas = await traerTodo(
      'v_respuestas', '*', 'respuesta_id',
      (q) => (idRonda ? q.eq('ronda_id', idRonda) : q)
    );

    pintarTodo();
  } catch (error) {
    mostrarAviso(
      'No se pudieron cargar los datos: ' + escaparHtml(error.message || error) +
      '. Verifica que ejecutaste <code>sql/schema.sql</code> y que tu usuario está autenticado.'
    );
  } finally {
    cargando(false);
  }
}

/* ------------------------------------------------------- Filtros base --- */

function sesionesFiltradas() {
  const { genero, desde, hasta } = estado.filtros;
  const limiteInferior = desde ? new Date(desde + 'T00:00:00') : null;
  const limiteSuperior = hasta ? new Date(hasta + 'T23:59:59') : null;

  return estado.sesiones.filter((s) => {
    if (genero && (s.genero || '') !== genero) return false;
    const creada = new Date(s.creada_en);
    if (limiteInferior && creada < limiteInferior) return false;
    if (limiteSuperior && creada > limiteSuperior) return false;
    return true;
  });
}

function respuestasFiltradas() {
  const permitidas = new Set(sesionesFiltradas().map((s) => s.id));
  return estado.respuestas.filter((r) => permitidas.has(r.sesion_id));
}

/** Las respuestas de una sola vuelta. */
const deMomento = (filas, momento) => filas.filter((r) => r.momento === momento);

/* ------------------------------------------------------------ Pintado --- */

function pintarTodo() {
  pintarFiltroDeGeneros();
  pintarResumen();
  pintarIndicadorPrincipal();
  pintarCruces();
  pintarBloquesPorProfesion();
  pintarTabla();
}

function pintarSelectorDeRondas() {
  const select = $('filtro-ronda');
  const actual = estado.filtros.ronda;

  const opciones = ['<option value="activa">Ronda activa</option>',
                    '<option value="todas">Todas las rondas</option>'];
  estado.rondas.slice().reverse().forEach((r) => {
    opciones.push(
      `<option value="${r.id}">${escaparHtml(r.nombre)}${r.activa ? ' (activa)' : ''}</option>`
    );
  });

  select.innerHTML = opciones.join('');
  select.value = actual;
}

function pintarFiltroDeGeneros() {
  const select = $('filtro-genero');
  const actual = estado.filtros.genero;
  const generos = [...new Set(estado.sesiones.map((s) => s.genero).filter(Boolean))].sort();

  select.innerHTML = '<option value="">Todos</option>' +
    generos.map((g) => `<option value="${escaparHtml(g)}">${escaparHtml(g)}</option>`).join('');
  select.value = generos.includes(actual) ? actual : '';
  estado.filtros.genero = select.value;
}

/* --- Tarjetas de resumen -------------------------------------------- */

/**
 * Cuántas respuestas cambió cada niño entre las dos vueltas.
 * Solo cuenta preguntas que respondió en ambas.
 */
function cambiosDeOpinion() {
  const porSesion = new Map(); // sesion -> Map(pregunta -> { antes, despues })

  respuestasFiltradas().forEach((r) => {
    if (!porSesion.has(r.sesion_id)) porSesion.set(r.sesion_id, new Map());
    const preguntas = porSesion.get(r.sesion_id);
    if (!preguntas.has(r.pregunta_id)) preguntas.set(r.pregunta_id, {});
    preguntas.get(r.pregunta_id)[r.momento] = r.respuesta;
  });

  let cambios = 0, comparables = 0;
  const porNino = new Map();

  porSesion.forEach((preguntas, sesion) => {
    let n = 0;
    preguntas.forEach((par) => {
      if (par.antes === undefined || par.despues === undefined) return;
      comparables += 1;
      if (par.antes !== par.despues) { cambios += 1; n += 1; }
    });
    porNino.set(sesion, n);
  });

  return { cambios, comparables, porNino };
}

function pintarResumen() {
  const sesiones = sesionesFiltradas();
  const respuestas = respuestasFiltradas();

  const total = sesiones.length;
  const completadas = sesiones.filter((s) => s.completada).length;
  const ultima = respuestas.reduce(
    (max, r) => (!max || r.respondida_en > max ? r.respondida_en : max), null);

  const { cambios, comparables } = cambiosDeOpinion();

  $('kpi-participantes').textContent = total;
  $('kpi-completadas').textContent = completadas;
  $('kpi-tasa').textContent = porcentaje(completadas, total) + '%';
  $('kpi-ultima').textContent = fechaLegible(ultima);
  $('kpi-respuestas').textContent =
    `${deMomento(respuestas, 'antes').length} antes · ${deMomento(respuestas, 'despues').length} después`;

  $('kpi-cambios').textContent = cambios;
  $('kpi-cambios-detalle').textContent = comparables
    ? `de ${comparables} respuestas comparables (${porcentaje(cambios, comparables)}%)`
    : 'aún no hay pares que comparar';
}

/* --- Indicador principal: % "Un varón" en la P1, antes y después ----- */

/**
 * Por cada profesión y cada vuelta, cuántos eligieron cada opción de una
 * pregunta. Devuelve una fila por profesión.
 */
function conteoPorProfesion(codigoPregunta) {
  const filas = respuestasFiltradas().filter((r) => r.pregunta_codigo === codigoPregunta);
  const mapa = new Map();

  estado.profesiones.forEach((p) => {
    mapa.set(p.orden, {
      nombre: p.nombre_real,
      etiqueta: p.etiqueta,
      antes:   { total: 0, opciones: new Map() },
      despues: { total: 0, opciones: new Map() }
    });
  });

  filas.forEach((r) => {
    const fila = mapa.get(r.profesion_orden);
    if (!fila || !fila[r.momento]) return;
    const m = fila[r.momento];
    m.total += 1;
    m.opciones.set(r.respuesta, (m.opciones.get(r.respuesta) || 0) + 1);
  });

  return [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

function pintarIndicadorPrincipal() {
  const filas = conteoPorProfesion('p1');
  const etiquetas = filas.map((f) => f.nombre);

  const conjuntos = MOMENTOS.map((m) => ({
    label: m.nombre,
    data: filas.map((f) => porcentaje(f[m.clave].opciones.get('Un varón') || 0, f[m.clave].total)),
    backgroundColor: m.color,
    borderRadius: 8,
    maxBarThickness: 46
  }));

  dibujar('grafico-principal', {
    type: 'bar',
    data: { labels: etiquetas, datasets: conjuntos },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const m = MOMENTOS[ctx.datasetIndex].clave;
              const f = filas[ctx.dataIndex][m];
              return `${ctx.dataset.label}: ${ctx.parsed.y}% (${f.opciones.get('Un varón') || 0} de ${f.total})`;
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%' } },
        x: { ticks: { autoSkip: false, maxRotation: 30 } }
      }
    }
  });

  // La frase que resume el hallazgo del proyecto.
  const suma = (m) => filas.reduce((a, f) => a + (f[m].opciones.get('Un varón') || 0), 0);
  const totales = (m) => filas.reduce((a, f) => a + f[m].total, 0);

  const vAntes = suma('antes'), tAntes = totales('antes');
  const vDespues = suma('despues'), tDespues = totales('despues');

  if (!tAntes) {
    $('resumen-indicador').textContent = 'Todavía no hay respuestas en esta ronda.';
    return;
  }

  const pAntes = porcentaje(vAntes, tAntes);
  const pDespues = porcentaje(vDespues, tDespues);

  let texto = `Antes de conocer las historias, el ${pAntes}% de las respuestas a la pregunta 1 dijeron "Un varón" (${vAntes} de ${tAntes}).`;
  if (!tDespues) {
    texto += ' Todavía nadie ha respondido la segunda vuelta.';
  } else {
    texto += ` Después, el ${pDespues}% (${vDespues} de ${tDespues}).`;
    const dif = Math.round((pAntes - pDespues) * 10) / 10;
    if (dif > 0) texto += ` Son ${dif} puntos menos.`;
    else if (dif < 0) texto += ` Son ${Math.abs(dif)} puntos más.`;
    else texto += ' No hubo diferencia.';
  }
  $('resumen-indicador').textContent = texto;
}

/* --- Un bloque por profesión, con sus 3 preguntas antes y después ---- */

function pintarBloquesPorProfesion() {
  const contenedor = $('bloques-profesiones');
  const respuestas = respuestasFiltradas();
  contenedor.innerHTML = '';

  estado.profesiones.forEach((profesion) => {
    const suyas = respuestas.filter((r) => r.profesion_id === profesion.id);

    const preguntas = ['p1', 'p2', 'p3'].map((codigo) => {
      const deLaPregunta = suyas.filter((r) => r.pregunta_codigo === codigo);
      const conteo = { antes: new Map(), despues: new Map() };
      const totales = { antes: 0, despues: 0 };

      deLaPregunta.forEach((r) => {
        if (!conteo[r.momento]) return;
        conteo[r.momento].set(r.respuesta, (conteo[r.momento].get(r.respuesta) || 0) + 1);
        totales[r.momento] += 1;
      });

      // Todas las opciones que aparecieron en cualquiera de las dos vueltas.
      const opciones = [...new Set([...conteo.antes.keys(), ...conteo.despues.keys()])];

      return {
        codigo,
        texto: deLaPregunta.length ? deLaPregunta[0].pregunta : textoPreguntaPorDefecto(codigo),
        conteo, totales, opciones
      };
    });

    const bloque = document.createElement('section');
    bloque.className = 'tarjeta p-4 mb-4';
    bloque.innerHTML = `
      <div class="d-flex align-items-center gap-3 mb-3">
        <img src="assets/img/${escaparHtml(profesion.imagen)}" alt="" loading="lazy"
             style="width:64px; height:64px; object-fit:cover; border-radius:14px">
        <div>
          <h3 class="h5 mb-0">${profesion.orden}. ${escaparHtml(profesion.nombre_real)}</h3>
          <span style="color:var(--gris); font-size:.9rem">
            ${deMomento(suyas, 'antes').length} respuestas antes ·
            ${deMomento(suyas, 'despues').length} después
          </span>
        </div>
      </div>
      <div class="row g-4">
        ${preguntas.map((p) => `
          <div class="col-12 col-xl-4">
            <p class="fw-bold mb-2" style="font-size:.95rem">${escaparHtml(p.texto)}</p>
            <div class="caja-grafico" style="height:260px">
              <canvas id="g-${profesion.etiqueta}-${p.codigo}"></canvas>
            </div>
            ${tablaAntesDespues(p)}
          </div>`).join('')}
      </div>`;

    contenedor.appendChild(bloque);

    preguntas.forEach((p) => {
      if (p.opciones.length === 0) { dibujarVacio(`g-${profesion.etiqueta}-${p.codigo}`); return; }

      dibujar(`g-${profesion.etiqueta}-${p.codigo}`, {
        type: 'bar',
        data: {
          labels: p.opciones,
          datasets: MOMENTOS.map((m) => ({
            label: m.nombre,
            data: p.opciones.map((o) => p.conteo[m.clave].get(o) || 0),
            backgroundColor: m.color,
            borderRadius: 8,
            maxBarThickness: 34
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const m = MOMENTOS[ctx.datasetIndex].clave;
                  return `${ctx.dataset.label}: ${ctx.parsed.y} (${porcentaje(ctx.parsed.y, p.totales[m])}%)`;
                }
              }
            }
          },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    });
  });
}

function textoPreguntaPorDefecto(codigo) {
  return {
    p1: '¿Quién crees que está realizando este trabajo?',
    p2: '¿Consideras que esta profesión puede ser realizada tanto por varones como por mujeres?',
    p3: '¿Quién crees que puede realizar mejor este trabajo?'
  }[codigo];
}

/** Tabla con el conteo y el porcentaje de cada opción, en las dos vueltas. */
function tablaAntesDespues(pregunta) {
  if (pregunta.opciones.length === 0) {
    return '<p class="mb-0" style="color:var(--gris); font-size:.9rem">Sin respuestas todavía.</p>';
  }

  const filas = pregunta.opciones.map((opcion) => {
    const a = pregunta.conteo.antes.get(opcion) || 0;
    const d = pregunta.conteo.despues.get(opcion) || 0;
    return `
      <tr>
        <td>${escaparHtml(opcion)}</td>
        <td class="text-end">${a} <span style="color:var(--gris)">(${porcentaje(a, pregunta.totales.antes)}%)</span></td>
        <td class="text-end">${d} <span style="color:var(--gris)">(${porcentaje(d, pregunta.totales.despues)}%)</span></td>
      </tr>`;
  }).join('');

  return `<table class="table table-sm mt-2 mb-0" style="font-size:.88rem">
            <thead><tr>
              <th></th><th class="text-end">Antes</th><th class="text-end">Después</th>
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>`;
}

/* --- Vistas cruzadas: por edad y por género, antes y después --------- */

function tramoDeEdad(edad) {
  if (edad === null || edad === undefined) return 'Sin dato';
  if (edad <= 7) return '6-7 años';
  if (edad <= 9) return '8-9 años';
  if (edad <= 11) return '10-11 años';
  return '12 años a más';
}

/**
 * % que respondió "Un varón" en la P1, agrupado por una característica de la
 * sesión, separando las dos vueltas.
 */
function cruce(obtenerClave) {
  const sesiones = new Map(sesionesFiltradas().map((s) => [s.id, s]));
  const grupos = new Map();

  respuestasFiltradas()
    .filter((r) => r.pregunta_codigo === 'p1')
    .forEach((r) => {
      const sesion = sesiones.get(r.sesion_id);
      if (!sesion) return;
      const clave = obtenerClave(sesion);
      if (!grupos.has(clave)) {
        grupos.set(clave, { antes: { varon: 0, total: 0 }, despues: { varon: 0, total: 0 } });
      }
      const g = grupos.get(clave)[r.momento];
      if (!g) return;
      g.total += 1;
      if (r.respuesta === 'Un varón') g.varon += 1;
    });

  return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
}

function pintarCruces() {
  dibujarCruce('grafico-edad', cruce((s) => tramoDeEdad(s.edad)), 'Por edad');
  dibujarCruce('grafico-genero', cruce((s) => s.genero || 'Sin dato'),
               'Por género de quien responde');
}

function dibujarCruce(canvasId, datos, titulo) {
  if (datos.length === 0) { dibujarVacio(canvasId); return; }

  dibujar(canvasId, {
    type: 'bar',
    data: {
      labels: datos.map(([clave]) => clave),
      datasets: MOMENTOS.map((m) => ({
        label: m.nombre,
        data: datos.map(([, v]) => porcentaje(v[m.clave].varon, v[m.clave].total)),
        backgroundColor: m.color,
        borderRadius: 8,
        maxBarThickness: 40
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        title: { display: true, text: titulo + ' · % "Un varón" en la pregunta 1' },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const m = MOMENTOS[ctx.datasetIndex].clave;
              const g = datos[ctx.dataIndex][1][m];
              return `${ctx.dataset.label}: ${ctx.parsed.y}% (${g.varon} de ${g.total})`;
            }
          }
        }
      },
      scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%' } } }
    }
  });
}

/* --- Tabla de sesiones, con el detalle de las 15 preguntas ----------- */

function pintarTabla() {
  const sesiones = sesionesFiltradas();
  const respuestas = respuestasFiltradas();
  const rondasPorId = new Map(estado.rondas.map((r) => [r.id, r.nombre]));
  const { porNino } = cambiosDeOpinion();

  // sesión -> pregunta -> { antes, despues, codigo, texto, profesion, orden }
  const porSesion = new Map();
  respuestas.forEach((r) => {
    if (!porSesion.has(r.sesion_id)) porSesion.set(r.sesion_id, new Map());
    const preguntas = porSesion.get(r.sesion_id);
    if (!preguntas.has(r.pregunta_id)) {
      preguntas.set(r.pregunta_id, {
        codigo: r.pregunta_codigo, texto: r.pregunta,
        profesion: r.profesion_nombre, orden: r.profesion_orden
      });
    }
    preguntas.get(r.pregunta_id)[r.momento] = r.respuesta;
  });

  const cabecera = estado.profesiones
    .map((p) => `<th class="text-nowrap">${escaparHtml(p.nombre_real)}</th>`).join('');

  const cuerpo = sesiones.slice().reverse().map((s, i) => {
    const preguntas = porSesion.get(s.id) || new Map();

    // Columna por profesión: la P1, antes → después.
    const celdas = estado.profesiones.map((p) => {
      const par = [...preguntas.values()]
        .find((q) => q.codigo === 'p1' && q.orden === p.orden);
      if (!par) return '<td class="text-nowrap" style="color:#CCC">—</td>';
      const cambio = par.antes && par.despues && par.antes !== par.despues;
      return `<td class="text-nowrap${cambio ? ' celda-cambio' : ''}">
                ${pastilla(par.antes)} <span style="color:var(--gris)">→</span> ${pastilla(par.despues)}
              </td>`;
    }).join('');

    const cambios = porNino.get(s.id) || 0;
    const idDetalle = `detalle-${i}`;

    // Ojo: una tabla anidada dentro de otra se rompe al asignarla por
    // innerHTML, porque el analizador de HTML la reordena. Por eso el detalle
    // se dibuja con una rejilla de divs.
    const filasDetalle = [...preguntas.values()]
      .sort((a, b) => (a.orden - b.orden) || a.codigo.localeCompare(b.codigo))
      .map((q) => {
        const cambio = q.antes && q.despues && q.antes !== q.despues;
        return `<div class="detalle-fila${cambio ? ' cambio' : ''}">
                  <div>
                    <strong>${q.orden}. ${escaparHtml(q.profesion)}</strong><br>
                    <span style="color:var(--gris)">${escaparHtml(q.texto)}</span>
                  </div>
                  <div>${pastilla(q.antes)}</div>
                  <div>${pastilla(q.despues)}</div>
                  <div class="text-center">${cambio ? '🔁' : ''}</div>
                </div>`;
      }).join('');

    return `
      <tr>
        <td class="text-nowrap">${fechaLegible(s.creada_en)}</td>
        <td>${escaparHtml(s.nombre || '—')}</td>
        <td class="text-center">${s.edad ?? '—'}</td>
        <td>${escaparHtml(s.genero || '—')}</td>
        <td>${escaparHtml(rondasPorId.get(s.ronda_id) || s.ronda_id)}</td>
        <td class="text-center">${s.completada
          ? '<span class="badge text-bg-success">Sí</span>'
          : '<span class="badge text-bg-secondary">No</span>'}</td>
        ${celdas}
        <td class="text-center fw-bold">${cambios}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-secundario py-0 px-2" type="button"
                  data-bs-toggle="collapse" data-bs-target="#${idDetalle}"
                  aria-expanded="false" aria-controls="${idDetalle}">15 ▾</button>
        </td>
      </tr>
      <tr class="fila-detalle">
        <td colspan="${9 + estado.profesiones.length}" class="p-0 border-0">
          <div class="collapse" id="${idDetalle}">
            <div class="p-3" style="background:#FAF9FF">
              <p class="fw-bold mb-2">Las 15 preguntas de ${escaparHtml(s.nombre || 'esta sesión')}</p>
              <div class="detalle-preguntas">
                <div class="detalle-fila cabecera">
                  <div>Pregunta</div><div>Antes</div><div>Después</div>
                  <div class="text-center">Cambió</div>
                </div>
                ${filasDetalle || '<div class="detalle-fila"><div>Sin respuestas.</div><div></div><div></div><div></div></div>'}
              </div>
            </div>
          </div>
        </td>
      </tr>`;
  }).join('');

  const columnas = 8 + estado.profesiones.length;
  $('tabla-sesiones').innerHTML = `
    <thead>
      <tr>
        <th class="text-nowrap">Fecha</th>
        <th>Nombre</th>
        <th class="text-center">Edad</th>
        <th>Género</th>
        <th>Ronda</th>
        <th class="text-center">Completó</th>
        ${cabecera}
        <th class="text-center text-nowrap">Cambios</th>
        <th class="text-center">Detalle</th>
      </tr>
    </thead>
    <tbody>${cuerpo || `<tr><td colspan="${columnas}" class="text-center py-4" style="color:var(--gris)">No hay sesiones con estos filtros.</td></tr>`}</tbody>`;

  $('conteo-tabla').textContent = `${sesiones.length} sesiones`;
}

/** Respuesta con su color, o un guion si falta. */
function pastilla(texto) {
  if (!texto) return '<span style="color:#CCC">—</span>';
  const color = COLORES[texto] || COLOR_POR_DEFECTO;
  return `<span style="color:${color}; font-weight:700">${escaparHtml(texto)}</span>`;
}

/* --- Gráficos: crear y destruir -------------------------------------- */

function dibujar(canvasId, configuracion) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (graficos.has(canvasId)) graficos.get(canvasId).destroy();
  graficos.set(canvasId, new window.Chart(canvas, configuracion));
}

function dibujarVacio(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (graficos.has(canvasId)) { graficos.get(canvasId).destroy(); graficos.delete(canvasId); }
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

/* ------------------------------------------------------ Exportar CSV --- */

function aCsv(filas) {
  return filas.map((fila) => fila.map((celda) => {
    const texto = celda === null || celda === undefined ? '' : String(celda);
    return `"${texto.replace(/"/g, '""')}"`;
  }).join(';')).join('\r\n');
}

function descargar(nombre, contenido) {
  // El BOM inicial hace que Excel abra bien los acentos.
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function marcaDeTiempo() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

/** Detalle: una fila por respuesta, con su momento. */
function csvDetalle() {
  const sesiones = new Map(sesionesFiltradas().map((s) => [s.id, s]));
  const filas = [[
    'ronda', 'sesion_id', 'nombre', 'edad', 'genero', 'completada',
    'sesion_creada_en', 'momento', 'profesion_orden', 'profesion',
    'pregunta_codigo', 'pregunta', 'respuesta', 'respondida_en', 'grado_antiguo'
  ]];

  respuestasFiltradas().forEach((r) => {
    const s = sesiones.get(r.sesion_id) || {};
    filas.push([
      r.ronda, r.sesion_id, s.nombre, s.edad, s.genero, s.completada ? 'sí' : 'no',
      s.creada_en, r.momento, r.profesion_orden, r.profesion_nombre,
      r.pregunta_codigo, r.pregunta, r.respuesta, r.respondida_en, s.grado || ''
    ]);
  });
  return aCsv(filas);
}

/** Comparado: una fila por sesión y pregunta, con el antes y el después juntos. */
function csvComparado() {
  const sesiones = new Map(sesionesFiltradas().map((s) => [s.id, s]));
  const pares = new Map();

  respuestasFiltradas().forEach((r) => {
    const clave = r.sesion_id + '|' + r.pregunta_id;
    if (!pares.has(clave)) {
      pares.set(clave, {
        sesion: r.sesion_id, ronda: r.ronda, orden: r.profesion_orden,
        profesion: r.profesion_nombre, codigo: r.pregunta_codigo, pregunta: r.pregunta
      });
    }
    pares.get(clave)[r.momento] = r.respuesta;
  });

  const filas = [[
    'ronda', 'sesion_id', 'nombre', 'edad', 'genero',
    'profesion_orden', 'profesion', 'pregunta_codigo', 'pregunta',
    'respuesta_antes', 'respuesta_despues', 'cambio'
  ]];

  [...pares.values()]
    .sort((a, b) => a.sesion.localeCompare(b.sesion) || a.orden - b.orden ||
                    a.codigo.localeCompare(b.codigo))
    .forEach((p) => {
      const s = sesiones.get(p.sesion) || {};
      const cambio = p.antes && p.despues ? (p.antes === p.despues ? 'no' : 'sí') : '';
      filas.push([
        p.ronda, p.sesion, s.nombre, s.edad, s.genero,
        p.orden, p.profesion, p.codigo, p.pregunta,
        p.antes || '', p.despues || '', cambio
      ]);
    });

  return aCsv(filas);
}

/** Resumen: conteos y porcentajes, antes y después. */
function csvResumen() {
  const sesiones = sesionesFiltradas();
  const { cambios, comparables } = cambiosDeOpinion();

  const filas = [['RESUMEN DE LA ENCUESTA']];
  filas.push(['Generado', new Date().toLocaleString('es-PE')]);
  filas.push(['Ronda', $('filtro-ronda').selectedOptions[0]?.textContent || '']);
  filas.push(['Género', estado.filtros.genero || 'todos']);
  filas.push(['Participantes', sesiones.length]);
  filas.push(['Completaron las dos vueltas', sesiones.filter((s) => s.completada).length]);
  filas.push(['Respuestas que cambiaron', cambios]);
  filas.push(['Respuestas comparables', comparables]);
  filas.push([]);

  filas.push(['INDICADOR PRINCIPAL: % que respondió "Un varón" en la pregunta 1']);
  filas.push(['profesion', 'respuestas_antes', 'varon_antes', '%_antes',
              'respuestas_despues', 'varon_despues', '%_despues', 'diferencia_puntos']);
  conteoPorProfesion('p1').forEach((f) => {
    const a = f.antes.opciones.get('Un varón') || 0;
    const d = f.despues.opciones.get('Un varón') || 0;
    const pa = porcentaje(a, f.antes.total), pd = porcentaje(d, f.despues.total);
    filas.push([f.nombre, f.antes.total, a, pa + '%',
                f.despues.total, d, pd + '%', Math.round((pa - pd) * 10) / 10]);
  });
  filas.push([]);

  filas.push(['DETALLE POR PREGUNTA']);
  filas.push(['profesion', 'pregunta', 'opcion', 'antes', '%_antes', 'despues', '%_despues']);
  ['p1', 'p2', 'p3'].forEach((codigo) => {
    conteoPorProfesion(codigo).forEach((f) => {
      const opciones = [...new Set([...f.antes.opciones.keys(), ...f.despues.opciones.keys()])];
      opciones.forEach((opcion) => {
        const a = f.antes.opciones.get(opcion) || 0;
        const d = f.despues.opciones.get(opcion) || 0;
        filas.push([f.nombre, codigo, opcion,
                    a, porcentaje(a, f.antes.total) + '%',
                    d, porcentaje(d, f.despues.total) + '%']);
      });
    });
  });
  filas.push([]);

  const bloqueCruce = (titulo, etiqueta, datos) => {
    filas.push([titulo]);
    filas.push([etiqueta, 'antes_total', 'antes_varon', '%_antes',
                'despues_total', 'despues_varon', '%_despues']);
    datos.forEach(([clave, v]) => {
      filas.push([clave, v.antes.total, v.antes.varon, porcentaje(v.antes.varon, v.antes.total) + '%',
                  v.despues.total, v.despues.varon, porcentaje(v.despues.varon, v.despues.total) + '%']);
    });
    filas.push([]);
  };

  bloqueCruce('CRUCE POR EDAD: % "Un varón" en la pregunta 1', 'tramo',
              cruce((s) => tramoDeEdad(s.edad)));
  bloqueCruce('CRUCE POR GÉNERO: % "Un varón" en la pregunta 1', 'genero',
              cruce((s) => s.genero || 'Sin dato'));

  return aCsv(filas);
}

/** Descarga los tres archivos: detalle, comparado y resumen. */
export function exportarCsv() {
  const sello = marcaDeTiempo();
  descargar(`encuesta-respuestas-${sello}.csv`, csvDetalle());
  setTimeout(() => descargar(`encuesta-antes-despues-${sello}.csv`, csvComparado()), 350);
  setTimeout(() => descargar(`encuesta-resumen-${sello}.csv`, csvResumen()), 700);
}

/* --------------------------------------------- Reinicio del dashboard --- */

async function abrirNuevaRonda() {
  const { error: errorCierre } = await db()
    .from('rondas').update({ activa: false }).eq('activa', true);
  if (errorCierre) throw errorCierre;

  const numero = estado.rondas.length + 1;
  const { error: errorAlta } = await db()
    .from('rondas').insert({ nombre: `Ronda ${numero}`, activa: true });
  if (errorAlta) throw errorAlta;
}

async function borrarTodo() {
  const { error: errorSesiones } = await db()
    .from('sesiones').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (errorSesiones) throw errorSesiones;

  const { error: errorRondas } = await db().from('rondas').delete().gt('id', 0);
  if (errorRondas) throw errorRondas;

  const { error: errorAlta } = await db()
    .from('rondas').insert({ nombre: 'Ronda 1', activa: true });
  if (errorAlta) throw errorAlta;
}

/* ------------------------------------------------------------ Arranque --- */

async function iniciar() {
  if (!configurado()) {
    mostrarAviso('Falta configurar Supabase en <code>assets/js/config.js</code>.', 'warning');
    cargando(false);
    return;
  }

  const sesion = await exigirSesion();
  if (!sesion) return;

  $('correo-admin').textContent = sesion.user.email;

  $('filtro-ronda').addEventListener('change', (e) => {
    estado.filtros.ronda = e.target.value;
    cargarDatos();
  });
  $('filtro-genero').addEventListener('change', (e) => {
    estado.filtros.genero = e.target.value;
    pintarTodo();
  });
  $('filtro-desde').addEventListener('change', (e) => {
    estado.filtros.desde = e.target.value;
    pintarTodo();
  });
  $('filtro-hasta').addEventListener('change', (e) => {
    estado.filtros.hasta = e.target.value;
    pintarTodo();
  });
  $('btn-limpiar-filtros').addEventListener('click', () => {
    estado.filtros = { ronda: 'activa', genero: '', desde: '', hasta: '' };
    $('filtro-desde').value = '';
    $('filtro-hasta').value = '';
    cargarDatos();
  });

  $('btn-actualizar').addEventListener('click', cargarDatos);
  $('btn-exportar').addEventListener('click', exportarCsv);
  $('btn-csv-modal').addEventListener('click', exportarCsv);

  $('btn-salir').addEventListener('click', async () => {
    await cerrarSesion();
    window.location.href = 'login.html?v=5';
  });

  prepararModalDeReinicio();
  await cargarDatos();
}

function prepararModalDeReinicio() {
  const modal = new window.bootstrap.Modal($('modal-reinicio'));
  const clave = $('reinicio-clave');
  const palabra = $('reinicio-palabra');
  const boton = $('btn-confirmar-reinicio');
  const textoBoton = $('texto-reinicio');
  const avisoModal = $('aviso-modal');

  function validar() {
    boton.disabled = !(clave.value.length > 0 &&
                       palabra.value.trim().toUpperCase() === 'REINICIAR');
  }
  clave.addEventListener('input', validar);
  palabra.addEventListener('input', validar);

  document.querySelectorAll('input[name="modo-reinicio"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const definitivo = $('modo-borrar').checked;
      textoBoton.textContent = definitivo ? 'Borrar definitivamente' : 'Cerrar ronda y empezar de nuevo';
      boton.className = definitivo ? 'btn btn-danger' : 'btn btn-principal';
      $('aviso-definitivo').classList.toggle('oculto', !definitivo);
    });
  });

  $('btn-abrir-reinicio').addEventListener('click', () => {
    $('conteo-a-borrar').innerHTML = `
      <li><strong>${estado.sesiones.length}</strong> sesiones en la selección actual</li>
      <li><strong>${deMomento(estado.respuestas, 'antes').length}</strong> respuestas del antes
          y <strong>${deMomento(estado.respuestas, 'despues').length}</strong> del después</li>
      <li><strong>${estado.rondas.length}</strong> rondas en total</li>`;
    clave.value = '';
    palabra.value = '';
    avisoModal.classList.add('oculto');
    $('modo-nueva-ronda').checked = true;
    $('aviso-definitivo').classList.add('oculto');
    textoBoton.textContent = 'Cerrar ronda y empezar de nuevo';
    boton.className = 'btn btn-principal';
    validar();
    modal.show();
  });

  boton.addEventListener('click', async () => {
    const definitivo = $('modo-borrar').checked;
    boton.disabled = true;
    avisoModal.classList.add('oculto');
    $('spinner-reinicio').classList.remove('oculto');

    try {
      const correcta = await reautenticar(clave.value);
      if (!correcta) {
        avisoModal.innerHTML = '<div class="alert alert-danger mb-0">Contraseña incorrecta.</div>';
        avisoModal.classList.remove('oculto');
        return;
      }

      if (definitivo) await borrarTodo();
      else await abrirNuevaRonda();

      modal.hide();
      estado.filtros.ronda = 'activa';
      await cargarDatos();
      mostrarAviso(
        definitivo
          ? 'Se borraron todos los datos y se creó una ronda nueva.'
          : 'Se cerró la ronda anterior y se abrió una nueva. El histórico sigue disponible en el filtro de rondas.',
        'success'
      );
    } catch (error) {
      avisoModal.innerHTML =
        `<div class="alert alert-danger mb-0">${escaparHtml(error.message || error)}</div>`;
      avisoModal.classList.remove('oculto');
    } finally {
      $('spinner-reinicio').classList.add('oculto');
      boton.disabled = false;
    }
  });
}

iniciar();
