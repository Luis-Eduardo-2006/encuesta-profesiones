"""
Servidor local para probar la encuesta.

    python servidor.py          (usa el puerto 8000)
    python servidor.py 8080     (u otro puerto)

¿Por qué no `python -m http.server` a secas? Porque ese no manda cabeceras de
caché, y el navegador se queda con la versión vieja de las páginas. Si el HTML
guardado es anterior a un cambio y el JavaScript ya es el nuevo, el formulario
deja de funcionar aunque esté todo bien escrito. Este servidor manda
`no-store`, así que cada recarga trae siempre la última versión.
"""

import http.server
import socketserver
import sys

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class SinCache(http.server.SimpleHTTPRequestHandler):
    """Igual que el servidor normal, pero prohibiendo la caché."""

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, formato, *args):
        # Solo los errores; si no, la consola se llena con cada imagen.
        if args and str(args[1]).startswith(('4', '5')):
            super().log_message(formato, *args)


class Servidor(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Servidor(('127.0.0.1', PUERTO), SinCache) as servidor:
        print(f'Encuesta corriendo en  http://localhost:{PUERTO}')
        print('Para detenerlo, pulsa Ctrl+C.')
        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            print('\nServidor detenido.')
