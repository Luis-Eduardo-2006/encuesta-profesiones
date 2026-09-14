-- ============================================================================
--  Encuesta "¿Quién hace este trabajo?"  —  Esquema completo para Supabase
-- ----------------------------------------------------------------------------
--  Ejecutar TODO este archivo en el SQL Editor de Supabase (una sola vez).
--  Es idempotente: se puede volver a correr sin duplicar datos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------------

-- Rondas: cada aplicación de la encuesta (una sección, un grado, un día...).
-- Reiniciar el dashboard = cerrar la ronda activa y abrir una nueva.
create table if not exists public.rondas (
  id         bigint generated always as identity primary key,
  nombre     text        not null,
  activa     boolean     not null default false,
  creada_en  timestamptz not null default now()
);

-- Solo puede existir UNA ronda activa a la vez.
create unique index if not exists rondas_una_sola_activa
  on public.rondas (activa)
  where activa;

-- Sesiones: un niño que entra a responder. El id lo genera el navegador
-- (crypto.randomUUID) y se guarda en localStorage para poder retomar.
-- Los tres datos del participante son obligatorios: sin ellos no hay encuesta.
-- 'grado' ya no se pide en la portada, pero la columna se conserva para no
-- perder lo recogido en aplicaciones anteriores de la encuesta.
create table if not exists public.sesiones (
  id          uuid        primary key,
  ronda_id    bigint      not null references public.rondas(id) on delete cascade,
  nombre      text        not null,
  edad        smallint    not null,
  genero      text        not null,
  grado       text,
  completada  boolean     not null default false,
  creada_en   timestamptz not null default now(),
  constraint sesiones_edad_valida   check (edad between 6 and 12),
  constraint sesiones_nombre_valido check (char_length(btrim(nombre)) between 2 and 40),
  constraint sesiones_genero_valido check (genero in ('Niño', 'Niña', 'Prefiero no decirlo'))
);

-- Puesta al día de bases creadas con la versión anterior del formulario,
-- que pedía apodo y grado. Rellena lo que falte antes de exigirlo, para no
-- perder respuestas ya recogidas.
do $migra$
begin
  -- 'apodo' pasó a llamarse 'nombre'.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'sesiones' and column_name = 'apodo')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'sesiones' and column_name = 'nombre') then
    alter table public.sesiones rename column apodo to nombre;
  end if;

  -- 'genero' es nuevo: las sesiones antiguas no lo declararon.
  if not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'sesiones' and column_name = 'genero') then
    alter table public.sesiones add column genero text;
  end if;

  -- Sesiones anteriores a la pregunta de género: no se puede adivinar, así que
  -- se marcan como 'Sin indicar' y se conservan. La restricción de más abajo
  -- solo exige 'Niño' o 'Niña' a los datos nuevos.
  update public.sesiones set genero = 'Sin indicar' where genero is null;
  update public.sesiones set nombre = 'Sin nombre'
    where nombre is null or char_length(btrim(nombre)) < 2;
  update public.sesiones set edad = 3 where edad is null;

  alter table public.sesiones alter column nombre set not null;
  alter table public.sesiones alter column edad   set not null;
  alter table public.sesiones alter column genero set not null;
  alter table public.sesiones alter column grado  drop not null;

  alter table public.sesiones drop constraint if exists sesiones_apodo_corto;
  alter table public.sesiones drop constraint if exists sesiones_apodo_valido;
  alter table public.sesiones drop constraint if exists sesiones_grado_corto;
  alter table public.sesiones drop constraint if exists sesiones_grado_valido;
  alter table public.sesiones drop constraint if exists sesiones_edad_valida;
  alter table public.sesiones drop constraint if exists sesiones_nombre_valido;
  alter table public.sesiones drop constraint if exists sesiones_genero_valido;

  -- El formulario ahora ofrece un desplegable de 6 a 12, el rango real de
  -- primaria. 'not valid' deja intactas las sesiones ya recogidas.
  alter table public.sesiones add constraint sesiones_edad_valida
    check (edad between 6 and 12) not valid;
  alter table public.sesiones add constraint sesiones_nombre_valido
    check (char_length(btrim(nombre)) between 2 and 40);
  -- 'not valid' significa: se exige a todo lo que se inserte o modifique desde
  -- ahora, pero no se revisan las filas antiguas. Así las sesiones recogidas
  -- con un formulario anterior siguen existiendo sin inventarles un género.
  alter table public.sesiones add constraint sesiones_genero_valido
    check (genero in ('Niño', 'Niña', 'Prefiero no decirlo')) not valid;
