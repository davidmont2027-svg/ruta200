# Backend de presencia de Ruta 200

Estado: migraciones aplicadas y Edge Function ruta200-liveness desplegada (versión 1). La web de reservas continúa exigiendo SMS; la presencia todavía no se exige.

La función valida cada Bearer token mediante GET Auth /user y exige teléfono confirmado. No usa user_metadata ni un resultado indicado por el navegador para autorizar. Los RPC de escritura son exclusivos de service_role; las operaciones privilegiadas viven en r200_privado, y las tablas tienen RLS sin acceso directo de anon/authenticated. El RPC de estado solo devuelve la situación del usuario autenticado. SECURITY DEFINER se limita a los helpers privados porque service_role no tiene SELECT sobre auth.users.

Registra consentimiento r200-presencia-v1, vincula intento y SessionId AWS al usuario y teléfono, reusa intentos activos y limita a tres intentos en 24 horas y veinte consultas por intento con una separación de dos segundos. Solo aprueba SUCCEEDED con confianza >=90; es un umbral inicial pendiente de evaluación real del negocio. Una aprobación se vincula al teléfono actual y no se conserva si este cambia. No almacena imágenes ni el video.

La pasarela verify_jwt se dejó en false porque la propia función valida la sesión en Supabase Auth en todas las operaciones (salvo OPTIONS). No se utiliza un JWT decodificado sin verificar. Usa las claves nuevas de los mapas de entorno SUPABASE_PUBLISHABLE_KEYS y SUPABASE_SECRET_KEYS, con compatibilidad para las claves legacy; ninguna sale al navegador.

Necesita LIVENESS_SHARED_SECRET y LIVENESS_LAMBDA_URL. La primera fue guardada directamente por el titular, que eligió conservar su clave actual. Nunca se copia su valor a archivos o registros. La segunda aún falta. La URL debe ser HTTPS de Lambda us-east-1, sin query, credenciales, fragmento o ruta adicional. Las peticiones se firman con HMAC-SHA256 y no siguen redirecciones. Si falta configuración, start/result devuelve 503 antes de consumir cuota.

Validación: 21 pruebas locales (14 Edge + 7 Lambda) con AWS/API simulados y compatibilidad HMAC; pruebas SQL reales con ROLLBACK para permisos, teléfono sin confirmar con metadata falsificada, dueño, doble toque, SessionId inmutable, consultas, expiración, confianza insuficiente, aprobación y cuota. Usuarios e intentos sintéticos revertidos. La función de reservas no se alteró.

Pendiente: confirmar una petición real al endpoint desplegado, URL de AWS y comprobación HMAC real, credenciales temporales limitadas a StartFaceLivenessSession, componente oficial de cámara, pantallas teléfono → selfie → reserva y prueba real completa. Las reservas no deben exigir presencia hasta completar la integración.

Los avisos de RLS sin políticas son intencionales en estas tablas privadas: no hay permisos para anon/authenticated. Los helpers privados verifican rol del servidor o auth.uid() para estado propio. Los avisos de otros RPC/índices/políticas previos se mantienen fuera de este cambio.
