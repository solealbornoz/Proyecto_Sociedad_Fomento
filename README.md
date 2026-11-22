# Sociedad de Fomento — Tu pasión, tu actividad, tu barrio

Aplicación web de demostración para consultar actividades e inscribirse. Usa HTML, CSS y JavaScript en el front-end, Node.js en el back-end y SQLite local o Turso en la nube. Turso aloja la base de datos: el servidor debe ejecutarse aparte, por ejemplo en Vercel.

## Ejecución local

1. Instalar Node.js 22.13 o superior (se recomienda Node.js 24 LTS).
2. Abrir una terminal en esta carpeta y ejecutar `npm install`.
3. Ejecutar `npm start` y abrir http://localhost:3000.
4. Para detener el servidor, presionar `Ctrl + C` en la terminal.

Sin variables de Turso, la aplicación usa `data/talleres.sqlite` como antes. Si configurás Turso, tanto los cambios locales como los del sitio publicado usarán la base en la nube. El pago es simulado y los días, horarios y valores son de ejemplo.

## Conectar Turso

1. Crear una base vacía en la cuenta de Turso.
2. Copiar `.env.example` a un archivo llamado `.env` en esta carpeta. Completar `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` con la URL y un token de esa base. El archivo `.env` está excluido de Git: nunca publiques ni compartas el token.
3. Ejecutar `npm start`. El servidor crea las tablas necesarias si todavía no existen.

## Migrar datos existentes

Antes de iniciar la aplicación apuntando a Turso, detener el servidor local y conservar una copia de `data/talleres.sqlite`. Con el archivo `.env` configurado y la base de Turso vacía, ejecutar:

```bash
npm run migrar:turso
```

El comando copia cuentas, reseñas, inscripciones y carrito dentro de una transacción. Exige que todas las tablas de destino estén vacías y no borra ni modifica el archivo local. Las contraseñas se conservan como hashes; las sesiones no se copian y los usuarios deben volver a iniciar sesión. Si existen datos en Turso, el comando se detiene sin reemplazarlos. Para especificar otra base local, establecer `MIGRATION_SQLITE_PATH`.

## Publicación en Vercel

1. Subir el código actualizado al repositorio y conectar el proyecto a Vercel. El directorio raíz debe contener `package.json` y `vercel.json`.
2. En las variables de entorno del proyecto Vercel, configurar `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`. El token va en la configuración privada del servicio, nunca en el código ni en el repositorio. Configurar las variables para los entornos que se vayan a usar.
3. Usar Node.js 22 o 24, seleccionar framework «Other» y redesplegar. Las páginas estáticas se sirven en Vercel y las rutas `/api` se ejecutan como funciones conectadas a Turso.
4. Probar registro, ingreso, carrito y confirmación. Las pruebas crean datos en la base configurada: usar una base de prueba si no se quieren mezclar con los datos reales.

Si la conexión falla, revisar los logs de la función y confirmar que ambas variables estén configuradas para ese despliegue. Una carpeta temporal en Vercel no proporciona una base persistente.

## Entrega

Completar `GrupoX.txt` con el número de grupo, integrantes, enlace del repositorio y URL pública; subirlo al Campus.

## Organización del proyecto

- `frontend/`: páginas HTML, estilos y JavaScript que se ejecuta en el navegador.
- `backend/`: servidor, API, conexión a Turso y catálogo de actividades.
- `api/`: punto de entrada de las funciones de Vercel.
- `scripts/`: migración de SQLite a Turso.
- `server.js`: punto de entrada del servidor para Node.js y Vercel.
- `data/`: base SQLite local de respaldo, excluida de Git.
- `.env`: configuración privada de Turso, excluida de Git.

Los comandos se ejecutan desde la raíz del proyecto, no desde `frontend` ni `backend`.