end
$migra$;

-- Profesiones: los 5 bloques de la encuesta.
create table if not exists public.profesiones (
  id          bigint generated always as identity primary key,
  orden       smallint not null unique,
  etiqueta    text     not null unique,   -- identificador interno (astronauta, camion...)
  nombre_real text     not null,          -- se muestra SOLO en la revelación final
  imagen      text     not null           -- archivo dentro de /assets/img/
);

-- Preguntas: las mismas 3 por cada profesión (15 en total).
create table if not exists public.preguntas (
  id           bigint generated always as identity primary key,
  profesion_id bigint   not null references public.profesiones(id) on delete cascade,
  orden        smallint not null,
  codigo       text     not null check (codigo in ('p1', 'p2', 'p3')),
  texto        text     not null,
  unique (profesion_id, codigo)
);

-- Opciones de respuesta (siempre de opción única).
create table if not exists public.opciones (
  id          bigint generated always as identity primary key,
  pregunta_id bigint   not null references public.preguntas(id) on delete cascade,
  orden       smallint not null,
  texto       text     not null,
  emoji       text,
  unique (pregunta_id, orden)
);

-- Respuestas: una fila por pregunta contestada en cada momento.
--
-- La encuesta se responde DOS veces: 'antes' de ver las historias de las
-- mujeres y 'despues' de verlas. Comparar ambas es el corazón del proyecto.
-- Es única por sesión + pregunta + momento, así el niño puede volver atrás y
-- cambiar su respuesta sin duplicar filas.
create table if not exists public.respuestas (
  id          bigint generated always as identity primary key,
  sesion_id   uuid        not null references public.sesiones(id)  on delete cascade,
  pregunta_id bigint      not null references public.preguntas(id) on delete cascade,
  opcion_id   bigint      not null references public.opciones(id)  on delete cascade,
  momento     text        not null default 'antes'
              check (momento in ('antes', 'despues')),
  creada_en   timestamptz not null default now(),
  unique (sesion_id, pregunta_id, momento)
);

-- Puesta al día de bases creadas cuando la encuesta se respondía una sola vez.
do $momentos$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'respuestas'
                   and column_name = 'momento') then
    alter table public.respuestas add column momento text not null default 'antes';
    alter table public.respuestas add constraint respuestas_momento_valido
      check (momento in ('antes', 'despues'));
  end if;

  -- La clave única pasa de dos columnas a tres.
  if exists (select 1 from pg_constraint
             where conrelid = 'public.respuestas'::regclass
               and conname = 'respuestas_sesion_id_pregunta_id_key') then
    alter table public.respuestas drop constraint respuestas_sesion_id_pregunta_id_key;
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.respuestas'::regclass
                   and conname = 'respuestas_sesion_id_pregunta_id_momento_key') then
    alter table public.respuestas
      add constraint respuestas_sesion_id_pregunta_id_momento_key
      unique (sesion_id, pregunta_id, momento);
  end if;
end
$momentos$;

-- Índices que usa el dashboard.
create index if not exists respuestas_sesion_idx   on public.respuestas (sesion_id);
create index if not exists respuestas_pregunta_idx on public.respuestas (pregunta_id);
create index if not exists sesiones_ronda_idx      on public.sesiones   (ronda_id);


