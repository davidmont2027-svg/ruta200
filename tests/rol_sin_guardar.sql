begin;
-- Publica varias salidas en una operación; conserva horarios existentes.
create or replace function public.r200_crear_rol(p_conductor bigint,p_salidas jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.conductores; item jsonb; ids jsonb:='[]'; nuevo bigint; existentes integer:=0; creados integer:=0; pos integer:=0;
begin
 if not public.es_administrador() then raise exception 'Solo el administrador puede publicar un rol'; end if;
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
end $$;
revoke all on function public.r200_crear_rol(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.r200_crear_rol(bigint,jsonb) to authenticated;
notify pgrst,'reload schema';

create or replace function public.r200_ticket_interno(p_id bigint) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('vehiculo_id',h.vehiculo_id,'folio',r.folio,'estado',r.estado,'pasajero',r.nombre_pasajero,'telefono',r.telefono_pasajero,'asientos',r.asientos,'total',r.asientos*250,'origen',h.origen,'destino',h.destino,'fecha',h.fecha,'hora',to_char(h.hora_salida,'HH24:MI'),'salida',public.r200_salida(h.fecha,h.hora_salida,h.origen),'cancelable_hasta',public.r200_salida(h.fecha,h.hora_salida,h.origen)-interval '30 minutes','vehiculo',concat_ws(' ',v.marca,v.modelo,v.anio,v.color),'creada',r.created_at,'cancelada',r.cancelada_at)
 from public.reservaciones r join public.horarios h on h.id=r.horario_id join public.vehiculos v on v.id=h.vehiculo_id where r.id=p_id;
$$;
notify pgrst,'reload schema';

-- Ejecutar dentro de BEGIN ... ROLLBACK. No deja salidas publicadas.
do $$ declare actor uuid; resultado jsonb; plan jsonb; rechazo boolean:=false; begin
 select usuario_id into actor from public.administradores limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 plan:='[{"fecha":"2031-01-20","hora":"04:00","origen":"Tepic"},{"fecha":"2031-01-20","hora":"08:10","origen":"Mezcales"},{"fecha":"2031-01-20","hora":"10:20","origen":"Tepic"},{"fecha":"2031-01-20","hora":"14:30","origen":"Mezcales"},{"fecha":"2031-01-20","hora":"16:40","origen":"Tepic"},{"fecha":"2031-01-20","hora":"20:50","origen":"Mezcales"}]';
 resultado:=public.r200_crear_rol(1,plan);
 if (resultado->>'creadas')::integer<>6 then raise exception 'TEST: tres vueltas'; end if;
 resultado:=public.r200_crear_rol(1,plan);
 if (resultado->>'creadas')::integer<>0 or (resultado->>'ya_publicadas')::integer<>6 then raise exception 'TEST: duplicó rol'; end if;
 begin perform public.r200_crear_rol(1,'[{"fecha":"2031-01-21","hora":"04:00","origen":"Tepic"},{"fecha":"2031-01-21","hora":"05:00","origen":"Tepic"}]'); exception when others then if sqlerrm like '%Salida 2:%' then rechazo:=true; else raise; end if; end;
 if not rechazo or exists(select 1 from public.horarios where vehiculo_id=1 and fecha='2031-01-21') then raise exception 'TEST: publicación parcial'; end if;
 perform set_config('request.jwt.claim.sub','',true);rechazo:=false;
 begin perform public.r200_crear_rol(1,plan);exception when others then if sqlerrm like '%Solo el administrador%' then rechazo:=true;else raise;end if;end;
 if not rechazo or has_function_privilege('anon','public.r200_crear_rol(bigint,jsonb)','EXECUTE') then raise exception 'TEST: rol accesible a visitantes';end if;
end $$;

rollback;
select 'ROL: seis salidas, reintento sin duplicar, reversión completa ante error y permisos correctos' resultado;