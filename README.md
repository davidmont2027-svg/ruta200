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

## Publicación paso a paso y lugares disponibles

El panel conserva las cuentas y permisos existentes. El formulario principal publica una salida por recorrido/fecha, asientos, hora local, punto de encuentro manual y revisión. La publicación múltiple anterior sigue disponible en «Publicar varias salidas a la vez». Un reintento de la misma salida devuelve su identificador existente sin restablecer sus cupos ni su punto de encuentro.

Cada salida futura abierta permite ajustar lugares disponibles con − / + / Aceptar. La función autenticada bloquea la fila de horario, verifica propiedad, fecha, capacidad y los valores esperados de cupos. Los cupos ocupados no se modifican: el límite efectivo publicado es ocupados + disponibles. Se admite cero para retirar todos los lugares libres sin cancelar boletos; el trigger de reservaciones mantiene el control de sobreventa. Si la disponibilidad cambió desde que se abrió el panel, el ajuste se rechaza y se pide actualizar.

El punto de encuentro se guarda en la salida, se muestra en los carros del horario y aparece en el boleto y su mensaje de WhatsApp. No usa Google Places ni autocompletado de pago.

SQL aplicado mediante `apply_migration`, nombre `publicacion_y_asientos`, conservado en `supabase/publicacion_y_asientos.sql`. Verificación con `node --experimental-vm-modules tests/frontend.mjs`, `node tests/reserva-pasos.mjs` y `tests/publicacion-asientos.sql` ejecutado con BEGIN/ROLLBACK; las pruebas no conservaron datos ficticios. Las funciones nuevas requieren sesión, respetan mantenimiento individual y autorizan únicamente al dueño de la salida o al administrador.

## Llaves de acceso para operadores

El acceso con correo/contraseña conserva su funcionamiento. `operator-passkeys.js` consulta `/auth/v1/settings` y solo habilita los botones cuando `passkeys_enabled` es verdadero y el navegador admite WebAuthn en contexto seguro. El login con llave conserva Turnstile y entrega la sesión verificada al mismo control de permisos `r200_panel`. El registro está dentro del panel de una cuenta autorizada; el teléfono realiza la confirmación mediante su bloqueo de pantalla. El SDK usa almacenamiento de memoria y no comparte el almacenamiento de pasajeros.

Dependencia local fijada: `@supabase/supabase-js` 2.105.0; bundle oficial npm con integridad verificada, licencia y procedencia en `auth-assets/`. Se añadió un export ESM para `createClient`. Las llaves son una función experimental del proveedor; la contraseña se mantiene disponible. Pruebas: `node --experimental-vm-modules tests/operator-passkeys.mjs` y `tests/frontend.mjs`.

Configuración activada y verificada en el Dashboard de Supabase → Authentication → Passkeys:

- Enable Passkey authentication: activado.
- Relying Party Display Name: `RUTA 200`.
- Relying Party ID: `davidmont2027-svg.github.io`.
- Relying Party Origins: `https://davidmont2027-svg.github.io`.

Conservar el RP ID una vez registradas las primeras llaves. Cada conductor debe entrar con su contraseña y pulsar «Activar en este celular» para registrar la llave en su cuenta. No se registran llaves por cuenta de otra persona. Se verificaron `passkeys_enabled: true` y el botón de acceso habilitado en la versión publicada. El registro y la prueba biométrica de cada conductor deben realizarse en su propio dispositivo. Si en el futuro se desactiva la función del servidor, la interfaz informa que está pendiente y no simula una activación.

### Compatibilidad del selector de huella

El flujo se dividió en dos toques: primero obtiene el desafío del servidor (y verifica Turnstile al iniciar sesión); después «Continuar con huella / PIN» o «Confirmar en este celular» invoca `navigator.credentials.get/create` de forma inmediata desde el toque, sin esperar red ni importar módulos antes de abrir el selector. La respuesta se valida en Supabase mediante `auth.passkey.verifyAuthentication/verifyRegistration`. Nunca se muestra éxito solo por cerrar el selector del teléfono. Se conservan mensajes específicos de CAPTCHA, cancelación, navegador, origen y registro duplicado. Verificado mediante pruebas de secuencia del toque y las pruebas existentes; falta confirmar en el teléfono del conductor que reportó el problema.
