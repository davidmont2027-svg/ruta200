rollback;
begin;
-- Añade nombres de conductor y descripción del carro; conserva permisos existentes.
create or replace function public.r200_horarios(p_fecha date,p_origen text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x order by x.hora,x.id),'[]'::jsonb) from (
 select h.id,h.vehiculo_id,concat_ws(' ',v.marca,v.modelo,v.anio,v.color) vehiculo,c.nombre conductor,h.origen,h.destino,h.fecha,to_char(h.hora_salida,'HH24:MI') hora,public.r200_salida(h.fecha,h.hora_salida,h.origen) salida,greatest(0,least(4,h.cupos_totales,v.capacidad_pasajeros)-h.cupos_ocupados) disponibles
 from public.horarios h join public.vehiculos v on v.id=h.vehiculo_id left join public.conductores c on c.id=h.conductor_id where h.activo and v.activo and h.fecha=p_fecha and h.origen=p_origen and public.r200_salida(h.fecha,h.hora_salida,h.origen)>statement_timestamp()
 )x;
$$;

create or replace function public.r200_ticket_interno(p_id bigint) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('conductor',c.nombre,'vehiculo_id',h.vehiculo_id,'folio',r.folio,'estado',r.estado,'pasajero',r.nombre_pasajero,'telefono',r.telefono_pasajero,'asientos',r.asientos,'total',r.asientos*250,'origen',h.origen,'destino',h.destino,'fecha',h.fecha,'hora',to_char(h.hora_salida,'HH24:MI'),'salida',public.r200_salida(h.fecha,h.hora_salida,h.origen),'cancelable_hasta',public.r200_salida(h.fecha,h.hora_salida,h.origen)-interval '30 minutes','vehiculo',concat_ws(' ',v.marca,v.modelo,v.anio,v.color),'creada',r.created_at,'cancelada',r.cancelada_at)
 from public.reservaciones r join public.horarios h on h.id=r.horario_id join public.vehiculos v on v.id=h.vehiculo_id left join public.conductores c on c.id=h.conductor_id where r.id=p_id;
$$;

create or replace function public.r200_panel() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not (public.es_administrador() or exists(select 1 from public.conductores where usuario_id=auth.uid() and activo)) then raise exception 'Acceso no autorizado'; end if;
 return jsonb_build_object('administrador',public.es_administrador(),
 'vehiculos',case when public.es_administrador() then (select coalesce(jsonb_agg(v),'[]') from public.vehiculos v) else '[]'::jsonb end,
 'conductores',case when public.es_administrador() then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'vehiculo_id',vehiculo_id)),'[]') from public.conductores where activo) else '[]'::jsonb end,
 'horarios',(select coalesce(jsonb_agg(x order by x.fecha desc,x.hora_salida),'[]') from (select h.*,(select c.nombre from public.conductores c where c.id=h.conductor_id) conductor_nombre,(select concat_ws(' ',v.marca,v.modelo,v.anio,v.color) from public.vehiculos v where v.id=h.vehiculo_id) vehiculo_nombre from public.horarios h where public.r200_operador(h.id) order by h.fecha desc limit 200)x),
 'reservaciones',(select coalesce(jsonb_agg(x order by x.id desc),'[]') from (select r.id,r.horario_id,r.nombre_pasajero,r.telefono_pasajero,r.asientos,r.estado,r.folio from public.reservaciones r where public.r200_operador(r.horario_id) order by r.id desc limit 500)x),
 'pasajeros',(select coalesce(jsonb_agg(x),'[]') from (select p.telefono,p.nombre,p.ausencias,p.suspendido,p.motivo_suspension from public.pasajeros p order by p.created_at desc limit 500)x),
 'historial',(select coalesce(jsonb_agg(x),'[]') from (select a.reservacion_id,a.telefono_pasajero,a.fecha_registro,a.motivo,a.anulada_at from public.historial_ausencias a order by a.fecha_registro desc limit 500)x));
end;
$$;
notify pgrst,'reload schema';

-- Ejecutar en una transacción que se revierta; conserva todas las salidas reales.
do $$ declare v record; h bigint; r bigint; ticket jsonb; lista jsonb; fila jsonb; panel jsonb; actor uuid;
begin
 select usuario_id into actor from public.administradores limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 for v in select w.id,c.id conductor_id,c.nombre from public.vehiculos w join public.conductores c on c.vehiculo_id=w.id where w.id between 1 and 5 loop
  insert into public.horarios(vehiculo_id,conductor_id,origen,destino,fecha,hora_salida,cupos_totales,activo) values(v.id,v.conductor_id,'Tepic','Mezcales','2031-02-01','04:00',4,true) returning id into h;
  insert into public.reservaciones(horario_id,nombre_pasajero,telefono_pasajero,asientos) values(h,'PRUEBA IDENTIDAD VEHÍCULO','0000000'||lpad(v.id::text,3,'0'),1) returning id into r;
  ticket:=public.r200_ticket_interno(r);
  if (ticket->>'vehiculo_id')::bigint<>v.id or ticket->>'conductor' is distinct from v.nombre then raise exception 'TEST: conductor/foto incorrectos en boleto del vehículo %',v.id;end if;
  lista:=public.r200_horarios('2031-02-01','Tepic');
  select value into fila from jsonb_array_elements(lista) where (value->>'id')::bigint=h;
  if (fila->>'vehiculo_id')::bigint<>v.id or fila->>'conductor' is distinct from v.nombre or (fila->>'disponibles')::integer<>3 then raise exception 'TEST: conductor/foto/cupos en horario del vehículo %',v.id;end if;
  if fila ? 'telefono' or fila ? 'telefono_pasajero' or fila ? 'usuario_id' then raise exception 'TEST: datos privados en horarios públicos';end if;
  panel:=public.r200_panel();
  select value into fila from jsonb_array_elements(panel->'horarios') where (value->>'id')::bigint=h;
  if fila->>'conductor_nombre' is distinct from v.nombre then raise exception 'TEST: nombre en panel';end if;
 end loop;
end $$;

rollback;
select 'CINCO VEHÍCULOS: nombres y fotos vinculados por ID, cupos correctos y datos privados protegidos' resultado;