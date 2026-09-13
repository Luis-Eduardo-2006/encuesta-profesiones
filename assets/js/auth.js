/* ==========================================================================
   auth.js  —  Acceso del administrador (Supabase Auth, email + contraseña)
   --------------------------------------------------------------------------
   La contraseña NUNCA está en el código: la verifica Supabase. El dashboard
   solo puede leer datos porque las políticas RLS exigen el rol 'authenticated'.
   ========================================================================== */

import { crearCliente, configurado } from './config.js';

/** Se añade a los saltos entre páginas para esquivar la caché del navegador. */
export const VERSION = '5';

let clienteCache = null;

/** Cliente único de Supabase para la página actual. */
export function db() {
  if (!clienteCache) clienteCache = crearCliente();
  return clienteCache;
}

export { configurado };

/** Traduce los errores de Auth a algo que se entienda. */
export function mensajeDeErrorAuth(error) {
  if (!error) return 'Ocurrió un problema inesperado.';
  const texto = error.message || String(error);
  if (/Invalid login credentials/i.test(texto)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(texto))       return 'El correo aún no está confirmado en Supabase.';
  if (/Too many requests|rate limit/i.test(texto)) return 'Demasiados intentos. Espera un momento e inténtalo otra vez.';
  if (/Failed to fetch|NetworkError/i.test(texto)) return 'No hay conexión con el servidor.';
  return texto;
}

/** Inicia sesión con correo y contraseña. */
export async function iniciarSesion(email, contrasena) {
  const { data, error } = await db().auth.signInWithPassword({
    email: email.trim(),
    password: contrasena
  });
  if (error) throw error;
  return data.session;
}

/** Cierra la sesión del administrador. */
export async function cerrarSesion() {
  const { error } = await db().auth.signOut();
  if (error) throw error;
}

/** Devuelve la sesión activa, o null si no hay. */
export async function sesionActual() {
  const { data, error } = await db().auth.getSession();
  if (error) return null;
  return data.session || null;
}

/**
 * Protege una página: si no hay sesión, manda a login.html.
 * Devuelve la sesión cuando sí la hay.
 */
export async function exigirSesion(destino = 'login.html') {
  const sesion = await sesionActual();
  if (!sesion) {
    const volverA = encodeURIComponent(window.location.pathname.split('/').pop() || 'dashboard.html');
    // ?v= obliga al navegador a pedir la página en vez de usar la guardada.
    window.location.replace(`${destino}?v=${VERSION}&volver=${volverA}`);
    return null;
  }
  return sesion;
}

/**
 * Vuelve a pedir la contraseña antes de una acción destructiva.
 * Reutiliza el correo de la sesión actual, así el administrador solo escribe
 * la contraseña. Devuelve true si es correcta.
 */
export async function reautenticar(contrasena) {
  const sesion = await sesionActual();
  if (!sesion || !sesion.user || !sesion.user.email) {
    throw new Error('Tu sesión expiró. Vuelve a entrar.');
  }
  const { error } = await db().auth.signInWithPassword({
    email: sesion.user.email,
    password: contrasena
  });
  if (error) return false;
  return true;
}
