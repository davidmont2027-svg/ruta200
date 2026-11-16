# Prueba aislada de acceso con presencia

Página: `prueba-presencia.html`. No modifica index.html, el formulario de reserva ni la función r200_reservar. La presencia todavía NO es obligatoria para reservar. Antes de activar esa exigencia hay que lograr una aprobación real en el teléfono del titular y comprobar el estado guardado por AWS/Supabase.

## Configuración completada el 16 de noviembre de 2026

- Lambda ruta200-liveness en us-east-1, URL `https://stx3gydourk5mp5tgrnanxnace0drhrj.lambda-url.us-east-1.on.aws/`, autorización de URL NONE y comprobación HMAC en código, BUFFERED, sin CORS. POST real sin firma devuelve 401 Solicitud no autorizada.
- El titular guardó LIVENESS_SHARED_SECRET y LIVENESS_LAMBDA_URL en los secretos de Supabase. No se copian claves privadas al cliente ni al repositorio. El recorrido real creó tres sesiones, vinculó sus propietarios y consultó resultados mediante la conexión firmada. Ninguna de esas tres pruebas quedó aprobada.
- Edge Function ruta200-liveness activa con validación de cada JWT en Auth /user, teléfono confirmado y RPC privados. Migraciones 20261116144757 y 20261116145337 aplicadas. El código servidor sigue documentado en el PR #6.
- Cognito Identity Pool Ruta200Liveness: `us-east-1:21ac92d6-d274-4651-b3b5-e2424d6c3b3b`. Solo invitado, flujo clásico inactivo.
- Rol `arn:aws:iam::538274759185:role/service-role/Ruta200LivenessInvitados`, política insertada Ruta200IniciarSelfie. La política solicitada permite únicamente rekognition:StartFaceLivenessSession, Resource *, región us-east-1. La captura confirma creación; no se ha inspeccionado de nuevo todo el JSON guardado.
- Prueba real GetId + GetCredentialsForIdentity completada: credenciales temporales emitidas. No se imprimieron ni persistieron; no se crearon sesiones de Rekognition durante esta comprobación.

## Cliente

- Teléfono → consentimiento → componente oficial FaceLivenessDetectorCore → consulta de resultado al servidor → enlace a reservar.
- Usa la sesión telefónica existente si está vigente. La pantalla de aprobación solo se muestra con verified === true desde Supabase. El callback de cámara no aprueba nada por sí solo.
- El backend usa el SessionId guardado bajo el propietario; el navegador solo envía attemptId al consultar. El alta y aprobación siguen exclusivamente en backend.
- La página advierte sobre luces intermitentes y procesamiento de video por AWS. No se almacena video ni galería de selfies desde el cliente. Las credenciales Cognito viven solo en memoria.
- Prepara bundle, credenciales y permiso de cámara antes de consumir cuota. Evita doble toque. Conserva requestId para reintentos ambiguos; una sesión ya consumida no se vuelve a montar hasta caducar o cerrar el resultado.
- No crea reservas ni altera cupos. No enlazada desde la portada mientras se prueba.

## Construir

En presencia-src: `npm ci --ignore-scripts` y `npm run build`. Dependencias fijadas y package-lock.json versionado. El bundle estático permite que GitHub Pages siga funcionando sin cambiar su pipeline. Se conservan avisos de licencia en presencia-assets/detector.js.LEGAL.txt.

Pruebas: `node --experimental-vm-modules tests/presencia-client.mjs` comprueba autenticación, errores, credenciales efímeras, consentimiento, doble toque, liberación de cámara y aprobación exclusiva del servidor con mocks. También pasan los tests SMS y los 21 tests existentes Edge/Lambda. La revisión de navegador confirma pantalla de teléfono en vista previa; Turnstile solo admite el dominio de producción y no se fuerza su validación en localhost.

## Prueba real pendiente

Abrir la página en el mismo Chrome donde se verificó el número. Si no conserva sesión, verificar SMS. Aceptar e iniciar una única prueba con cámara. Consultar resultado si tarda; verificar confirmación privada en DB antes de activar flujo obligatorio. Revisar logs sin exponer video, tokens ni claves si aparece un error. No dar por hecha la integración de HMAC/SDK por el evento de consola probar_configuracion, que no llama Rekognition.

Fuentes: https://ui.docs.amplify.aws/react/connected-components/liveness y https://docs.aws.amazon.com/cognito/latest/developerguide/getting-started-with-identity-pools.html.

## Diagnóstico y reposición de cuota, 16 de noviembre

El titular reportó límite de intentos aun con luz de día. La base confirmó tres intentos asociados a sesiones AWS y cerrados como rechazados, con una consulta real por cada intento. El registro original no conservaba estado AWS ni motivo, por lo que no permite atribuir el rechazo a luz, confianza insuficiente u otra causa.

Migraciones 20261116184550/20261116184703 añaden reintegro administrativo con fecha y motivo obligatorio; la cuota excluye exclusivamente intentos repuestos, sin alterar ni borrar su resultado. Se repusieron tres pruebas acompañadas del titular, conservando los tres rechazos y cero aprobaciones. Los pasajeros siguen sin permiso de escritura directa.

La finalización guarda estado AWS y categoría de resultado (sin puntuación ni imágenes); Edge v3 entrega esa categoría y el cliente distingue prueba incompleta de confianza insuficiente. En ese paso se mantuvo el umbral 90 y la presencia siguió sin ser obligatoria. Se necesita un nuevo intento acompañado para diagnosticar y conseguir aprobación. Pruebas: 22 Edge/Lambda, cliente y SQL real con ROLLBACK aprobados; reintegro sin motivo bloqueado, resultado rechazado inmutable y reintegro nunca concede aprobación. Endpoint sigue rechazando sin sesión con401.

## Ajuste de exigencia solicitado por el titular

Una prueba posterior terminó con AWS SUCCEEDED y confianza insuficiente. El titular pidió bajar la exigencia por la fricción del registro. Se aplicó 20261116190002 para cambiar el umbral inicial de 90 a 80, conservando teléfono confirmado, propietario, caducidad, estado real de AWS, cuota y terminales inmutables. Es un ajuste inicial de prueba; no demuestra todavía una tasa de aceptación o rechazo adecuada. No se aprobó retroactivamente ningún rechazo.

Prueba SQL real con fixtures y ROLLBACK: 79.99 rechaza, 80 aprueba, un rechazo previo no puede reabrirse; fixture revertido. Falta repetir una sola prueba real con el umbral ajustado. Se añadieron indicaciones de brillo máximo y luz uniforme sin sol directo conforme a recomendaciones AWS: https://docs.aws.amazon.com/rekognition/latest/dg/recommendations-liveness.html.
