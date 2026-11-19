-- Aplicar con Supabase apply_migration: publicacion_y_asientos.
-- cupos_totales es el límite efectivo publicado; los asientos confirmados nunca se eliminan.
alter table public.horarios add column if not exists punto_encuentro text not null default '';
alter table public.horarios add constraint r200_encuentro_longitud check (length(punto_encuentro)<=160);
alter table public.horarios drop constraint horarios_cupos_totales_check;
alter table public.horarios add constraint horarios_cupos_totales_check check (cupos_totales between 0 and 20);
alter table public.horarios drop constraint r200_cupo_maximo;
alter table public.horarios add constraint r200_cupo_maximo check (cupos_totales between 0 and 4 and cupos_ocupados between 0 and cupos_totales);

create function public.r200_publicar_viaje(p_conductor bigint,p_fecha date,p_hora time,p_origen text,p_asientos integer,p_encuentro text)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare resultado jsonb; nuevo bigint;
begin
 if auth.uid() is null then raise exception 'Inicia sesión para publicar'; end if;
 if p_asientos is null or p_asientos not between 1 and 4 then raise exception 'Publica entre 1 y 4 asientos'; end if;
 if p_encuentro is null or length(btrim(p_encuentro)) not between 3 and 160 then raise exception 'Escribe el punto de encuentro (3 a 160 caracteres)'; end if;
 resultado:=public.r200_crear_rol(p_conductor,jsonb_build_array(jsonb_build_object('fecha',p_fecha,'hora',p_hora,'origen',p_origen)));
 nuevo:=(resultado->'ids'->>0)::bigint;
 -- Un reintento nunca restablece lugares que ya se redujeron ni cambia un viaje existente.
 if (resultado->>'creadas')::integer=1 then
  update public.horarios set cupos_totales=p_asientos,punto_encuentro=btrim(p_encuentro) where id=nuevo;
 end if;
 return jsonb_build_object('id',nuevo,'ya_publicado',(resultado->>'ya_publicadas')::integer>0);
end $function$;
revoke all on function public.r200_publicar_viaje(bigint,date,time,text,integer,text) from public,anon;
grant execute on function public.r200_publicar_viaje(bigint,date,time,text,integer,text) to authenticated;

create function public.r200_ajustar_disponibles(p_horario bigint,p_disponibles integer,p_ocupados_esperados integer,p_total_esperado integer)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare h public.horarios; capacidad integer;
begin
 if auth.uid() is null then raise exception 'Inicia sesión para ajustar asientos'; end if;
 if not public.r200_operador(p_horario) then raise exception 'Solo puedes ajustar tus propias salidas'; end if;
 if p_disponibles is null or p_disponibles not between 0 and 4 then raise exception 'Elige entre 0 y 4 lugares disponibles'; end if;
 select * into h from public.horarios where id=p_horario for update;
 if not found or not h.activo or public.r200_salida(h.fecha,h.hora_salida,h.origen)<=clock_timestamp() then raise exception 'Solo puedes ajustar salidas futuras y abiertas'; end if;
 if p_ocupados_esperados is null or p_total_esperado is null or h.cupos_ocupados<>p_ocupados_esperados or h.cupos_totales<>p_total_esperado then raise exception 'La disponibilidad cambió. Actualiza tu panel antes de ajustar los asientos.'; end if;
 select least(4,capacidad_pasajeros) into capacidad from public.vehiculos where id=h.vehiculo_id and activo;
 if capacidad is null or h.cupos_ocupados+p_disponibles>capacidad then raise exception 'Los asientos confirmados y disponibles no pueden superar la capacidad del carro'; end if;
 update public.horarios set cupos_totales=h.cupos_ocupados+p_disponibles where id=h.id;
 return jsonb_build_object('disponibles',p_disponibles,'confirmados',h.cupos_ocupados);
end $function$;
revoke all on function public.r200_ajustar_disponibles(bigint,integer,integer,integer) from public,anon;
grant execute on function public.r200_ajustar_disponibles(bigint,integer,integer,integer) to authenticated;

create or replace function public.r200_horarios(p_fecha date,p_origen text)
returns jsonb language sql stable security definer set search_path='' as $function$
 select coalesce(jsonb_agg(x order by x.hora,x.id),'[]'::jsonb) from (
 select h.id,h.vehiculo_id,concat_ws(' ',v.marca,v.modelo,v.anio,v.color) vehiculo,c.nombre conductor,h.origen,h.destino,h.fecha,h.punto_encuentro,to_char(h.hora_salida,'HH24:MI') hora,public.r200_salida(h.fecha,h.hora_salida,h.origen) salida,greatest(0,least(4,h.cupos_totales,v.capacidad_pasajeros)-h.cupos_ocupados) disponibles
 from public.horarios h join public.vehiculos v on v.id=h.vehiculo_id left join public.conductores c on c.id=h.conductor_id where h.activo and v.activo and h.fecha=p_fecha and h.origen=p_origen and public.r200_salida(h.fecha,h.hora_salida,h.origen)>statement_timestamp()
 )x;
$function$;

create or replace function public.r200_ticket_interno(p_id bigint)
returns jsonb language sql stable security definer set search_path='' as $function$
 select jsonb_build_object('conductor',c.nombre,'vehiculo_id',h.vehiculo_id,'folio',r.folio,'estado',r.estado,'pasajero',r.nombre_pasajero,'telefono',r.telefono_pasajero,'asientos',r.asientos,'total',r.asientos*250,'origen',h.origen,'destino',h.destino,'fecha',h.fecha,'punto_encuentro',h.punto_encuentro,'hora',to_char(h.hora_salida,'HH24:MI'),'salida',public.r200_salida(h.fecha,h.hora_salida,h.origen),'cancelable_hasta',public.r200_salida(h.fecha,h.hora_salida,h.origen)-interval '30 minutes','vehiculo',concat_ws(' ',v.marca,v.modelo,v.anio,v.color),'creada',r.created_at,'cancelada',r.cancelada_at)
 from public.reservaciones r join public.horarios h on h.id=r.horario_id join public.vehiculos v on v.id=h.vehiculo_id left join public.conductores c on c.id=h.conductor_id where r.id=p_id;
$function$;
