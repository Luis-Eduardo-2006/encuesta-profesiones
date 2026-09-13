/* ==========================================================================
   config.js  —  TUS CREDENCIALES (no lo subas a un repositorio público)
   --------------------------------------------------------------------------
   Reemplaza los dos valores de abajo con los de tu proyecto:
   Supabase → Project Settings → Data API / API Keys.
   Mientras digan "TU-PROYECTO", la app mostrará un aviso en pantalla.

   La "anon key" es pública por diseño: viaja en el navegador de cada niño.
   La seguridad real la dan las políticas RLS de sql/schema.sql, NO el secreto
   de esta clave. Nunca pongas aquí la "service_role key".
   ========================================================================== */

export const SUPABASE_URL = 'https://lvtbtccmcbtpbhitrsao.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2dGJ0Y2NtY2J0cGJoaXRyc2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5MjU0MzEsImV4cCI6MjEwNDUwMTQzMX0.zRMAk8kdTcqpU38xI8-IUc4ZmhexhJDDn3-I_aJUDcM';

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
