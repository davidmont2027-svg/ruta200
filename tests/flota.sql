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
