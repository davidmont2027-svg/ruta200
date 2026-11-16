CREATE OR REPLACE FUNCTION public.r200_crear_horario(p_vehiculo bigint, p_conductor bigint, p_fecha date, p_hora time without time zone, p_origen text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare nuevo bigint; salida timestamptz;
begin
 if auth.uid() is null or not (public.es_administrador() or exists(select 1 from public.conductores c where c.id=p_conductor and c.usuario_id=auth.uid() and c.activo and c.vehiculo_id=p_vehiculo)) then raise exception 'Solo puedes publicar salidas de tu propio vehículo'; end if;
 if p_origen is null or p_origen not in ('Tepic','Mezcales') then raise exception 'Origen inválido'; end if;
 salida:=public.r200_salida(p_fecha,p_hora,p_origen);
 if salida is null or salida<=clock_timestamp() then raise exception 'Selecciona fecha y hora futuras'; end if;
 perform 1 from public.vehiculos where id=p_vehiculo and activo and capacidad_pasajeros=4 for update;
 if not found then raise exception 'Vehículo inválido'; end if;
 if not exists(select 1 from public.conductores where id=p_conductor and activo and vehiculo_id=p_vehiculo) then raise exception 'El conductor no corresponde al vehículo'; end if;
 if exists(select 1 from public.horarios where activo and vehiculo_id=p_vehiculo and abs(extract(epoch from public.r200_salida(fecha,hora_salida,origen)-salida))<11400) then raise exception 'El vehículo necesita 2 h 30 de viaje y 40 minutos de margen entre salidas'; end if;
 insert into public.horarios(vehiculo_id,conductor_id,origen,destino,fecha,hora_salida,cupos_totales,activo) values(p_vehiculo,p_conductor,p_origen,case when p_origen='Tepic' then 'Mezcales' else 'Tepic' end,p_fecha,p_hora,4,true) returning id into nuevo;
 return nuevo;
end;
$function$;


CREATE OR REPLACE FUNCTION public.r200_crear_rol(p_conductor bigint, p_salidas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.conductores; item jsonb; ids jsonb:='[]'; nuevo bigint; existentes integer:=0; creados integer:=0; pos integer:=0;
begin
 if auth.uid() is null or not (public.es_administrador() or exists(select 1 from public.conductores owner_driver where owner_driver.id=p_conductor and owner_driver.usuario_id=auth.uid() and owner_driver.activo)) then raise exception 'Solo puedes publicar tu propio rol de salidas'; end if;
 if p_salidas is null or jsonb_typeof(p_salidas)<>'array' then raise exception 'Agrega las salidas del rol'; end if;
 if jsonb_array_length(p_salidas) not between 1 and 100 then raise exception 'Publica de 1 a 100 salidas por operación'; end if;
 select * into c from public.conductores where id=p_conductor and activo;
 if not found or c.vehiculo_id is null then raise exception 'Selecciona un conductor con vehículo'; end if;
 perform 1 from public.vehiculos where id=c.vehiculo_id and activo for update;
 if not found then raise exception 'Vehículo inactivo'; end if;
 for item in select value from jsonb_array_elements(p_salidas) loop
  pos:=pos+1;
  if item->>'origen' is null or item->>'origen' not in ('Tepic','Mezcales') or item->>'fecha' is null or item->>'hora' is null then raise exception 'Revisa la salida % del rol',pos; end if;
  -- Evita duplicar viajes si el usuario reintenta tras perder la respuesta de red.
  select id into nuevo from public.horarios where vehiculo_id=c.vehiculo_id and conductor_id=c.id and activo and fecha=(item->>'fecha')::date and hora_salida=(item->>'hora')::time and origen=item->>'origen';
  if found then existentes:=existentes+1;
  else
   begin
    nuevo:=public.r200_crear_horario(c.vehiculo_id,c.id,(item->>'fecha')::date,(item->>'hora')::time,item->>'origen');
   exception when others then raise exception 'Salida %: %',pos,sqlerrm;
   end;
   creados:=creados+1;
  end if;
  ids:=ids||jsonb_build_array(nuevo);
 end loop;
 return jsonb_build_object('ids',ids,'creadas',creados,'ya_publicadas',existentes);
end $function$;


CREATE OR REPLACE FUNCTION public.r200_panel()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not (public.es_administrador() or exists(select 1 from public.conductores where usuario_id=auth.uid() and activo)) then raise exception 'Acceso no autorizado'; end if;
 return jsonb_build_object('administrador',public.es_administrador(),
 'vehiculos',case when public.es_administrador() then (select coalesce(jsonb_agg(v),'[]') from public.vehiculos v) else (select coalesce(jsonb_agg(v),'[]') from public.vehiculos v where exists(select 1 from public.conductores c where c.usuario_id=auth.uid() and c.activo and c.vehiculo_id=v.id)) end,
 'conductores',case when public.es_administrador() then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'vehiculo_id',vehiculo_id)),'[]') from public.conductores where activo) else (select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'vehiculo_id',vehiculo_id)),'[]') from public.conductores where activo and usuario_id=auth.uid()) end,
 'horarios',(select coalesce(jsonb_agg(x order by x.fecha desc,x.hora_salida),'[]') from (select h.*,(select c.nombre from public.conductores c where c.id=h.conductor_id) conductor_nombre,(select concat_ws(' ',v.marca,v.modelo,v.anio,v.color) from public.vehiculos v where v.id=h.vehiculo_id) vehiculo_nombre from public.horarios h where public.r200_operador(h.id) order by h.fecha desc limit 200)x),
 'reservaciones',(select coalesce(jsonb_agg(x order by x.id desc),'[]') from (select r.id,r.horario_id,r.nombre_pasajero,r.telefono_pasajero,r.asientos,r.estado,r.folio from public.reservaciones r where public.r200_operador(r.horario_id) order by r.id desc limit 500)x),
 'pasajeros',(select coalesce(jsonb_agg(x),'[]') from (select p.telefono,p.nombre,p.ausencias,p.suspendido,p.motivo_suspension from public.pasajeros p order by p.created_at desc limit 500)x),
 'historial',(select coalesce(jsonb_agg(x),'[]') from (select a.reservacion_id,a.telefono_pasajero,a.fecha_registro,a.motivo,a.anulada_at from public.historial_ausencias a order by a.fecha_registro desc limit 500)x));
end;
$function$;

revoke all on function public.r200_crear_rol(bigint,jsonb), public.r200_crear_horario(bigint,bigint,date,time,text) from public,anon;
grant execute on function public.r200_crear_rol(bigint,jsonb), public.r200_crear_horario(bigint,bigint,date,time,text) to authenticated;
