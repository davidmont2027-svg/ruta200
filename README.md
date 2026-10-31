# RUTA 200 — Juntos en el camino

Aplicación privada de reservaciones para seis vehículos de la ruta Tepic ↔ Mezcales.

## Estado
Proyecto creado. **No está publicado, no recibe reservas reales ni procesa pagos.**

## Reglas acordadas
- 6 vehículos de propietarios diferentes; 4 asientos por salida.
- 4 tramos por vehículo al día (2 viajes redondos), 24 salidas y 96 lugares diarios en total.
- $250 MXN por asiento y tramo.
- Primera salida desde Tepic de los carros 1–6: 04:00, 05:00, 06:00, 07:00, 08:00 y 09:00, respectivamente.
- Cada tramo dura 2 h 30 min; 40 min entre tramos.
- Mostrar horas locales correctamente: Mezcales va una hora adelante de Tepic.
- Reservación sin contraseña para el pasajero, con nombre y WhatsApp verificado.
- Pago al abordar primero; pagos en línea por propietario más adelante, sujetos a validación del proveedor.
- Panel privado de cada conductor y panel general exclusivo del administrador.
- Imagen de marca: negro y dorado, logotipo «RUTA 200», lema «Juntos en el camino», fotografía original de la tarjeta.
- Pruebas internas antes de abrir al público.

## Próximos pasos
1. Crear interfaz web móvil y alojarla en entorno privado de pruebas.
2. Conectar base de datos y autenticación segura.
3. Evitar sobreventa con operación atómica al reservar asientos.
4. Probar dos teléfonos con una reserva compartida y cancelación.
5. Revisar permisos, seguro y seguridad de las jornadas antes del lanzamiento.

**Nunca incluir contraseñas, llaves privadas ni datos de pasajeros en este repositorio.**