-- ---------------------------------------------------------------------------
-- 2. FUNCIONES AUXILIARES
-- ---------------------------------------------------------------------------

-- Permite que las políticas RLS del rol anónimo comprueben que una sesión
-- pertenece a la ronda activa, SIN darle permiso de lectura sobre 'sesiones'.
create or replace function public.sesion_en_ronda_activa(p_sesion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.sesiones s
    join public.rondas  r on r.id = s.ronda_id
    where s.id = p_sesion_id
      and r.activa
  );
$fn$;

revoke all on function public.sesion_en_ronda_activa(uuid) from public;
grant execute on function public.sesion_en_ronda_activa(uuid) to anon, authenticated;

-- Devuelve el id de la ronda activa (lo usa el navegador al crear la sesión).
create or replace function public.ronda_activa()
returns bigint
language sql
stable
as $fn$
  select id from public.rondas where activa limit 1;
$fn$;

grant execute on function public.ronda_activa() to anon, authenticated;

-- Guarda o corrige una respuesta.
--
-- ¿Por qué una función y no un UPDATE directo? Porque con RLS activo Postgres
-- aplica las políticas de SELECT a las filas que un UPDATE menciona en su WHERE.
-- Como el niño no tiene permiso de lectura (a propósito), un UPDATE suyo
-- afectaría a cero filas y fallaría en silencio. La función corre como su dueño,
-- valida en el servidor y hace el upsert sin abrir la lectura a nadie.
-- La versión anterior no recibía el momento; se retira para no dejar dos.
drop function if exists public.guardar_respuesta(uuid, bigint, bigint);

