# Sociedad de Fomento — Tu pasión, tu actividad, tu barrio

Aplicación web de demostración para consultar actividades de una sociedad de fomento e inscribirse en su próximo encuentro. El front-end está hecho con HTML, CSS y JavaScript; el back-end usa Node.js y SQLite.

## Ejecutar el proyecto

1. Instalar Node.js 22.13 o posterior (se recomienda Node.js 24 LTS).
2. Abrir una terminal en esta carpeta y ejecutar `npm start`.
3. Visitar http://localhost:3000. No abrir el HTML directamente: necesita el servidor.
4. Crear una cuenta o ingresar. Elegir una actividad, una categoría y agregarla al carrito. En «Ir al pago simulado», elegir un medio de prueba y confirmar. Las inscripciones aparecen en «Mis actividades / turnos asignados».

El pago es únicamente una simulación: no procesa cobros ni solicita datos reales. Los días, horarios, categorías y precios son ejemplos; no representan información confirmada de una sociedad de fomento real. Se pueden editar en `actividades.js`. Cada categoría muestra el próximo encuentro en los siguientes siete días. No hay control de cupos ni inscripción recurrente automática.

La base de datos se crea en `data/talleres.sqlite` y se conserva de la versión anterior, junto con cuentas y reservas. Las reservas anteriores siguen visibles. Para usar otra carpeta persistente, establecer `DATA_DIR`; el puerto se configura con `PORT`. La carpeta `data` no se sube a Git.

## Publicación y entrega

El mismo servidor entrega el front-end y la API. Para publicar, crear un repositorio GitHub con esta carpeta y conectarlo a un servicio compatible con Node.js, como Railway. Usar `npm start`, configurar `NODE_ENV=production` y montar un volumen persistente con la ruta indicada en `DATA_DIR` (por ejemplo `/data`). Sin volumen, SQLite puede perderse al reiniciar o redesplegar. Usar una sola instancia con HTTPS.

Completar `GrupoX.txt` con el número de grupo, integrantes, enlace del repositorio y URL pública del sitio; subirlo al Campus.
