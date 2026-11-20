alter table public.horarios add column cancelado_at timestamptz, add column cancelado_por uuid, add column motivo_cancelacion text check(length(motivo_cancelacion)<=240);
alter table public.reservaciones add column cancelada_por uuid, add column motivo_cancelacion text check(length(motivo_cancelacion)<=240);

create function public.r200_cancelar_viaje(p_horario bigint,p_motivo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.horarios; n integer;
begin
 if auth.uid() is null or not public.r200_operador(p_horario) then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 if p_motivo is null or length(btrim(p_motivo)) not between 3 and 240 then raise exception 'Escribe un motivo de 3 a 240 caracteres';end if;
 select * into h from public.horarios where id=p_horario for update;
 if not found then raise exception 'Viaje no encontrado';end if;
 if h.cancelado_at is not null then return jsonb_build_object('cancelado',true,'reservas_canceladas',0,'ya_cancelado',true);end if;
 if public.r200_salida(h.fecha,h.hora_salida,h.origen)<=clock_timestamp() then raise exception 'Solo puedes cancelar viajes antes de su salida';end if;
 update public.horarios set activo=false,cancelado_at=clock_timestamp(),cancelado_por=auth.uid(),motivo_cancelacion=btrim(p_motivo) where id=h.id;
 update public.reservaciones set estado='cancelada',cancelada_at=clock_timestamp(),cancelada_por=auth.uid(),motivo_cancelacion='Viaje cancelado: '||left(btrim(p_motivo),224) where horario_id=h.id and estado='confirmada';
 get diagnostics n=row_count;
 return jsonb_build_object('cancelado',true,'reservas_canceladas',n,'ya_cancelado',false);
end $$;

create function public.r200_cancelar_reserva_conductor(p_reservacion bigint,p_motivo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reservaciones; h public.horarios; viaje bigint;
begin
 if auth.uid() is null then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 select horario_id into viaje from public.reservaciones where id=p_reservacion;
 if viaje is null or not public.r200_operador(viaje) then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 if p_motivo is null or length(btrim(p_motivo)) not between 3 and 240 then raise exception 'Escribe un motivo de 3 a 240 caracteres';end if;
 select * into h from public.horarios where id=viaje for update;
 select * into r from public.reservaciones where id=p_reservacion for update;
 if r.estado='cancelada' then return public.r200_ticket_interno(r.id);end if;
 if r.estado<>'confirmada' then raise exception 'Solo puedes cancelar reservaciones confirmadas';end if;
 if public.r200_salida(h.fecha,h.hora_salida,h.origen)<=clock_timestamp() then raise exception 'Solo puedes cancelar reservaciones antes de la salida';end if;
 update public.reservaciones set estado='cancelada',cancelada_at=clock_timestamp(),cancelada_por=auth.uid(),motivo_cancelacion=btrim(p_motivo) where id=r.id;
 return public.r200_ticket_interno(r.id);
end $$;
revoke all on function public.r200_cancelar_viaje(bigint,text),public.r200_cancelar_reserva_conductor(bigint,text) from public,anon,authenticated;
grant execute on function public.r200_cancelar_viaje(bigint,text),public.r200_cancelar_reserva_conductor(bigint,text) to authenticated;
CREATE OR REPLACE FUNCTION public.r200_ticket_interno(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('viaje_cancelado',h.cancelado_at is not null,'motivo_cancelacion',r.motivo_cancelacion,'cancelada_por_conductor',r.cancelada_por is not null,'conductor',c.nombre,'vehiculo_id',h.vehiculo_id,'folio',r.folio,'estado',r.estado,'pasajero',r.nombre_pasajero,'telefono',r.telefono_pasajero,'asientos',r.asientos,'total',r.asientos*250,'origen',h.origen,'destino',h.destino,'fecha',h.fecha,'punto_encuentro',h.punto_encuentro,'hora',to_char(h.hora_salida,'HH24:MI'),'salida',public.r200_salida(h.fecha,h.hora_salida,h.origen),'cancelable_hasta',public.r200_salida(h.fecha,h.hora_salida,h.origen)-interval '30 minutes','vehiculo',concat_ws(' ',v.marca,v.modelo,v.anio,v.color),'creada',r.created_at,'cancelada',r.cancelada_at)
 from public.reservaciones r join public.horarios h on h.id=r.horario_id join public.vehiculos v on v.id=h.vehiculo_id left join public.conductores c on c.id=h.conductor_id where r.id=p_id;
$function$;


CREATE OR REPLACE FUNCTION public.r200_panel()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if r200_privado.operador_en_mantenimiento() then raise exception using errcode='42501',message='Aplicación en mantenimiento. Intenta más tarde.'; end if;
 if auth.uid() is null or not (public.es_administrador() or exists(select 1 from public.conductores where usuario_id=auth.uid() and activo)) then raise exception 'Acceso no autorizado'; end if;
 return jsonb_build_object('administrador',public.es_administrador(),'mis_conductores',(select coalesce(jsonb_agg(id),'[]'::jsonb) from public.conductores where usuario_id=auth.uid() and activo),
 'vehiculos',case when public.es_administrador() then (select coalesce(jsonb_agg(v),'[]') from public.vehiculos v) else (select coalesce(jsonb_agg(v),'[]') from public.vehiculos v where exists(select 1 from public.conductores c where c.usuario_id=auth.uid() and c.activo and c.vehiculo_id=v.id)) end,
 'conductores',case when public.es_administrador() then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'vehiculo_id',vehiculo_id)),'[]') from public.conductores where activo) else (select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'vehiculo_id',vehiculo_id)),'[]') from public.conductores where activo and usuario_id=auth.uid()) end,
 'horarios',(select coalesce(jsonb_agg(x order by x.fecha desc,x.hora_salida),'[]') from (select h.*,(select c.nombre from public.conductores c where c.id=h.conductor_id) conductor_nombre,(select concat_ws(' ',v.marca,v.modelo,v.anio,v.color) from public.vehiculos v where v.id=h.vehiculo_id) vehiculo_nombre from public.horarios h where public.r200_operador(h.id) order by h.fecha desc limit 200)x),
 'reservaciones',(select coalesce(jsonb_agg(x order by x.id desc),'[]') from (select r.id,r.horario_id,r.nombre_pasajero,r.telefono_pasajero,r.asientos,r.estado,r.folio,r.motivo_cancelacion,r.cancelada_por from public.reservaciones r where public.r200_operador(r.horario_id) order by r.id desc limit 500)x),
 'pasajeros',(select coalesce(jsonb_agg(x),'[]') from (select p.telefono,p.nombre,p.ausencias,p.suspendido,p.motivo_suspension from public.pasajeros p order by p.created_at desc limit 500)x),
 'historial',(select coalesce(jsonb_agg(x),'[]') from (select a.reservacion_id,a.telefono_pasajero,a.fecha_registro,a.motivo,a.anulada_at from public.historial_ausencias a order by a.fecha_registro desc limit 500)x));
