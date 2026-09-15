# ¿Quién hace este trabajo?

Encuesta web para niños de primaria sobre **estereotipos de género en las profesiones**,
con dashboard de resultados para el docente.

El niño ve 5 fotos de personas trabajando en las que no se distingue quién las realiza.
Por cada foto responde 3 preguntas, 15 en total. **Solo entonces** conoce a las mujeres
que ejercen de verdad esas profesiones, en un carrusel de 16 diapositivas. Y después
vuelve a responder las mismas 15 preguntas.

Esa es la medida del proyecto: cuánto cambia lo que un niño da por supuesto cuando le
pones delante a personas reales. El dashboard compara las dos vueltas, pregunta por
pregunta y niño por niño.

El recorrido completo es:

1. `index.html` — nombre, edad y género.
2. `encuesta.html` — las 15 preguntas (vuelta **antes**).
3. `historias.html` — "Ahora conozcamos el caso de estas mujeres…", el carrusel, y
   "¿Sigues pensando igual?".
4. `encuesta.html` otra vez — las mismas 15 preguntas (vuelta **después**).
5. `revelacion.html` — gracias, y su propio antes y después, pregunta por pregunta.

Las historias van en medio a propósito: enseñarlas antes contaminaría la primera vuelta.

## Qué lleva dentro

HTML5, CSS3, Bootstrap 5, JavaScript vanilla en módulos ES y Chart.js, todo por CDN.
Supabase como base de datos y autenticación. No hay build step, ni npm, ni frameworks:
se publica como sitio estático tal cual está.

```
index.html            portada: nombre, edad y género del participante
encuesta.html         las 15 preguntas, una por pantalla (sirve para las dos vueltas)
historias.html        las dos pantallas de mensaje y el carrusel de 16 diapositivas
revelacion.html       gracias + el antes y después del propio niño
login.html            acceso del administrador
dashboard.html        resultados (protegido)
assets/css/estilos.css
assets/img/           las 5 fotos de la encuesta
assets/img_ppts/      las 16 fotos del carrusel, en 5 carpetas
assets/js/config.js         URL y anon key de Supabase (lo creas tú)
assets/js/config.example.js plantilla versionada
assets/js/encuesta.js       flujo del niño
assets/js/auth.js           sesión del administrador
assets/js/dashboard.js      métricas, gráficos, CSV y reinicio
sql/schema.sql        tablas, datos de siembra y políticas RLS
servidor.py           servidor local sin caché, para probar
subir.py              envía tus cambios a GitHub en un comando
_headers              cabeceras de caché para Netlify
```

---

## Estado actual: ya está configurado

El backend ya está creado y funcionando. Los pasos 1 a 4 de abajo quedan como
referencia, por si algún día hay que rehacerlo o montarlo en otra cuenta.

| | |
|---|---|
| Proyecto Supabase | `encuesta-profesiones` |
| Región | `us-east-1` |
| Credenciales públicas | ya pegadas en `assets/js/config.js` |
| Esquema | ejecutado: 5 profesiones, 15 preguntas, 50 opciones, `Ronda 1` activa |
| Administrador | el correo y la contraseña se guardan fuera del repositorio |

**El correo y la contraseña del docente no se escriben aquí a propósito.** Este
repositorio es público, y con esos dos datos cualquiera podría entrar al dashboard
y leer los nombres, edades y respuestas de los niños. Guárdalos donde guardas tus
otras contraseñas.

Tampoco están aquí la contraseña de la base de datos ni el token personal de
Supabase. `.mcp.json`, que contiene ese token, está en `.gitignore`.

La *anon key* de `config.js` sí es pública por diseño: viaja al navegador de cada
niño de todos modos, y lo que protege los datos son las políticas RLS, no el
secreto de esa clave.

Lo único que falta para publicar es subir la carpeta a Netlify, Vercel o GitHub
Pages (paso 7).

---

## 1. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta gratuita.
2. **New project**. Ponle un nombre, elige una contraseña para la base de datos
   (guárdala, no es la del administrador) y la región más cercana.
3. Espera un par de minutos a que termine de aprovisionarse.

## 2. Ejecutar el esquema

