# Registro por SMS — preparado, pendiente de activación

Twilio Verify fue configurado por el titular en Supabase. El Auth Token nunca se incluye en código, repositorio ni registros.

## Comportamiento

El pasajero solicita un código SMS, lo confirma y conserva su sesión en el dispositivo. Las solicitudes de nuevos códigos tienen una espera visual de 60 segundos. Al caducar el acceso, se renueva con el refresh token, sin SMS por cada reserva. En un equipo compartido debe cerrar su sesión.

La migración 006 exige auth.uid(), teléfono confirmado en auth.users y coincidencia exacta entre el teléfono mexicano de la reserva y el de la sesión. No confía en user_metadata, valores enviados por el navegador ni en indicadores locales. Revoca el permiso de reservar para anon; las otras funciones públicas de consulta y boleto mantienen sus permisos. Se conservan la lógica transaccional de cupos, idempotencia, historial y suspensión.

## Antes de activar

1. Confirmar Phone habilitado, proveedor Twilio Verify, confirmaciones habilitadas, credenciales guardadas y números/OTP de prueba vacíos.
2. Configurar límites de envío en Supabase Auth, protección CAPTCHA en el flujo y restricciones geográficas apropiadas en Twilio. La espera visual de 60 segundos no es un control de seguridad del servidor. Actualmente México está permitido; otros países también estaban permitidos en las capturas y aún no se han restringido.
3. Probar envío y confirmación reales en una página de prueba controlada, incluidos código incorrecto, expiración y reenvío. Estas pruebas no se han realizado a través de Supabase.
4. Ejecutar pruebas SQL en transacción con rollback: rechazo sin sesión, teléfono ajeno/no confirmado; suspensión histórica; reserva correcta; reintento idéntico; cupos en concurrencia.
5. Coordinar publicación del frontend y aplicación de 006 para que las versiones viejas sin sesión no queden como vía alternativa. Tras 006, los clientes viejos necesitan recargar la página e iniciar sesión. Los boletos existentes conservan sus enlaces de consulta y cancelación.

## Validación realizada

Pruebas JavaScript locales con API simulada; no envían mensajes ni gastan saldo:

```sh
node --experimental-vm-modules tests/frontend.mjs
node --experimental-vm-modules tests/sms-auth.mjs
```

La migración SQL está preparada, pero no aplicada ni probada contra la base real. Esta rama no activa la prueba de vida AWS: esa integración requiere sesiones de liveness ligadas al usuario confirmado y validación del resultado por el servidor. No se debe marcar a nadie como verificado a partir de un resultado proporcionado por el navegador.