create or replace function public.guardar_respuesta(
  p_sesion   uuid,
  p_pregunta bigint,
  p_opcion   bigint,
  p_momento  text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- La sesión tiene que existir y pertenecer a la ronda que está abierta.
  if not public.sesion_en_ronda_activa(p_sesion) then
    raise exception 'La encuesta ya se cerró para esta sesión.' using errcode = '42501';
  end if;

  if p_momento not in ('antes', 'despues') then
    raise exception 'El momento debe ser antes o despues.' using errcode = '22023';
  end if;

  -- La opción tiene que ser una de las de esa pregunta: así nadie puede
  -- inventar respuestas cruzando identificadores.
  if not exists (
    select 1 from public.opciones
    where id = p_opcion and pregunta_id = p_pregunta
  ) then
    raise exception 'La opción no corresponde a esa pregunta.' using errcode = '22023';
  end if;

  insert into public.respuestas (sesion_id, pregunta_id, opcion_id, momento)
  values (p_sesion, p_pregunta, p_opcion, p_momento)
  on conflict (sesion_id, pregunta_id, momento) do update
    set opcion_id = excluded.opcion_id,
        creada_en = now();
end;
$fn$;

revoke all on function public.guardar_respuesta(uuid, bigint, bigint, text) from public;
grant execute on function public.guardar_respuesta(uuid, bigint, bigint, text) to anon, authenticated;

-- Marca la sesión como completada, por el mismo motivo que la función anterior.
create or replace function public.completar_sesion(p_sesion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.sesion_en_ronda_activa(p_sesion) then
    raise exception 'La encuesta ya se cerró para esta sesión.' using errcode = '42501';
  end if;

  update public.sesiones set completada = true where id = p_sesion;
end;
$fn$;

revoke all on function public.completar_sesion(uuid) from public;
grant execute on function public.completar_sesion(uuid) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. VISTA PARA EL DASHBOARD Y LA EXPORTACIÓN A CSV
--    security_invoker = on  ->  respeta las políticas RLS de quien consulta.
-- ---------------------------------------------------------------------------
-- Se borra antes de crearla porque cambiaron los nombres de sus columnas
-- (apodo pasó a nombre y se sumó genero).
drop view if exists public.v_respuestas;

create view public.v_respuestas
with (security_invoker = on) as
select
  r.id            as respuesta_id,
  r.momento,
  r.creada_en     as respondida_en,
  s.id            as sesion_id,
  s.nombre,
  s.edad,
  s.genero,
  s.grado,
  s.completada,
  s.creada_en     as sesion_creada_en,
  ro.id           as ronda_id,
  ro.nombre       as ronda,
  ro.activa       as ronda_activa,
  p.id            as profesion_id,
  p.orden         as profesion_orden,
  p.etiqueta      as profesion,
  p.nombre_real   as profesion_nombre,
  q.id            as pregunta_id,
  q.codigo        as pregunta_codigo,
  q.texto         as pregunta,
  o.id            as opcion_id,
  o.orden         as opcion_orden,
  o.texto         as respuesta
from public.respuestas  r
join public.sesiones    s  on s.id  = r.sesion_id
join public.rondas      ro on ro.id = s.ronda_id
join public.preguntas   q  on q.id  = r.pregunta_id
join public.profesiones p  on p.id  = q.profesion_id
join public.opciones    o  on o.id  = r.opcion_id;

grant select on public.v_respuestas to authenticated;


-- ---------------------------------------------------------------------------
-- 4. SEGURIDAD (Row Level Security)
--    La anon key es pública: todo lo que el niño puede hacer está definido aquí.
-- ---------------------------------------------------------------------------
alter table public.rondas      enable row level security;
alter table public.sesiones    enable row level security;
alter table public.profesiones enable row level security;
alter table public.preguntas   enable row level security;
alter table public.opciones    enable row level security;
alter table public.respuestas  enable row level security;

-- Limpieza previa, para poder re-ejecutar este archivo sin errores.
drop policy if exists rondas_lectura_anon      on public.rondas;
drop policy if exists rondas_admin             on public.rondas;
drop policy if exists profesiones_lectura_anon on public.profesiones;
drop policy if exists preguntas_lectura_anon   on public.preguntas;
drop policy if exists opciones_lectura_anon    on public.opciones;
drop policy if exists sesiones_insert_anon     on public.sesiones;
drop policy if exists sesiones_update_anon     on public.sesiones;
drop policy if exists sesiones_admin           on public.sesiones;
drop policy if exists respuestas_insert_anon   on public.respuestas;
drop policy if exists respuestas_update_anon   on public.respuestas;
drop policy if exists respuestas_admin         on public.respuestas;

-- 4.1 Contenido de la encuesta: cualquiera puede leerlo.
create policy rondas_lectura_anon on public.rondas
  for select to anon, authenticated using (true);

create policy profesiones_lectura_anon on public.profesiones
  for select to anon, authenticated using (true);

create policy preguntas_lectura_anon on public.preguntas
  for select to anon, authenticated using (true);

create policy opciones_lectura_anon on public.opciones
  for select to anon, authenticated using (true);

-- 4.2 Sesiones: el niño crea la suya y la marca como completada,
--     pero NO puede leer ninguna. Solo el administrador lee, edita y borra.
create policy sesiones_insert_anon on public.sesiones
  for insert to anon
  with check (
    ronda_id = (select id from public.rondas where activa limit 1)
    and completada = false
  );

create policy sesiones_update_anon on public.sesiones
  for update to anon
  using      (public.sesion_en_ronda_activa(id))
  with check (public.sesion_en_ronda_activa(id));

create policy sesiones_admin on public.sesiones
  for all to authenticated using (true) with check (true);

-- 4.3 Respuestas: el niño graba y corrige las de su propia sesión, siempre que
--     esa sesión pertenezca a la ronda activa. Tampoco puede leerlas.
create policy respuestas_insert_anon on public.respuestas
  for insert to anon
  with check (public.sesion_en_ronda_activa(sesion_id));

create policy respuestas_update_anon on public.respuestas
  for update to anon
  using      (public.sesion_en_ronda_activa(sesion_id))
  with check (public.sesion_en_ronda_activa(sesion_id));

create policy respuestas_admin on public.respuestas
  for all to authenticated using (true) with check (true);

-- 4.4 Rondas: solo el administrador autenticado abre y cierra rondas.
create policy rondas_admin on public.rondas
  for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------------
-- 5. DATOS DE SIEMBRA
-- ---------------------------------------------------------------------------

-- 5.1 Primera ronda.
insert into public.rondas (nombre, activa)
select 'Ronda 1', true
where not exists (select 1 from public.rondas);

-- 5.2 Las 5 profesiones (el nombre real solo se usa en la revelación final).
insert into public.profesiones (orden, etiqueta, nombre_real, imagen) values
  (1, 'astronauta', 'Astronauta',                          '01-astronauta.jpg'),
  (2, 'excavadora', 'Operador/a de excavadora',            '02-excavadora.jpg'),
  (3, 'nuclear',    'Ingeniero/a nuclear',                 '03-planta-nuclear.jpg'),
  (4, 'camion',     'Conductor/a de camión y semitráiler', '04-camion.jpg'),
  (5, 'bombero',    'Bombero/a',                           '05-bombero.jpg')
on conflict (etiqueta) do update
  set orden       = excluded.orden,
      nombre_real = excluded.nombre_real,
      imagen      = excluded.imagen;

-- 5.3 Las 10 preguntas con sus opciones: las mismas 2 por cada profesión.
--
-- Antes eran tres por profesión. Se consolidaron en dos para no cansar a niños
-- de 6 a 12 años: la que mide qué supone el niño, y una sola pregunta directa
-- sobre quién lo haría mejor.
do $seed$
declare
  prof  record;
  id_p1 bigint;
  id_p2 bigint;
begin
  -- La antigua tercera pregunta desaparece, y la segunda cambia de texto y de
  -- opciones. Se borran primero para que ninguna respuesta vieja quede colgada
  -- de una opción que ahora dice otra cosa.
  delete from public.preguntas where codigo = 'p3';
  delete from public.opciones
   where pregunta_id in (select id from public.preguntas where codigo = 'p2');

  for prof in select id from public.profesiones order by orden loop

    -- P1 ------------------------------------------------------------------
    insert into public.preguntas (profesion_id, orden, codigo, texto)
    values (prof.id, 1, 'p1', '¿Quién crees que está realizando este trabajo?')
    on conflict (profesion_id, codigo) do update set texto = excluded.texto
    returning id into id_p1;

    insert into public.opciones (pregunta_id, orden, texto, emoji) values
      (id_p1, 1, 'Un varón',          '👦'),
      (id_p1, 2, 'Una mujer',         '👩'),
      (id_p1, 3, 'No estoy seguro/a', '🤔')
    on conflict (pregunta_id, orden) do update
      set texto = excluded.texto, emoji = excluded.emoji;

    -- P2: la pregunta consolidada ---------------------------------------
    insert into public.preguntas (profesion_id, orden, codigo, texto)
    values (prof.id, 2, 'p2', '¿Crees que una mujer y un hombre pueden hacer este trabajo igual de bien?')
    on conflict (profesion_id, codigo) do update set texto = excluded.texto
    returning id into id_p2;

    insert into public.opciones (pregunta_id, orden, texto, emoji) values
      (id_p2, 1, 'El hombre lo haría mejor',        '👨'),
      (id_p2, 2, 'La mujer lo haría mejor',         '👩'),
      (id_p2, 3, 'Los dos lo harían igual de bien', '🧑‍🤝‍🧑'),
      (id_p2, 4, 'No estoy seguro/a',               '🤔')
    on conflict (pregunta_id, orden) do update
      set texto = excluded.texto, emoji = excluded.emoji;

  end loop;
end
$seed$;

-- ---------------------------------------------------------------------------
-- Listo. Falta crear el usuario administrador en Supabase:
-- Authentication -> Users -> Add user (email + contraseña, "Auto Confirm User").
-- ---------------------------------------------------------------------------
