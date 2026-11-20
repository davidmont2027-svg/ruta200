# Respaldo del panel de conductores

Antes de activar el panel sencillo se guardó la rama `respaldo/panel-antes-simplificado-20261119` en GitHub, desde el commit `b534645f4a6f8a11b5cecad18ba8d5435dde5a6a`.

Para restaurar únicamente el diseño y comportamiento anterior, recuperar `admin.html`, `admin.js`, `nueva-interfaz.css` y `tests/frontend.mjs` desde esa rama en un nuevo commit de main. El archivo nuevo `panel-conductores.css` quedará sin referencias y puede retirarse. No forzar main ni revertir otras mejoras.

Este respaldo no contiene sesiones ni datos de pasajeros. La operación permanece conectada a la misma base y a sus reglas de permisos, publicación y reservación.

Manuel y Tony se retiraron mediante desactivación de sus registros de conductor y vehículo y eliminación de sus destinos de notificación. Sus datos de conductor y vehículo se conservaron en `r200_privado.respaldo_retiro_manuel_tony_20261120`, sin acceso público. Sus cuentas de autenticación no se borraron: al estar inactivos, las funciones de operador rechazan el acceso. Restaurar el diseño no reactiva a los conductores.
