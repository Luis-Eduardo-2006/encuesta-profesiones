# Prompt para Claude Code — App de encuesta "¿Quién hace este trabajo?"

> Copia todo lo que está debajo de la línea y pégalo en Claude Code.
> Sube antes las 5 imágenes a `/assets/img/` con los nombres indicados.

---

Quiero que construyas una aplicación web de encuesta dirigida a niños de primaria, para un proyecto de ciencias sobre **estereotipos de género en las profesiones**. Incluye un dashboard de resultados para el administrador.

## Concepto

La encuesta muestra 5 fotos de personas trabajando, donde **no se ve el rostro ni el género** de quien realiza el trabajo. Por cada foto se hacen 3 preguntas. La idea es medir cuántos niños asumen automáticamente que es un varón.

Al terminar las 15 preguntas, la app muestra una **sección de revelación**: cada profesión con las mujeres reales que la ejercen. Esta revelación va **solo al final**, nunca entre bloques, porque revelar antes contaminaría las respuestas siguientes.

## Stack obligatorio

- HTML5 + CSS3 + **Bootstrap 5** (vía CDN) + JavaScript vanilla (ES modules).
- **Supabase** como backend (base de datos + autenticación), con `@supabase/supabase-js` vía CDN.
- **Sin build step**, sin npm, sin frameworks JS. Despliegue como sitio estático (Netlify / Vercel / GitHub Pages).
- Chart.js vía CDN para los gráficos del dashboard.

## Estructura de archivos

```
/index.html            → portada + botón "Empezar"
/encuesta.html         → flujo de preguntas
/revelacion.html       → las respuestas reales (galería educativa)
/login.html            → acceso del administrador
/dashboard.html        → resultados (protegido)
/assets/css/estilos.css
/assets/img/           → las 5 fotos + fotos de la revelación
/assets/js/config.js   → URL y anon key de Supabase
/assets/js/encuesta.js
/assets/js/dashboard.js
/assets/js/auth.js
/sql/schema.sql        → tablas + datos + políticas RLS
/README.md
```

## Acceso

- Link público, sin registro. El niño entra y responde.
- Al iniciar se crea una `sesion` anónima (UUID) guardada en `localStorage` para poder retomar si recarga.
- Antes de empezar se piden datos **opcionales**: apodo y edad. También **grado/sección**, útil para el análisis del proyecto.

---

## CONTENIDO DE LA ENCUESTA

Son **5 bloques**. Cada bloque muestra una imagen y las **mismas 3 preguntas**:

**P1. ¿Quién crees que está realizando este trabajo?**
- Un varón
- Una mujer
- No estoy seguro/a

**P2. ¿Consideras que esta profesión puede ser realizada tanto por varones como por mujeres?**
- Sí
- No
- No estoy seguro/a

**P3. ¿Quién crees que puede realizar mejor este trabajo?**
- Un varón
- Una mujer
- Ambos
- No estoy seguro/a

Todas son de opción única (`opcion_unica`) y obligatorias.

### Los 5 bloques

| # | Profesión | Imagen | Etiqueta interna |
|---|---|---|---|
| 1 | Astronauta | `01-astronauta.jpg` | astronauta |
| 2 | Operador/a de excavadora | `02-excavadora.jpg` | excavadora |
| 3 | Ingeniero/a nuclear | `03-planta-nuclear.jpg` | nuclear |
| 4 | Conductor/a de camión y semitráiler | `04-camion.jpg` | camion |
| 5 | Bombero/a | `05-bombero.jpg` | bombero |

No pongas el nombre de la profesión como título grande antes de responder — solo la foto, para no dar pistas. Si necesitas un encabezado, usa "Trabajo 1 de 5".

---

## SECCIÓN DE REVELACIÓN (después de enviar todo)

Una página con 5 tarjetas, una por profesión, cada una con foto(s) y este texto:

**1. Astronautas — Christina Koch y Jessica Meir**
Protagonizaron el primer paseo espacial realizado solo por mujeres. Las astronautas estadounidenses de la NASA reemplazaron una unidad de carga y descarga de batería defectuosa de la Estación Espacial Internacional (ISS) durante una caminata espacial de 7 horas y 17 minutos, en octubre de 2019.

**2. Operadora de excavadoras hidráulicas — Juana Torres López**
A sus 30 años, Juana Torres López (cusqueña), sin saber conducir un auto, montó por primera vez una excavadora. En 2019 celebró ser la única mujer finalista en el Concurso Ferreycorp "El Mejor Operador del Perú", que contó con más de 2,100 participantes. Ha trabajado en varias empresas transnacionales de prestigio en minería y construcción.

**3. Físicas e ingenieras nucleares**
- Marie Curie (1867-1934), física y química polaca, primera mujer en ganar un Premio Nobel y en dos campos distintos (Física y Química) por sus investigaciones sobre la radiactividad.
- Lise Meitner (1878-1968), física austriaca que descubrió la fisión nuclear, el proceso que divide los átomos y libera energía.
- Shirly Rodríguez Rojas (43 años), ingeniera nuclear peruana, asesora del Departamento de Energía de Estados Unidos.
- Yaela Beraun Bellido (33 años), primera mujer ingeniera en el Perú que opera el reactor nuclear RP-10, en el Centro Nuclear Racso (Lima).

**4. Conductoras de camiones y semitráileres**
En el Perú, cada vez más mujeres rompen estereotipos al convertirse en conductoras de vehículos de carga pesada, semitráileres y tráileres, como María Cruz, Lidia Quispe, Xiomara Paredes y Gladys Cóndor. Aproximadamente el 2% de las personas autorizadas para conducir vehículos pesados y de transporte de carga son mujeres, según registros del Ministerio de Transportes y Comunicaciones (MTC).