1. En el menú lateral abre **SQL Editor** → **New query**.
2. Copia el contenido completo de [`sql/schema.sql`](sql/schema.sql) y pégalo.
3. Pulsa **Run**.

Eso crea las seis tablas, la vista del dashboard, las políticas de seguridad y siembra
las 5 profesiones con sus 15 preguntas y todas sus opciones. El archivo se puede volver
a ejecutar sin duplicar nada.

Para comprobar que quedó bien, en **Table Editor** deberías ver 5 filas en `profesiones`,
15 en `preguntas` y 1 en `rondas`.

## 3. Crear el usuario administrador

La contraseña **no vive en el código**: la verifica Supabase.

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Escribe el correo y la contraseña del docente.
3. Marca **Auto Confirm User** para no tener que confirmar el correo.

Ese es el único usuario que podrá ver el dashboard. Si quieres más de un docente,
crea un usuario por persona.

## 4. Configurar las credenciales

1. Copia `assets/js/config.example.js` como `assets/js/config.js`.
2. En Supabase, **Project Settings** → **API** (o **Data API**), copia:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`
3. Pégalas en `config.js`.

> La anon key es pública por diseño: viaja en el navegador de cada niño. Quien la tenga
> solo puede hacer lo que permitan las políticas RLS del paso 2, es decir, leer las
> preguntas y grabar sus propias respuestas. **Nunca** pongas ahí la `service_role key`.

## 5. Subir las imágenes

Las 5 fotos de la encuesta ya deben estar en `assets/img/` con estos nombres exactos,
que son los que guarda la tabla `profesiones`:

| Archivo | Profesión |
|---|---|
| `01-astronauta.jpg` | Astronauta |
| `02-excavadora.jpg` | Operador/a de excavadora |
| `03-planta-nuclear.jpg` | Ingeniero/a nuclear |
| `04-camion.jpg` | Conductor/a de camión y semitráiler |
| `05-bombero.jpg` | Bombero/a |

Elige fotos donde **no se vea el rostro ni el género** de quien trabaja: de espaldas,
con casco y equipo, de lejos o en plano de detalle.

Usa imágenes de menos de 500 KB para que carguen rápido en el celular del colegio.

### Las fotos del carrusel

Las 16 diapositivas viven en `assets/img_ppts/`, repartidas en cinco carpetas:

| Carpeta | Diapositivas |
|---|---|
| `astronautas/` | Christina Koch y Jessica Meir, el paseo espacial, dentro de la estación |
| `excavadora/` | Juana Torres, a los mandos, "he aprendido a superar" |
| `nucleares/` | Marie Curie, Lise Meitner, Shirly Rodríguez, Yaela Beraun |
| `conductoras/` | María Cruz, Lidia Quispe, Xiomara Paredes, Gladys Cóndor |
| `bomberas/` | la compañía Magdalena 36, apagando un incendio |

El texto que acompaña a cada foto está en `historias.html`, en la lista `HISTORIAS`.
Cada entrada tiene el grupo, el emoji, el archivo, un pie en negrita, el párrafo y el
texto alternativo para lectores de pantalla. Para cambiar una frase, edita ahí.

Para **añadir o quitar** una diapositiva basta con agregar o borrar un objeto de esa
lista; el contador "Historia N de M" y los puntitos se ajustan solos.

Los nombres de archivo no deben llevar espacios ni acentos: Netlify y GitHub Pages
distinguen mayúsculas y los espacios obligan a escapar la URL.

## 6. Probar en tu computadora

Los módulos ES no funcionan abriendo el archivo con doble clic (`file://`).
Levanta el servidor incluido desde la carpeta del proyecto:

```bash
python servidor.py
```

Y abre `http://localhost:8000`. Para detenerlo, Ctrl+C.

Usa `servidor.py` y no `python -m http.server`. El servidor de serie no manda
cabeceras de caché, así que el navegador se queda con la versión vieja de las
páginas. Si el HTML guardado es anterior a un cambio y el JavaScript ya es el
nuevo, el formulario deja de funcionar aunque el código esté bien: se rellenan
los tres datos, se pulsa Empezar y no pasa nada. `servidor.py` manda `no-store`
y así cada recarga trae siempre lo último.

