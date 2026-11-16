# RUTA 200 — Juntos en el camino

Web de reservaciones Tepic ↔ Mezcales con Supabase. Tarifa: $250 MXN por asiento, pago al abordar; máximo 4 pasajeros por vehículo.

## Operación

- El administrador arma el rol agregando o quitando salidas por conductor y vehículo. No se fija a dos vueltas; permite tres o más según el horario.
- Cada fila elige fecha, hora local de origen y sentido. Se conserva la validación de 2 h 30 de recorrido y 40 min de margen para evitar superponer viajes del mismo carro.
- El rol se revisa y publica en una operación. Si falla una salida, no se guardan las nuevas de ese envío. Reintentar no duplica las salidas idénticas ya publicadas.
- La base tiene cinco vehículos registrados; no se ha inventado un sexto.
- Reservas atómicas y boletos con enlace privado. Cancelación hasta 30 minutos antes; libera lugares sin borrar el historial.
- Tres ausencias sin cancelar suspenden el número. Solo el administrador puede corregir incidencias y conceder una segunda oportunidad; la suspensión no vence automáticamente.
- Conductores autorizados consultan sus viajes y pasajeros, además del historial compartido.
- El MG5 blanco (vehículo 1) tiene su imagen individual, recuperada del trabajo anterior del usuario. Los demás vehículos no muestran una imagen de flota como si fuera su foto individual.

## Validación y publicación

La reserva web de cuatro lugares, boleto, disponibilidad agotada en otra pestaña y cancelación con devolución de lugares fueron probados en Supabase. El rol de seis salidas (tres vueltas), reintento, reversión ante error y permisos se probaron en una transacción que se revirtió; las pruebas de frontend incluyen la foto individual y el formulario de rol.

Las migraciones 001, 002, 003 y 004 ya fueron aplicadas al proyecto existente. No repetir 001. Los cambios de rol y foto están publicados en GitHub Pages. Verificado por navegador: el panel carga «Publicar rol de salidas», una fila inicial y el botón «AGREGAR OTRA SALIDA»; el boleto del vehículo 1 obtiene su identificador desde Supabase y muestra cargada correctamente la imagen individual del MG5 blanco. La comprobación del formulario de rol con sesión simulada y las pruebas SQL de seis salidas también pasaron. El administrador debe recargar el panel para recibir la nueva interfaz.

Pruebas de interfaz simulada: `node --experimental-vm-modules tests/frontend.mjs`. Los scripts SQL de pruebas deben ejecutarse con BEGIN/ROLLBACK según sus comentarios, sin conservar salidas ficticias.

## Límites actuales

El teléfono aún no se verifica por SMS o WhatsApp, y no hay pagos en línea ni avisos automáticos. El enlace privado del boleto permite consultarlo y cancelarlo; compartirlo por WhatsApp requiere una acción del pasajero. La portada general de la flota se conserva.

Nunca incluir contraseñas, llaves privadas ni datos reales de pasajeros en este repositorio.

## Fotos y conductores de la flota

| Vehículo | Conductor | Imagen individual |
| --- | --- | --- |
| MG5 blanco (1) | Blanca | mg5-blanco.svg |
| Versa V-Drive blanco (2) | Tony | versa-vdrive-tony.svg |
| Vento blanco (3) | Manuel | vento-manuel.svg |
| Aveo azul persuasión (4) | David | aveo-david.svg |
| Versa azul (5) | Francisco | versa-francisco.svg |

La asociación usa el identificador del vehículo. El panel muestra una galería y cada salida identifica carro y conductor; la consulta pública muestra fotos, nombres y cupos del horario seleccionado. El pasajero sigue eligiendo horario, con asignación de carro según disponibilidad. El boleto confirmado muestra el conductor del viaje y su vehículo.

Se reutilizaron las imágenes preparadas en los chats anteriores, sin modificar la portada. La migración 005 ya se aplicó a Supabase y conserva las autorizaciones existentes. No se cambiaron nombres, cuentas, horarios ni reservas reales. Las pruebas SQL para las cinco relaciones se revirtieron al terminar; el frontend verifica fotos, nombres, modelos y hora, además de los flujos existentes.