**5. Bomberas del Perú**
Más de 7 mil mujeres integran el Cuerpo General de Bomberos Voluntarios del Perú (CGBVP), participando activamente en el salvamento de vidas a nivel nacional y comandando varias Compañías de Bomberos. De los 17,367 efectivos en servicio activo, 7,141 son mujeres (41%).

Cierra la página con un mensaje amable del tipo: "Cualquier profesión puede ser realizada por una mujer o por un varón. Lo que importa es la preparación y las ganas de aprender."

Al final, muestra al niño **sus propias respuestas** comparadas con la realidad (por ejemplo: "En 4 de 5 trabajos pensaste que era un varón").

---

## Modelo de datos (Supabase / PostgreSQL)

Genera `sql/schema.sql` con:

- `rondas` — `id`, `nombre`, `activa` (boolean), `creada_en`. Solo una ronda activa.
- `sesiones` — `id` (uuid), `ronda_id`, `apodo`, `edad`, `grado`, `completada` (boolean), `creada_en`.
- `profesiones` — `id`, `orden`, `etiqueta`, `nombre_real`, `imagen`.
- `preguntas` — `id`, `profesion_id`, `orden`, `codigo` (`p1`, `p2`, `p3`), `texto`.
- `opciones` — `id`, `pregunta_id`, `orden`, `texto`, `emoji`.
- `respuestas` — `id`, `sesion_id`, `pregunta_id`, `opcion_id`, `creada_en`. Único por (`sesion_id`, `pregunta_id`).

Incluye los `INSERT` de siembra con las 5 profesiones, las 15 preguntas y todas sus opciones tal como están arriba.

## Seguridad

La `anon key` de Supabase es pública y viaja en el navegador, así que **la contraseña del administrador no puede estar en el código**. Implementa:

- **Supabase Auth con email + contraseña**. `login.html` usa `signInWithPassword`.
- Políticas **RLS** en todas las tablas:
  - `sesiones` y `respuestas`: `INSERT` y `UPDATE` de la propia sesión permitidos al rol `anon`.
  - `profesiones`, `preguntas`, `opciones`, `rondas`: `SELECT` permitido al rol `anon`.
  - `SELECT`, `UPDATE` y `DELETE` de `sesiones` y `respuestas`: **solo** rol `authenticated`.
- `dashboard.html` verifica la sesión de Supabase al cargar y redirige a `login.html` si no la hay.

## Experiencia del niño (UI)

- Interfaz alegre y simple: colores vivos, tipografía grande (mínimo 18px), botones grandes tipo tarjeta, mucho aire.
- **Una pregunta por pantalla**, con barra de progreso ("Pregunta 4 de 15").
- La imagen de la profesión se mantiene visible arriba durante las 3 preguntas de su bloque.
- Cada opción con emoji o ícono grande además del texto.
- Botones "Anterior" y "Siguiente"; no avanzar sin responder.
- Feedback visual al seleccionar (animación suave, cambio de color), **sin indicar correcto/incorrecto** — no hay respuestas correctas, es una encuesta de opinión.
- Guardar cada respuesta en Supabase al avanzar, no todo al final.
- Responsive: debe verse bien en celular y tablet.
- Español sencillo y amable, adecuado para primaria.
- Optimiza la carga de imágenes (`loading="lazy"`, precarga de la siguiente).

## Dashboard del administrador

Tarjetas de resumen: total de participantes, encuestas completadas, tasa de finalización, última respuesta.

**Indicador principal del proyecto** — un gráfico de barras comparando las 5 profesiones: porcentaje que respondió "Un varón" en la pregunta 1 de cada una. Esa es la medida del estereotipo y debe ser lo primero que se vea.

Además:
- Por cada profesión, un bloque con las 3 preguntas y su gráfico (barras o torta) con conteo y porcentaje.
- Vista cruzada: respuestas segmentadas por edad y por grado/sección.
- Tabla de respuestas individuales por sesión, con filtro por fecha, grado y ronda.
- Botón **Exportar a CSV** con todas las respuestas (una fila por respuesta, más una hoja resumen).
- Botón "Actualizar" para recargar los datos.

## Reinicio del dashboard

- Botón **"Reiniciar dashboard"**, visible solo para el administrador autenticado.
- Abre un modal de Bootstrap que:
  1. Advierte qué se va a borrar y cuántos registros son.
  2. Ofrece **descargar el CSV antes de borrar**.
  3. Pide **reingresar la contraseña** (re-autenticación con Supabase Auth).
  4. Pide escribir la palabra `REINICIAR` para confirmar.
- El reinicio es **por rondas**: cierra la ronda activa (`activa = false`) y crea una nueva. El dashboard queda en cero pero el histórico se conserva y se puede consultar con el filtro de ronda. Esto sirve para aplicar la encuesta a varias secciones o grados por separado.
- Incluye además una opción secundaria "Borrar definitivamente", con la misma doble confirmación.

## Requisitos técnicos

- Manejo de errores en toda llamada a Supabase, con mensajes claros.
- Estados de carga (spinners de Bootstrap).
- Validación de formularios.
- Código comentado en español, funciones pequeñas.
- `config.js` con las credenciales separadas y un `config.example.js` versionado.
- `README.md` con: cómo crear el proyecto en Supabase, cómo correr `schema.sql`, cómo crear el usuario administrador, cómo subir las imágenes y cómo desplegar.

## Cómo trabajar

1. Primero muéstrame el `schema.sql` completo y espera mi confirmación.
2. Luego construye el flujo de la encuesta (`index`, `encuesta`, `revelacion`).
3. Después el `login` y el `dashboard`.
4. Al final, el `README.md`.
