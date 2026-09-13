/* ==========================================================================
   config.example.js  —  PLANTILLA (este archivo SÍ se versiona en git)
   --------------------------------------------------------------------------
   Cópialo como  assets/js/config.js  y pega ahí los datos de tu proyecto:
   Supabase → Project Settings → Data API / API Keys.

   La "anon key" es pública por diseño: viaja en el navegador de cada niño.
   La seguridad real la dan las políticas RLS de sql/schema.sql, NO el secreto
   de esta clave. Nunca pongas aquí la "service_role key".
   ========================================================================== */

export const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
export const SUPABASE_ANON_KEY = 'TU_ANON_KEY_PUBLICA';

/** ¿Están reemplazados los valores de ejemplo? */
export function configurado() {
  return (
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('TU-PROYECTO') &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes('TU_ANON_KEY')
  );
}

/**
 * Crea el cliente de Supabase.
 * Requiere que la página haya cargado antes el script UMD de supabase-js.
 */
export function crearCliente() {
  if (!window.supabase || !window.supabase.createClient) {
    throw new Error('No se cargó la librería de Supabase. Revisa tu conexión a internet.');
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}