end;
$function$;


CREATE OR REPLACE FUNCTION public.r200_pasajeros_salida(p_horario bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if r200_privado.operador_en_mantenimiento() then raise exception using errcode='42501',message='Aplicación en mantenimiento. Intenta más tarde.'; end if;
 if auth.uid() is null or not public.r200_operador(p_horario) then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 if not exists(select 1 from public.horarios where id=p_horario) then raise exception 'La salida no está disponible'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'nombre',r.nombre_pasajero,'telefono',r.telefono_pasajero,'asientos',r.asientos,'estado',r.estado) order by r.created_at,r.id),'[]'::jsonb)
 from public.reservaciones r where r.horario_id=p_horario and r.estado in ('confirmada','ausente'));
end;
$function$;


CREATE OR REPLACE FUNCTION public.r200_cancelar(p_clave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.reservaciones; h public.horarios;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' then raise exception 'Enlace de boleto inválido'; end if;
 select * into r from public.reservaciones where clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') ;
 if not found then raise exception 'Boleto no encontrado'; end if;

 select * into h from public.horarios where id=r.horario_id for update;
 select * into r from public.reservaciones where id=r.id for update;
 if r.estado='cancelada' then return public.r200_ticket_interno(r.id);end if;
 if r.estado<>'confirmada' or clock_timestamp()>public.r200_salida(h.fecha,h.hora_salida,h.origen)-interval '30 minutes' then raise exception 'La cancelación se permite hasta 30 minutos antes de la salida'; end if;
 update public.reservaciones set estado='cancelada',cancelada_at=clock_timestamp() where id=r.id;
 return public.r200_ticket_interno(r.id);
end;
$function$;


CREATE OR REPLACE FUNCTION public.r200_publicar_viaje(p_conductor bigint, p_fecha date, p_hora time without time zone, p_origen text, p_asientos integer, p_encuentro text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare resultado jsonb; nuevo bigint;
begin
 if auth.uid() is null then raise exception 'Inicia sesión para publicar'; end if;
 if p_asientos is null or p_asientos not between 1 and 4 then raise exception 'Publica entre 1 y 4 asientos'; end if;
 if p_encuentro is null or length(btrim(p_encuentro)) not between 3 and 160 then raise exception 'Escribe el punto de encuentro (3 a 160 caracteres)'; end if;
 resultado:=public.r200_crear_rol(p_conductor,jsonb_build_array(jsonb_build_object('fecha',p_fecha,'hora',p_hora,'origen',p_origen)));
 nuevo:=(resultado->'ids'->>0)::bigint;
 if exists(select 1 from public.horarios where id=nuevo and cancelado_at is not null) then raise exception 'Esta salida fue cancelada. Publica otra fecha u hora';end if;
 -- Un reintento nunca restablece lugares que ya se redujeron ni cambia un viaje existente.
 if (resultado->>'creadas')::integer=1 then
  update public.horarios set cupos_totales=p_asientos,punto_encuentro=btrim(p_encuentro) where id=nuevo;
 end if;
 return jsonb_build_object('id',nuevo,'ya_publicado',(resultado->>'ya_publicadas')::integer>0);
end $function$;
