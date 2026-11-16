# Registro por SMS — activo en reservas

El 16 de noviembre de 2026 se publicó el formulario de reservas con SMS (PR #3, commit de integración 1f3b66471fb719f62d370c269b1db60cf4921d53) y se aplicó permanentemente 006 en Supabase, tras verificar que la página publicada mostraba los controles SMS.

## Comportamiento

El pasajero confirma su teléfono mediante Supabase Auth y Twilio Verify. La sesión se conserva en el dispositivo y se renueva con refresh token, sin un SMS por cada reserva. La reserva envía el token autenticado. La función SQL exige auth.uid(), teléfono confirmado en auth.users y coincidencia con el teléfono mexicano de la reserva; nunca confía en user_metadata ni en una marca local. anon no puede crear reservas. Los enlaces privados de boletos conservan sus funciones de consulta y cancelación. Los clientes con una versión antigua deben recargar e iniciar sesión.

Se conserva la lógica existente de cupos transaccionales, idempotencia, cancelación, historial y suspensión por tres ausencias. La activación sustituyó la función y ajustó sus permisos; no creó ni modificó reservaciones ni salidas.

## Configuración y evidencia

- El titular configuró Twilio Verify sin revelar el Auth Token. Phone y nuevos registros habilitados; límite confirmado de 10 SMS/h para todo el proyecto.
- El perfil individual Ruta 200 en Twilio aparece Aprobado. La primera prueba real de SMS fue confirmada en video.
- Turnstile usa la Site Key pública de captcha.js. La Secret Key fue pegada directamente por el titular en Supabase y nunca se guardó en el repositorio.
- La captura de Supabase muestra CAPTCHA habilitado, proveedor Turnstile, secreto oculto y guardado exitoso.
- El titular confirmó acceso real de administración tras activar CAPTCHA y repitió la verificación SMS con éxito; la captura muestra Teléfono confirmado.
- El acceso de operadores con Turnstile se publicó en PR #5; tanto OTP como contraseña remiten gotrue_meta_security.captcha_token.
- La comprobación SQL posterior a la activación devolvió SMS exigido en reservas y true para anon_bloqueado, autenticado_permitido y exige_telefono_confirmado.
- En el formulario publicado, una prueba sin sesión y con número sintético mostró Confirma por SMS este teléfono antes de reservar, sin crear una reserva.
- El titular completó una reserva real tras verificar por SMS. Sus capturas muestran boleto confirmado con folio, 3 asientos, $750 MXN, Tepic–Mezcales a las 11:00 del 16-11-2026 y MG5 de Blanca. Confirmó después haber cancelado la reserva de prueba; no se ha comprobado por separado el contador de asientos tras esa cancelación.

La espera visual de 60 segundos entre SMS no sustituye el límite del servidor. México está permitido en Twilio; las capturas también permitían otros países, y esa configuración no se ha restringido.

## Validación

Tres suites JavaScript con API simulada aprobadas:

```sh
node --experimental-vm-modules tests/frontend.mjs
node --experimental-vm-modules tests/sms-auth.mjs
node --experimental-vm-modules tests/captcha.mjs
```

La migración fue probada previamente en Supabase dentro de una transacción con fixtures sintéticos y ROLLBACK: permisos, ausencia de identidad, teléfono sin confirmar incluso con metadatos falsificados, teléfono ajeno, reserva correcta, idempotencia, máximo de cuatro, cancelación/liberación y suspensión histórica. La salida confirmó fixtures revertidos y función/permisos originales restaurados. Script reproducible: tests/sms-rollback-completo.sql. Después se aplicó 006 permanentemente con comprobaciones dentro de la transacción.

## Pendientes

- Prueba negativa real de CAPTCHA sin token contra el servidor. La aceptación con token y CAPTCHA habilitado se comprobó con las pruebas del titular; la ausencia del token solo se cubre con API simulada en las suites locales.
- Código incorrecto, expiración y reenvío están cubiertos con API simulada; no se han ensayado todos esos casos con SMS real.
- Concurrencia entre transacciones con la nueva validación SMS no repetida; conserva el trigger de cupos probado previamente.
- AWS Face Liveness todavía no está integrado. Requiere sesiones ligadas al usuario confirmado y validación del resultado en servidor. Nunca marcar verificación a partir de una respuesta proporcionada por el navegador.
