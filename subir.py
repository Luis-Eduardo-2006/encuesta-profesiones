"""
Sube a GitHub los cambios que hayas hecho en el proyecto.

    python subir.py                     te pregunta qué cambiaste
    python subir.py "Cambié los textos" lo sube con ese mensaje

Hace tres cosas, que son las tres que pide git: preparar los archivos que
cambiaron, guardarlos con un mensaje, y enviarlos a GitHub.

Antes de subir nada comprueba que no se escape ningún archivo con credenciales.
"""

import subprocess
import sys

REPOSITORIO = 'https://github.com/Luis-Eduardo-2006/encuesta-profesiones'

# Archivos que jamás deben salir del computador. Si alguno aparece entre los
# cambios preparados, el guion se detiene en vez de publicarlo.
PROHIBIDOS = ('.mcp.json', '.env')


def git(*argumentos, capturar=True):
    """Ejecuta un comando de git y devuelve su salida."""
    resultado = subprocess.run(
        ['git', *argumentos],
        capture_output=capturar,
        text=True,
        encoding='utf-8',
        errors='replace'
    )
    return resultado


def salir(mensaje, codigo=1):
    print('\n' + mensaje)
    input('\nPulsa Enter para cerrar.')
    sys.exit(codigo)


def main():
    if git('rev-parse', '--is-inside-work-tree').returncode != 0:
        salir('Esta carpeta no es un repositorio de git.')

    print('=== Subir los cambios a GitHub ===\n')

    # 1. Preparar todo lo que cambió.
    git('add', '-A')

    cambios = git('diff', '--cached', '--name-status').stdout.strip()
    if not cambios:
        salir('No hay nada que subir: GitHub ya tiene la última versión.', 0)

    # 2. Red de seguridad: ningún archivo con credenciales.
    preparados = git('diff', '--cached', '--name-only').stdout.split()
    filtrados = [a for a in preparados if any(p in a for p in PROHIBIDOS)]
    if filtrados:
        git('reset')
        salir('DETENIDO. Estos archivos llevan credenciales y no deben subirse:\n  '
              + '\n  '.join(filtrados)
              + '\n\nRevisa el archivo .gitignore.')

    print('Esto es lo que se va a subir:\n')
    for linea in cambios.splitlines():
        estado, _, archivo = linea.partition('\t')
        etiqueta = {'A': 'nuevo    ', 'M': 'cambiado ', 'D': 'borrado  ',
                    'R': 'renombrado'}.get(estado[0], estado + '        ')
        print(f'  {etiqueta} {archivo}')

    # 3. El mensaje describe qué cambiaste, para poder volver atrás algún día.
    if len(sys.argv) > 1:
        mensaje = ' '.join(sys.argv[1:])
    else:
        print()
        mensaje = input('¿Qué cambiaste? ').strip()

    if not mensaje:
        git('reset')
        salir('Sin mensaje no se sube nada. Vuelve a intentarlo describiendo el cambio.')

    print('\nGuardando...')
    commit = git('commit', '-m', mensaje)
    if commit.returncode != 0:
        salir('No se pudo guardar:\n' + (commit.stderr or commit.stdout))

    print('Enviando a GitHub...')
    push = git('push')
    if push.returncode != 0:
        salir('Se guardó en tu computador, pero no se pudo enviar a GitHub:\n'
              + (push.stderr or push.stdout)
              + '\n\nSi es un problema de conexión, vuelve a ejecutar este guion más tarde.')

    print('\nListo. Ya está en GitHub:')
    print('  ' + REPOSITORIO)
    input('\nPulsa Enter para cerrar.')


if __name__ == '__main__':
    main()
