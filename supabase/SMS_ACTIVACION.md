# Registro por SMS — preparado, pendiente de activación

Twilio Verify fue configurado por el titular en Supabase. El Auth Token nunca se incluye en código, repositorio ni registros.

## Comportamiento

El pasajero solicita un código SMS, lo confirma y conserva su sesión en el dispositivo. Las solicitudes de nuevos códigos tienen una espera visual de 60 segundos. Al caducar el acceso, se renueva con el refresh token, sin SMS por cada reserva. En un equipo compartido debe cerrar su sesión.

La migración 006 exige auth.uid(), teléfono confirmado en auth.users y coincidencia exacta entre el teléfono mexicano de la reserva y el de la sesión. No confía en user_metadata, valores enviados por el navegador ni en indicadores locales. Revoca el permiso de reservar para anon; las otras funciones públicas de consulta y boleto mantienen sus permisos. Se conservan la lógica transaccional de cupos, idempotencia, historial y suspensión.

## Turnstile integrado, pendiente de prueba real

La clave pública proporcionada por el titular está en captcha.js. El script oficial se carga explícitamente; la Secret Key nunca se coloca en archivos. El envío OTP y el acceso por contraseña de operadores remiten gotrue_meta_security.captcha_token a Supabase. Los tokens vencidos o ausentes bloquean el envío en la interfaz y se reinician después de cada intento. Supabase debe validar en servidor con Turnstile habilitado; el navegador no sustituye esa validación.

El titular confirmó Phone habilitado y un límite de 10 SMS por hora para todo el proyecto. El registro de nuevos usuarios estaba apagado en la última captura: revisar antes de la prueba.

## Antes de activar

1. Confirmar Phone habilitado, proveedor Twilio Verify, confirmaciones habilitadas, credenciales guardadas y números/OTP de prueba vacíos.
2. Confirmar el límite guardado de envíos en Supabase Auth, publicar y probar Turnstile en pasajeros y operadores, y revisar restricciones geográficas apropiadas en Twilio. No activar el interruptor CAPTCHA hasta publicar ambos formularios. Después el titular configura la Secret Key directamente en Supabase y se prueba el rechazo real sin token y la aceptación con token válido. La espera visual de 60 segundos no es un control de seguridad del servidor. Actualmente México está permitido; otros países también estaban permitidos en las capturas y aún no se han restringido.
3. Probar envío y confirmación reales en una página de prueba controlada, incluidos código incorrecto, expiración y reenvío. Estas pruebas no se han realizado a través de Supabase.
4. Pruebas SQL con rollback completadas para identidad, permisos, cupos y suspensión. La concurrencia entre transacciones con la nueva validación SMS no se ha repetido; el control de cupos sigue usando el trigger transaccional existente ya probado previamente.
5. Coordinar publicación del frontend y aplicación de 006 para que las versiones viejas sin sesión no queden como vía alternativa. Tras 006, los clientes viejos necesitan recargar la página e iniciar sesión. Los boletos existentes conservan sus enlaces de consulta y cancelación.

## Validación realizada

Pruebas JavaScript locales con API simulada; no envían mensajes ni gastan saldo:

```sh
node --experimental-vm-modules tests/frontend.mjs
node --experimental-vm-modules tests/sms-auth.mjs
node --experimental-vm-modules tests/captcha.mjs
```

La migración SQL fue probada en Supabase dentro de una transacción con ROLLBACK, junto con fixtures sintéticos no visibles para otras transacciones. Pasaron los permisos anon/authenticated, el rechazo sin identidad y sin teléfono confirmado (incluso con user_metadata falsificado), teléfono ajeno, reserva correcta, idempotencia, cupo máximo de cuatro, cancelación con liberación y suspensión histórica. La salida confirmó que se revirtieron usuarios/horario de prueba y se restauraron función y permisos originales. No se ha aplicado permanentemente. Script reproducible: tests/sms-rollback-completo.sql. La prueba no comprueba recepción del SMS real ni una validación real de Turnstile. Esta rama no activa la prueba de vida AWS: esa integración requiere sesiones de liveness ligadas al usuario confirmado y validación del resultado por el servidor. No se debe marcar a nadie como verificado a partir de un resultado proporcionado por el navegador.
