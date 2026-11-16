# Acceso de pasajeros activo: teléfono → selfie → reservar

Estado al 16 de noviembre de 2026: recorrido publicado y guard servidor aplicado. La portada index.html pide teléfono verificado por SMS con Turnstile y después prueba de presencia. Una sesión telefónica vigente con presencia aprobada por el servidor abre reservar.html directamente. El formulario no repite SMS ni CAPTCHA. Si se cierra o pierde la sesión, se vuelve a autenticar; una aprobación del mismo usuario/teléfono se conserva en servidor. No se promete sesión permanente.

## Cliente publicado

- index.html: acceso inicial, consentimiento de video y aviso de luces intermitentes. La aprobación procede siempre de Supabase.
- presencia.js: comparte el detector con prueba-presencia.html; en portada redirige a reservar.html tras aprobación guardada o nueva.
- reservar.html/reservar.js: comprueban sesión y presencia antes de mostrar o consultar viajes, rellenan el teléfono confirmado en solo lectura y permiten cerrar sesión. Conservan nombre, recorrido, fecha, horario, asientos, vehículos y boletos.
- prueba-presencia.html sigue disponible como prueba aislada; su botón a index.html continúa al formulario si la sesión está vigente y aprobada.
- Los errores de AWS pueden mostrar orientación específica si GetFaceLivenessSessionResults devuelve Feedback. No se muestran puntuaciones ni imágenes al pasajero.

## Backend activo

Edge ruta200-liveness v4 valida cada JWT contra Auth /user, teléfono confirmado, consentimiento, dueño de intento/sesión, cuota de 3 intentos en 24h, separación y límite de consultas. Lambda ruta200-liveness en us-east-1 verifica HMAC, usa SDK fijado y entrega únicamente estado/confianza al backend y códigos de feedback permitidos. Claves guardadas en AWS/Supabase, nunca en frontend o repositorio.

Migraciones aplicadas: 20261116144757, 20261116145337, 20261116184550, 20261116184703, 20261116190002 y 20261116193326. Tablas privadas con RLS y sin acceso directo de pasajeros; wrappers de escritura solo service_role, funciones privilegiadas en r200_privado.

r200_reservar exige Auth UID y teléfono realmente confirmado; una reserva nueva exige además confirmación de presencia del mismo UID y teléfono. La recuperación idempotente de un boleto existente permanece antes del nuevo guard, después de validar el teléfono, y no crea otra reserva. Permanecen cupos, cancelación hasta 30min antes, suspensión tras 3 ausencias y reactivación administrativa.

Umbral inicial80 solicitado por el titular tras rechazos con90. No demuestra por sí mismo tasas adecuadas de aceptación/rechazo; se necesita seguimiento con dispositivos y condiciones reales. Reintegros administrativos conservan intentos y resultados, requieren fecha/motivo y no conceden aprobación. Se repusieron únicamente tres pruebas acompañadas, sin modificar límites globales.

## Comprobaciones completadas

- Titular completó prueba real tras cargar ZIP feedback-v1. AWS SUCCEEDED, intento aprobado y confirmación privada guardada el 16/nov a19:22:19Z, con teléfono de Auth confirmado y coincidente. No se aprobó manualmente.
- ZIP cargado: SHA256base64 Mldqs9S7b6iNd/FZpIVsD06Itj9B9EkTAs8xk/LS6eo=; configuración muestra feedback-v1, clave presente y cero llamadas AWS durante esa comprobación.
- 24tests Edge/Lambda, pruebas cliente (consentimiento, doble toque, cámara, feedback, redirección exclusiva tras aprobación), y suite frontend de reservas, respuesta perdida, boleto, cancelación, roles y Turnstile aprobados con mocks.
- SQL real con BEGIN/ROLLBACK: rechaza teléfono sin confirmar, metadata falsa, ausencia de aprobación propia y aprobación ajena; conserva idempotencia incluso si debe renovarse selfie, cupos, cancelación y suspensión. Fixtures y horario sintético revertidos.
- Publicación PR8 (backend existente) y PR9 (portada/formulario) completadas. GitHub Pages exitoso y navegador confirma que visitar reservar.html sin sesión lleva a index.html con pantalla de teléfono.
- Después de publicar el frontend se aplicó guard servidor. Consulta real confirma presencia exigida, anon bloqueado, authenticated permitido y aprobación del titular conservada.
- Pendiente comprobación final del titular del formulario limpio y reserva real posterior al nuevo recorrido. No se crearon ni cancelaron reservas reales durante los tests del agente.

## Configuración y reproducción

Lambda URL: https://stx3gydourk5mp5tgrnanxnace0drhrj.lambda-url.us-east-1.on.aws/ (NONE con HMAC en código, BUFFERED, sin CORS).
Cognito Identity Pool: us-east-1:21ac92d6-d274-4651-b3b5-e2424d6c3b3b, solo invitado, rol service-role/Ruta200LivenessInvitados con StartFaceLivenessSession limitado a us-east-1. GetId/GetCredentialsForIdentity comprobados sin imprimir ni persistir credenciales temporales.

Cliente: en presencia-src, npm ci --ignore-scripts y npm run build; dependencias fijadas y lockfile versionado. Lambda: en aws/liveness, npm ci --ignore-scripts y npm run build; comprimir dist/index.mjs e index.mjs.LEGAL.txt en raíz del ZIP. Conservar avisos de licencia.

Fuentes: https://ui.docs.amplify.aws/react/connected-components/liveness , https://docs.aws.amazon.com/rekognition/latest/APIReference/API_FeedbackItem.html y https://docs.aws.amazon.com/rekognition/latest/dg/recommendations-liveness.html .
