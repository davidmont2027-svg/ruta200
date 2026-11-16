create or replace function public.r200_ticket_interno(p_id bigint) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('vehiculo_id',h.vehiculo_id,'folio',r.folio,'estado',r.estado,'pasajero',r.nombre_pasajero,'telefono',r.telefono_pasajero,'asientos',r.asientos,'total',r.asientos*250,'origen',h.origen,'destino',h.destino,'fecha',h.fecha,'hora',to_char(h.hora_salida,'HH24:MI'),'salida',public.r200_salida(h.fecha,h.hora_salida,h.origen),'cancelable_hasta',public.r200_salida(h.fecha,h.hora_salida,h.origen)-interval '30 minutes','vehiculo',concat_ws(' ',v.marca,v.modelo,v.anio,v.color),'creada',r.created_at,'cancelada',r.cancelada_at)
 from public.reservaciones r join public.horarios h on h.id=r.horario_id join public.vehiculos v on v.id=h.vehiculo_id where r.id=p_id;
$$;
notify pgrst,'reload schema';