## Seguir editando y subir los cambios

El proyecto vive en [GitHub](https://github.com/Luis-Eduardo-2006/encuesta-profesiones).
Editas aquí, en tu carpeta, y cuando quieras lo envías. Hay dos formas.

### Con Visual Studio Code, sin escribir nada

1. Abre el panel **Control de código fuente** (el icono de las ramitas, o Ctrl+Shift+G).
2. Escribe arriba qué cambiaste, por ejemplo "cambié el texto de las bomberas".
3. Pulsa **Confirmar** y luego **Sincronizar cambios**.

### Con un comando

```bash
python subir.py
```

Te muestra qué archivos cambiaron, te pregunta qué hiciste, y lo envía. También
acepta el mensaje directamente:

```bash
python subir.py "Cambié el texto de las bomberas"
```

Antes de enviar nada comprueba que no se escape ningún archivo con credenciales.
Si `.mcp.json` apareciera entre los cambios, se detiene en vez de publicarlo.

> Los cambios que haces en tu carpeta **no llegan solos** a GitHub. Hasta que no
> confirmes y envíes, solo existen en tu computador. Eso es a propósito: te deja
> probar tranquilo y subir solo cuando esté como quieres.

Si publicaste con GitHub Pages, cada envío actualiza el sitio en uno o dos minutos.

## 7. Desplegar

Es un sitio estático: sube la carpeta tal cual.

**Netlify** — arrastra la carpeta a [app.netlify.com/drop](https://app.netlify.com/drop).
Listo, te da una URL pública.

**Vercel** — `vercel` desde la carpeta, o conecta el repositorio en la web.
Framework preset: **Other**. Sin build command, output directory: la raíz.

**GitHub Pages** — sube el repositorio, luego *Settings → Pages → Deploy from a branch*,
rama `main`, carpeta `/ (root)`.

El archivo `_headers` le dice a Netlify que el navegador debe preguntar siempre si hay
una versión nueva antes de usar la guardada. Sin eso, un niño podría quedarse con una
página vieja en caché y el formulario dejaría de funcionar tras un cambio.

> `.gitignore` excluye `assets/js/config.js` para no publicar credenciales sin querer.
> Si despliegas desde GitHub Pages necesitas ese archivo en el repositorio: borra esa
> línea del `.gitignore`. No es un problema de seguridad, porque la anon key ya viaja
> al navegador de todos modos; la protección real son las políticas RLS.

---

## Usar la encuesta

Comparte el link público de la portada. No hay registro ni contraseña: el enlace basta.

Antes de empezar, el niño debe indicar su **nombre, su edad y su género**. El género se
elige tocando una de dos tarjetas: Niño o Niña.

Los tres datos son obligatorios y el botón de empezar no avanza hasta que estén completos.
La regla se aplica en tres capas: el formulario avisa en rojo, `crearSesion()` la vuelve a
comprobar, y la tabla `sesiones` tiene las columnas `not null`, con un rango válido para la
edad y una lista cerrada de valores para el género, así que la base rechaza cualquier
intento de saltársela.

La restricción de género está declarada `not valid`: se exige a todo lo que se grabe desde
ahora, pero no revisa las filas antiguas. Así una sesión recogida con un formulario
anterior se conserva tal cual, sin inventarle un género que nadie declaró.

Cada respuesta se guarda en el momento de avanzar, no al final, así que si se cierra
la pestaña no se pierde nada: al volver puede continuar donde se quedó.

## El dashboard

Entra por `login.html` con el correo y la contraseña que creaste en el paso 3.

> Usa una contraseña larga. La página de acceso es pública, así que una contraseña
> fácil de adivinar deja los datos de los niños al alcance de cualquiera. Se cambia
> en Supabase, en **Authentication → Users**.

- **Indicador principal**: dos barras por profesión, antes y después, con el porcentaje
  que respondió "Un varón" en la pregunta 1. La diferencia entre ellas es el resultado
  del proyecto.
- **Respuestas que cambiaron**: cuántas respuestas son distintas entre las dos vueltas,
  sobre el total de las que se pueden comparar.
- Bloques por profesión con las 3 preguntas. Cada gráfico lleva las dos vueltas lado a
  lado, y debajo una tabla con el conteo y el porcentaje de cada opción, antes y después.
- Cruces por tramo de edad y por género de quien responde. El segundo es el que muestra
  si los niños asumen "un varón" con más frecuencia que las niñas.
- Tabla con una fila por sesión, filtrable por ronda, género y rango de fechas. Cada
  profesión se muestra como *antes → después*, y las celdas que cambiaron quedan
  resaltadas. El botón **15 ▾** de cada fila despliega las quince preguntas de esa
  persona, con su antes, su después y si cambió.
- **Exportar CSV**: descarga tres archivos, que se abren directamente en Excel.
  - `encuesta-respuestas-…` — una fila por respuesta, con su columna `momento`.
  - `encuesta-antes-despues-…` — una fila por niño y pregunta, con el antes y el
    después en la misma fila y una columna que dice si cambió. Es el más cómodo para
    analizar el proyecto.
  - `encuesta-resumen-…` — conteos y porcentajes de las dos vueltas, más los cruces.

## Rondas: aplicar la encuesta a varios grupos

El botón **Reiniciar dashboard** no borra nada por defecto. Cierra la ronda activa y
abre una nueva, así que el tablero vuelve a cero para el siguiente grupo mientras el
histórico sigue disponible en el filtro de ronda. Sirve para comparar un aula con otra,
o la misma aula antes y después de una clase sobre el tema.

Antes de hacerlo, el modal te dice cuántos registros hay, te ofrece descargar el CSV,
te pide reingresar tu contraseña y escribir la palabra `REINICIAR`.

La opción **Borrar definitivamente** elimina todas las sesiones, respuestas y rondas.
Pide las mismas dos confirmaciones y no se puede deshacer.

## Seguridad

- La contraseña del administrador la verifica Supabase Auth, nunca está en el código.
- Row Level Security activo en las seis tablas:
  - el rol anónimo **lee** rondas, profesiones, preguntas y opciones;
  - **inserta y corrige** su propia sesión y sus propias respuestas, y solo mientras
    esa sesión pertenezca a la ronda activa;
  - **no puede leer** ninguna sesión ni ninguna respuesta, ni las suyas.
- Leer, modificar y borrar sesiones y respuestas exige el rol `authenticated`.
- `dashboard.html` comprueba la sesión al cargar y redirige a `login.html` si no la hay.

Como el niño no puede leer sus propias respuestas del servidor, la app guarda una copia
en `localStorage` para poder mostrarle su resumen al final.

### Por qué guardar pasa por dos funciones del servidor

Con RLS activo, Postgres aplica las políticas de `SELECT` a las filas que un `UPDATE`
menciona en su `WHERE`. Como el niño no tiene permiso de lectura, cualquier corrección
suya afectaría a cero filas y fallaría en silencio, sin dar error.

Por eso grabar y completar pasan por `guardar_respuesta()` y `completar_sesion()`, dos
funciones `security definer` que corren como su dueño. Cada una verifica que la sesión
pertenezca a la ronda abierta, y `guardar_respuesta()` además comprueba que la opción
elegida sea realmente una de esa pregunta, así nadie puede inventar respuestas cruzando
identificadores. La lectura sigue cerrada para el rol anónimo.

## Problemas frecuentes

**"Falta configurar Supabase"** — no creaste `assets/js/config.js` o dejaste los valores
de ejemplo.

**"La encuesta está cerrada en este momento"** — no hay ninguna ronda con `activa = true`.
Entra al dashboard y reinicia, o marca una ronda como activa desde el Table Editor.

**El dashboard carga vacío pero hay respuestas** — revisa que estés viendo la ronda
correcta en el filtro. Con "Todas las rondas" se ve el histórico completo.

**Error de RLS al guardar una respuesta** — la sesión del niño pertenece a una ronda que
ya se cerró. Debe empezar de nuevo desde la portada.

**Las fotos no aparecen** — los nombres de archivo distinguen mayúsculas en Netlify y
GitHub Pages. Deben coincidir exactamente con la columna `imagen` de `profesiones`.
