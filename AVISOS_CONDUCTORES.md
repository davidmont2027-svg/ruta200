# Avisos de reservas a conductores

En admin.html, cada conductor inicia sesión, pulsa **Activar avisos de reservas**, concede permiso y pulsa **Enviar prueba**. En iPhone debe abrir la PWA instalada desde su ícono. El sistema del teléfono decide sonido, vibración y entrega en segundo plano (silencio, ahorro de batería y restricciones del navegador pueden afectarlos).

Solo las reservas nuevas confirmadas generan un evento para el conductor asignado al horario. Las reservas anteriores no se notifican retroactivamente. Tony necesita una cuenta vinculada antes de poder suscribirse. Manuel no puede suscribirse ni recibir avisos mientras su acceso esté en mantenimiento.

El evento no incluye teléfono, nombre, clave privada ni folio del pasajero. El mensaje genérico abre el panel, que exige sesión. Cuando está abierto, el worker le pide actualizar sus datos. Cerrar sesión desactiva la suscripción de ese navegador. Las suscripciones se almacenan con pertenencia al usuario; un dispositivo compartido requiere activar de nuevo con la nueva cuenta.

## Backend

- `ruta200-push` comprueba el JWT de usuario contra Auth para configuración, alta, baja y prueba. Solo acepta el origen del sitio.
- El webhook de la base usa una capacidad aleatoria de 256 bits por evento. El verificador JWT del gateway está desactivado porque la función verifica ambos tipos de credencial por sí misma.
- Los endpoints de push admitidos son FCM, Mozilla y Apple, por HTTPS sin puerto ni credenciales. No se admiten URLs arbitrarias.
- Claves VAPID generadas en el servidor: tabla privada con RLS y sin permisos de clientes; solo funciones `service_role` pueden obtenerlas. No se incluyen en código público, respuestas al navegador ni logs.
- Trigger `r200_push_reserva`, cola privada y pg_net asíncrono. Si falla la solicitud de envío no impide reservar; el cron reintenta cada minuto los pendientes con dos minutos de separación, máximo cinco solicitudes.
- La entrega puede repetirse si el servicio de push aceptó el mensaje pero se perdió la respuesta; el tag estable del evento agrupa notificaciones repetidas.
- Las suscripciones con respuesta 404/410 se eliminan. La función termina eventos cancelados, sin dispositivos o de cuentas bloqueadas sin enviar.

## Validación

`node --experimental-vm-modules tests/frontend.mjs`

`node --experimental-vm-modules tests/pwa.mjs`

`node --experimental-vm-modules tests/avisos.mjs`

Se comprobaron permisos de BD, pertenencia de suscripción, bloqueo de Manuel/pasajeros, trigger y encolado dentro de una transacción revertida. El webhook real respondió 200 para un evento sin dispositivos y preparó las claves, sin avisar a clientes ni alterar la reserva. No hay revisión en navegador disponible en esta sesión: permiso y entrega al teléfono se comprueban con Enviar prueba.

El advisor marca la ubicación de la extensión pg_net como `public`; sus rutinas están en `net`, con permisos predeterminados administrados por Supabase. La migración de revocación fue un intento sin efecto sobre esos objetos, que pertenecen a supabase_admin; no debe interpretarse como una restricción aplicada. La cola, suscripciones, claves y funciones de aplicación sí tienen los permisos comprobados y restrictivos indicados arriba. Una reinstalación opcional para mover la extensión fue rechazada por revisión automática por riesgo a colas/cron y no se ejecutó. Se conserva la extensión en funcionamiento. Los avisos nuevos de RLS sin políticas corresponden a tablas privadas que intencionalmente deniegan acceso directo.
