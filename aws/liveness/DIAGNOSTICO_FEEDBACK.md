# Diagnóstico de confianza insuficiente

Las pruebas reales del titular terminan con AWS SUCCEEDED y se rechazan por confianza insuficiente incluso tras el ajuste inicial a80. La imagen visible y la luz aparente no permiten determinar la causa. No se vuelve a bajar el umbral sin evidencia ni se marca presencia aprobada de forma manual.

Actualización preparada: Lambda feedback-v1 filtra los siete códigos de Feedback documentados por AWS y omite mensajes libres, imágenes y metadata; Edge v4 filtra otra vez y devuelve indicaciones solo al propietario autenticado de la sesión y únicamente si no quedó aprobada. El cliente muestra orientación en español. Los códigos se usan para orientación y nunca para conceder aprobación. Si AWS no entrega Feedback se conserva el mensaje genérico.

SDK @aws-sdk/client-rekognition3.1169.0 fijado y empaquetado con esbuild0.28.2, sin depender de la versión del SDK incluida en el runtime Lambda. Build: npm ci --ignore-scripts y npm run build dentro de aws/liveness; comprimir dist/index.mjs e index.mjs.LEGAL.txt en raíz del ZIP. Artifact entregable ruta200-liveness-diagnostico.zip (152154bytes), sin secretos. Mantiene index.handler, región us-east-1, HMAC, firma60s y permisos existentes. probar_configuracion informa version=feedback-v1 y llamadas_aws=0.

Validación:24pruebas Edge/Lambda, cliente con feedback desconocido y ausencia de aprobación, y prueba del bundle Node con firma/feedback simulado aprobadas. Ninguna prueba local llama AWS. Pendiente que el titular cargue el nuevo ZIP en ruta200-liveness y envíe captura; la actualización AWS aún NO está aplicada. Edge v4 y cliente compatibles con Lambda anterior. Después se comprobará versión y una sola prueba real; queda un intento ordinario disponible según el último registro, sin reintegrarlo aún.

Fuente: https://docs.aws.amazon.com/rekognition/latest/APIReference/API_FeedbackItem.html . No confundir ejemplo LOW_VIDEO_QUALITY_DETECTED de los tests con un diagnóstico del teléfono del titular: todavía no se ha observado un código de feedback real.
