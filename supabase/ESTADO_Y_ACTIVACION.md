# RUTA 200: estado y activación

Revisión del 15 de noviembre de 2026, hora de Tepic.

## Actualización: publicada y API activada

La activación 002 fue autorizada y ejecutada. La PR #1 se integró en main (merge b9f65a62cec927cb18a67cd048b341100d626afc). GitHub Pages sirve la versión conectada en https://davidmont2027-svg.github.io/ruta200/.

Verificado por navegador: consulta real de horarios responde sin salidas abiertas; selección de regreso y cuatro asientos muestra total de 1000 MXN; admin.html requiere inicio de sesión; boleto.html recupera la reserva sintética cancelada AA9AAFC3-2F61-4A2D-AB7C-6D001CFD135F desde Supabase y muestra su estado correcto.

La comprobación SQL confirma EXECUTE público de r200_reservar y ausencia de SELECT público sobre reservaciones. El horario 22 sigue inactivo, fecha 2026-12-16, hora 08:00, cero cupos ocupados. Todavía falta crear/cancelar una reserva mediante el formulario web con un horario activo controlado y verificar el inicio de sesión del administrador. No hay salidas reales abiertas. Las secciones siguientes documentan la preparación previa; esta actualización es el estado vigente.

## Ya realizado

- Revisión del proyecto real `ruta200-reservaciones` y del código publicado.
- Migración 001 instalada en Supabase en una transacción, conservando las siete tablas y sus registros originales. No ejecutar 001 por segunda vez.
- Cupos ocupados actualizados mediante bloqueo del horario y modificación atómica, con límite de cuatro pasajeros. Índice para evitar duplicar reservas confirmadas por número y salida.
- Funciones de reservación, boletos privados, cancelación hasta 30 minutos antes, registro/corrección de ausencias y reactivación solo por administrador.
- Las funciones nuevas NO son ejecutables por anon ni authenticated todavía. Las tablas privadas no permiten acceso directo a estos roles. RLS se conserva.
- Se conservaron los cinco horarios originales inactivos y los cinco vehículos. No se inventó un sexto vehículo.
- Se añadió el horario 22 para la prueba de concurrencia. Está inactivo, con cero cupos ocupados. La reserva sintética PRUEBA CONCURRENCIA A, teléfono 0000000081, quedó cancelada; no se borró.

## Pruebas efectuadas

- SQL real, con datos temporales y rollback: reservar, máximo 4, sobreventa, reintento con misma clave, recuperación por enlace privado, cancelación y liberación exactamente una vez, cancelación tardía rechazada, ausencia prematura rechazada, tres ausencias y suspensión, doble toque sin duplicar incidencia, corrección y reactivación conservando historial.
- Panel administrador, creación de horarios, rechazo de superposición de viajes, cierre de salidas, denegación a visitantes y usuarios no asignados.
- Privilegios: las funciones internas no son accesibles; visitantes no pueden leer reservas; usuarios no pueden actualizarlas directamente.
- Dos consultas simultáneas reales sobre el horario 22: A reservó 3 asientos y mantuvo el bloqueo 15 segundos; B intentó otros 3 y fue rechazada. Ocupación final 3/4. Luego se canceló A y quedó 0/4, horario cerrado.
- Pruebas de JavaScript con DOM y respuestas de red simulados: agrupación por hora, selección de un vehículo con capacidad, validación, doble toque, respuesta perdida y reintento con misma clave, enlaces privados sin datos del pasajero en query, boleto y cancelación.
- Comprobación de sintaxis de los cuatro módulos JavaScript.

Ejecutar las pruebas de frontend: `node --experimental-vm-modules tests/frontend.mjs`.

## Pendiente antes de la prueba web completa

1. Autorizar y ejecutar `002_activar_api.sql`: visitantes podrán consultar disponibilidad y reservar; consultar/cancelar requiere la clave privada de cada boleto. Solo cuentas autorizadas podrán usar el panel; solo el administrador puede reactivar y corregir.
2. Integrar esta rama a main para publicar la interfaz conectada en GitHub Pages. Conserva la portada y el diseño del boleto existentes; admin-demo.html y chofer-demo.html siguen intactos.
3. Probar por navegador el flujo completo con un horario de prueba controlado y cerrarlo al terminar. Todavía NO se ha probado el flujo completo de navegador contra la API publicada.
4. Verificar el inicio de sesión con la cuenta operativa ya registrada como administrador. No es necesariamente la contraseña usada para entrar al dashboard de Supabase. No se cambiaron contraseñas ni se crearon cuentas.
5. Crear salidas reales desde admin.html después de definir fechas y horas; todos los horarios actuales están cerrados.

## Límites conocidos

- El teléfono identifica al pasajero, pero aún no se verifica por SMS. La suspensión aplica al número registrado; por sí sola no demuestra su titularidad ni impide usar otro número. No se implementaron selfie ni CAPTCHA.
- El enlace de boleto es una credencial privada para consultar y cancelar esa reserva. Se guarda en el fragmento de URL y solo su hash queda en la base. Quien lo reciba podrá cancelar dentro del plazo. Compartir por WhatsApp requiere pulsar el botón; no se envían avisos automáticos.
- Pago al abordar, tarifa fija de 250 MXN. No hay procesamiento de pagos en línea.
- El panel limita las listas a las últimas 200 salidas y 500 reservas/pasajeros/incidencias; los registros antiguos siguen conservados en la base.
- No se activan cron jobs ni horarios ficticios de manera automática.

## Conservación y reversión

La rama principal sigue usando la demostración hasta integrar estos cambios. La migración es aditiva; no elimina columnas ni registros. En caso de retirar la nueva web, volver al commit anterior en GitHub y revocar EXECUTE de las funciones r200_* antes de intervenir la base; conservar todas las tablas e historial. No ejecutar un DROP general ni restaurar un respaldo encima de reservas nuevas.
