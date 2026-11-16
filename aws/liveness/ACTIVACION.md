# Presencia — backend preparado, cámara y flujo pendientes

Reemplaza el código de demostración en ruta200-liveness, Node.js 26, us-east-1, handler index.handler. El archivo ZIP contiene index.mjs en la raíz y utiliza el SDK v3 incluido en el runtime de Lambda. El titular cargó el ZIP y ejecutó probar_configuracion: la captura muestra us-east-1, clave_configurada=true y llamadas_aws=0. Esto no carga ni comprueba el SDK de Rekognition, que se importa de forma diferida. Los tests locales simulan AWS.

La función permite crear una sesión idempotente y obtener únicamente estado/confianza de AWS. Reutiliza los permisos de CreateFaceLivenessSession y GetFaceLivenessSessionResults del rol Ruta200LivenessLambda. No devuelve imágenes ni decide por sí sola habilitar una reserva.

## Conectar la URL de función

El backend ruta200-liveness de Supabase ya fue desplegado (versión 1) y las migraciones privadas se aplicaron. Comprueba JWT real mediante Auth /user, teléfono confirmado, consentimiento y cuota; asocia cada requestId/SessionId al usuario y comprueba la pertenencia antes de consultar resultados. Falta configurar LIVENESS_LAMBDA_URL con la URL HTTPS de Lambda y comprobar una llamada firmada real. El navegador no puede seleccionar una sesión ajena ni enviar una marca local de aprobación. La función Lambda confía en ese backend para comprobar propietario y cuota.

Se necesita un secreto aleatorio exclusivo LIVENESS_SHARED_SECRET (32–128 caracteres ASCII alfanuméricos, guion o guion bajo), configurado directamente en AWS y Supabase. Nunca incluir valores reales en el repositorio, frontend o chat. Las peticiones HTTP requieren POST y HMAC-SHA256 del texto timestamp + '.' + bytes originales del cuerpo, en x-ruta200-signature; x-ruta200-timestamp usa segundos Unix. Ventana de firma: 60 segundos. Se admite reintento dentro de esa ventana: el backend debe conservar el mismo requestId para aprovechar la idempotencia de AWS y controlar la cuota antes de firmar.

Sin clave configurada o firma válida no se llama AWS. CORS no está habilitado: las peticiones provienen del backend, no del navegador.

Contrato de cuerpo firmado: create requiere action=create, userId UUID y requestId UUID. result requiere action=result, userId UUID y sessionId UUID. El resultado solo incluye status y confidence (nula salvo SUCCEEDED). El backend de Supabase debe decidir su umbral, guardar la aprobación y exigirla al reservar. El navegador no es una fuente fiable del resultado.

Desde la consola, el evento {"accion":"probar_configuracion"} informa región y presencia de la clave, sin crear sesiones ni consultar AWS. El evento antiguo probar_conexion deja de ser válido con esta versión.

## Pendientes para completar teléfono → selfie → reserva

- Backend y migraciones Supabase ya aplicados y comprobados: 21 pruebas locales y pruebas SQL reales con fixtures y ROLLBACK; permisos privados, propietario, idempotencia, cuota, caducidad y aprobación. Petición real sin sesión al endpoint desplegado rechazada con HTTP 401.
- El titular guardó LIVENESS_SHARED_SECRET en AWS y Supabase y eligió conservar la clave actual. Su valor no se incluye en archivos, registros ni código.
- Pendiente URL de Lambda y prueba firmada real entre servicios.
- Credenciales temporales limitadas a StartFaceLivenessSession para el componente oficial FaceLivenessDetector; nunca entregar credenciales del rol servidor al navegador.
- Pantallas separadas: SMS, consentimiento/prueba de presencia y reserva. Una sesión con presencia aprobada debe entrar directo a reservar.
- Activación de la exigencia de presencia solo tras probar todo el recorrido real; no modificar la web publicada mientras falten los componentes anteriores.

Fuentes: https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness-programming-api.html y https://ui.docs.amplify.aws/react/connected-components/liveness .
