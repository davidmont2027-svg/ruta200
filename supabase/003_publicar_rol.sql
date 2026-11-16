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
