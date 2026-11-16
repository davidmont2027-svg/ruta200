rollback;
begin;
-- RUTA 200: migración aditiva. Ejecutar dentro de una transacción.
-- No borra tablas, pasajeros, reservas, vehículos ni horarios.
alter table public.horarios add column cupos_ocupados integer not null default 0;
update public.horarios h set cupos_ocupados=(select coalesce(sum(r.asientos),0) from public.reservaciones r where r.horario_id=h.id and r.estado='confirmada');
alter table public.horarios add constraint r200_cupo_maximo check(cupos_totales between 1 and 4 and cupos_ocupados between 0 and cupos_totales);
alter table public.vehiculos add constraint r200_capacidad_maxima check(capacidad_pasajeros between 1 and 4);
alter table public.reservaciones add column folio uuid not null default gen_random_uuid();
alter table public.reservaciones add column clave_hash text;
alter table public.reservaciones add constraint r200_folio_unico unique(folio);
alter table public.reservaciones add constraint r200_clave_unica unique(clave_hash);
create unique index r200_pasajero_por_salida on public.reservaciones(horario_id,telefono_pasajero) where estado='confirmada';
alter table public.pasajeros add column reactivado_at timestamptz;
alter table public.historial_ausencias add column anulada_at timestamptz;
alter table public.historial_ausencias add column anulada_por uuid;

create function public.r200_salida(p_fecha date,p_hora time,p_origen text) returns timestamptz
language sql immutable set search_path='' as $$
 select (p_fecha+p_hora) at time zone case when p_origen='Tepic' then 'America/Mazatlan' when p_origen='Mezcales' then 'America/Mexico_City' else null end;
$$;

create or replace function public.verificar_cupos_reserva() returns trigger
language plpgsql security definer set search_path='' as $$
declare delta integer; h public.horarios; capacidad integer;
begin
 if tg_op='UPDATE' and (new.horario_id,new.asientos,new.telefono_pasajero,new.nombre_pasajero,new.folio,new.clave_hash) is distinct from (old.horario_id,old.asientos,old.telefono_pasajero,old.nombre_pasajero,old.folio,old.clave_hash) then
  raise exception 'La reserva no se puede reasignar. Cancela y crea una nueva.';
 end if;
 delta:=case when new.estado='confirmada' then new.asientos else 0 end;
 if tg_op='UPDATE' then delta:=delta-case when old.estado='confirmada' then old.asientos else 0 end; end if;
 select * into h from public.horarios where id=new.horario_id for update;
 if not found then raise exception 'Horario inexistente'; end if;
 if delta>0 then
  select capacidad_pasajeros into capacidad from public.vehiculos where id=h.vehiculo_id and activo for share;
  if tg_op='INSERT' and (not h.activo or public.r200_salida(h.fecha,h.hora_salida,h.origen)<=clock_timestamp()) then raise exception 'Horario cerrado o inactivo'; end if;
  if capacidad is null or h.cupos_ocupados+delta>least(4,h.cupos_totales,capacidad) then raise exception 'No hay suficientes asientos disponibles'; end if;
 end if;
 if delta<>0 then update public.horarios set cupos_ocupados=cupos_ocupados+delta where id=h.id; end if;
 return new;
end;
$$;

create function public.r200_operador(p_horario bigint) returns boolean language sql stable security definer set search_path='' as $$
 select public.es_administrador() or exists(select 1 from public.horarios h join public.conductores c on c.id=h.conductor_id where h.id=p_horario and c.usuario_id=auth.uid() and c.activo);
$$;

create function public.r200_ticket_interno(p_id bigint) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('folio',r.folio,'estado',r.estado,'pasajero',r.nombre_pasajero,'telefono',r.telefono_pasajero,'asientos',r.asientos,'total',r.asientos*250,'origen',h.origen,'destino',h.destino,'fecha',h.fecha,'hora',to_char(h.hora_salida,'HH24:MI'),'salida',public.r200_salida(h.fecha,h.hora_salida,h.origen),'cancelable_hasta',public.r200_salida(h.fecha,h.hora_salida,h.origen)-interval '30 minutes','vehiculo',concat_ws(' ',v.marca,v.modelo,v.anio,v.color),'creada',r.created_at,'cancelada',r.cancelada_at)
 from public.reservaciones r join public.horarios h on h.id=r.horario_id join public.vehiculos v on v.id=h.vehiculo_id where r.id=p_id;
$$;

create function public.r200_horarios(p_fecha date,p_origen text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x order by x.hora,x.id),'[]'::jsonb) from (
 select h.id,h.origen,h.destino,h.fecha,to_char(h.hora_salida,'HH24:MI') hora,public.r200_salida(h.fecha,h.hora_salida,h.origen) salida,greatest(0,least(4,h.cupos_totales,v.capacidad_pasajeros)-h.cupos_ocupados) disponibles
 from public.horarios h join public.vehiculos v on v.id=h.vehiculo_id where h.activo and v.activo and h.fecha=p_fecha and h.origen=p_origen and public.r200_salida(h.fecha,h.hora_salida,h.origen)>statement_timestamp()
 )x;
$$;

create function public.r200_boleto(p_clave text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' then raise exception 'Enlace de boleto inválido'; end if;
 select public.r200_ticket_interno(id) into resultado from public.reservaciones where clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex');
 if resultado is null then raise exception 'Boleto no encontrado'; end if;
 return resultado;
end;
$$;

create function public.r200_reservar(p_horario bigint,p_nombre text,p_telefono text,p_asientos integer,p_clave text) returns jsonb language plpgsql security definer set search_path='' as $$
declare hash text; anterior public.reservaciones; persona public.pasajeros; reserva_id bigint;
begin
 if p_nombre is null or length(btrim(p_nombre)) not between 2 and 80 or p_telefono is null or p_telefono !~ '^[0-9]{10}$' or p_asientos is null or p_asientos not between 1 and 4 or p_clave is null or p_clave !~ '^[a-f0-9]{64}$' then raise exception 'Revisa nombre, teléfono y asientos'; end if;
 hash:=encode(sha256(convert_to(p_clave,'UTF8')),'hex');
 -- Misma clave: un doble toque o reintento de red devuelve la misma reserva.
 perform pg_advisory_xact_lock(hashtextextended(hash,0));
 select * into anterior from public.reservaciones where clave_hash=hash;
 if found then
  if (anterior.horario_id,anterior.nombre_pasajero,anterior.telefono_pasajero,anterior.asientos) is distinct from (p_horario,btrim(p_nombre),p_telefono,p_asientos) then raise exception 'La solicitud ya fue utilizada con otros datos'; end if;
  return public.r200_ticket_interno(anterior.id);
 end if;
 insert into public.pasajeros(nombre,telefono) values(btrim(p_nombre),p_telefono) on conflict(telefono) do nothing;
 select * into persona from public.pasajeros where telefono=p_telefono for update;
 if persona.suspendido or persona.ausencias>=3 then raise exception 'Número suspendido. Contacta a atención al cliente para solicitar revisión.'; end if;
 if exists(select 1 from public.reservaciones where horario_id=p_horario and telefono_pasajero=p_telefono and estado='confirmada') then raise exception 'Este número ya tiene una reserva en esa salida'; end if;
 insert into public.reservaciones(horario_id,nombre_pasajero,telefono_pasajero,asientos,clave_hash) values(p_horario,btrim(p_nombre),p_telefono,p_asientos,hash) returning id into reserva_id;
 return public.r200_ticket_interno(reserva_id);
end;
$$;

create function public.r200_cancelar(p_clave text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reservaciones; h public.horarios;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' then raise exception 'Enlace de boleto inválido'; end if;
 select * into r from public.reservaciones where clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') for update;
 if not found then raise exception 'Boleto no encontrado'; end if;
 if r.estado='cancelada' then return public.r200_ticket_interno(r.id); end if;
 select * into h from public.horarios where id=r.horario_id for update;
 if r.estado<>'confirmada' or clock_timestamp()>public.r200_salida(h.fecha,h.hora_salida,h.origen)-interval '30 minutes' then raise exception 'La cancelación se permite hasta 30 minutos antes de la salida'; end if;
 update public.reservaciones set estado='cancelada',cancelada_at=clock_timestamp() where id=r.id;
 return public.r200_ticket_interno(r.id);
end;
$$;

create function public.r200_ausencia(p_reservacion bigint,p_ausente boolean,p_motivo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reservaciones; h public.horarios; n integer; persona public.pasajeros;
begin
 if auth.uid() is null or p_ausente is null or length(btrim(coalesce(p_motivo,''))) not between 3 and 300 then raise exception 'Escribe el motivo de la incidencia'; end if;
 select * into r from public.reservaciones where id=p_reservacion;
 if not found or not public.r200_operador(r.horario_id) then raise exception 'Acceso no autorizado'; end if;
 -- Mismo orden de bloqueo que reservar: pasajero, reserva y horario.
 select * into persona from public.pasajeros where telefono=r.telefono_pasajero for update;
 select * into r from public.reservaciones where id=p_reservacion for update;
 select * into h from public.horarios where id=r.horario_id for update;
 if public.r200_salida(h.fecha,h.hora_salida,h.origen)>clock_timestamp() then raise exception 'No puedes registrar una ausencia antes de la salida'; end if;
 if p_ausente then
  if r.estado='cancelada' then raise exception 'Una cancelación a tiempo no es una ausencia'; end if;
  if r.estado<>'ausente' then
   insert into public.historial_ausencias(reservacion_id,telefono_pasajero,motivo,registrado_por) values(r.id,r.telefono_pasajero,btrim(p_motivo),auth.uid()::text)
   on conflict(reservacion_id) do update set motivo=excluded.motivo,registrado_por=excluded.registrado_por,fecha_registro=clock_timestamp(),anulada_at=null,anulada_por=null;
   update public.reservaciones set estado='ausente' where id=r.id;
  end if;
 else
  if not public.es_administrador() then raise exception 'Solo el administrador puede corregir una ausencia'; end if;
  if r.estado='ausente' then
   update public.historial_ausencias set anulada_at=clock_timestamp(),anulada_por=auth.uid(),motivo=coalesce(motivo,'')||' | Corrección: '||btrim(p_motivo) where reservacion_id=r.id;
   update public.reservaciones set estado='confirmada' where id=r.id;
  end if;
 end if;
 select count(*) into n from public.historial_ausencias where telefono_pasajero=r.telefono_pasajero and anulada_at is null and (persona.reactivado_at is null or fecha_registro>persona.reactivado_at);
 -- Corregir una incidencia no reactiva automáticamente un número suspendido.
 update public.pasajeros set ausencias=n,suspendido=suspendido or n>=3,motivo_suspension=case when n>=3 then 'Tres ausencias sin cancelar. Contactar a atención al cliente.' else motivo_suspension end where telefono=r.telefono_pasajero;
 return jsonb_build_object('ausencias',n,'suspendido',(select suspendido from public.pasajeros where telefono=r.telefono_pasajero));
end;
$$;

create function public.r200_reactivar(p_telefono text,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.es_administrador() then raise exception 'Solo el administrador puede reactivar'; end if;
 if length(btrim(coalesce(p_motivo,''))) not between 3 and 300 then raise exception 'Escribe el motivo de la segunda oportunidad'; end if;
 update public.pasajeros set suspendido=false,ausencias=0,reactivado_at=clock_timestamp(),motivo_suspension='Reactivado: '||btrim(p_motivo) where telefono=p_telefono;
 if not found then raise exception 'Pasajero no encontrado'; end if;
end;
$$;

create function public.r200_panel() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not (public.es_administrador() or exists(select 1 from public.conductores where usuario_id=auth.uid() and activo)) then raise exception 'Acceso no autorizado'; end if;
 return jsonb_build_object('administrador',public.es_administrador(),
 'vehiculos',case when public.es_administrador() then (select coalesce(jsonb_agg(v),'[]') from public.vehiculos v) else '[]'::jsonb end,
 'conductores',case when public.es_administrador() then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'vehiculo_id',vehiculo_id)),'[]') from public.conductores where activo) else '[]'::jsonb end,
 'horarios',(select coalesce(jsonb_agg(x order by x.fecha desc,x.hora_salida),'[]') from (select h.* from public.horarios h where public.r200_operador(h.id) order by h.fecha desc limit 200)x),
 'reservaciones',(select coalesce(jsonb_agg(x order by x.id desc),'[]') from (select r.id,r.horario_id,r.nombre_pasajero,r.telefono_pasajero,r.asientos,r.estado,r.folio from public.reservaciones r where public.r200_operador(r.horario_id) order by r.id desc limit 500)x),
 'pasajeros',(select coalesce(jsonb_agg(x),'[]') from (select p.telefono,p.nombre,p.ausencias,p.suspendido,p.motivo_suspension from public.pasajeros p order by p.created_at desc limit 500)x),
 'historial',(select coalesce(jsonb_agg(x),'[]') from (select a.reservacion_id,a.telefono_pasajero,a.fecha_registro,a.motivo,a.anulada_at from public.historial_ausencias a order by a.fecha_registro desc limit 500)x));
end;
$$;

create function public.r200_crear_horario(p_vehiculo bigint,p_conductor bigint,p_fecha date,p_hora time,p_origen text) returns bigint language plpgsql security definer set search_path='' as $$
declare nuevo bigint; salida timestamptz;
begin
 if not public.es_administrador() then raise exception 'Solo el administrador puede crear salidas'; end if;
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
$$;

create function public.r200_cerrar_horario(p_horario bigint) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.es_administrador() then raise exception 'Solo el administrador puede cerrar salidas'; end if;
 update public.horarios set activo=false where id=p_horario;
end;
$$;

-- Ninguna función nueva será pública hasta la activación explícita.
do $$ declare f record; begin
 for f in select p.oid::regprocedure firma from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'r200_%'
 loop execute format('revoke all on function %s from public,anon,authenticated',f.firma); end loop;
end $$;
revoke all on function public.verificar_cupos_reserva() from public,anon,authenticated;
revoke insert,update,delete on public.horarios,public.vehiculos from anon,authenticated;
revoke all on public.reservaciones,public.pasajeros,public.historial_ausencias from anon,authenticated;

-- Ejecutar DESPUÉS de 001, DENTRO de BEGIN ... ROLLBACK. No conserva datos de prueba.
do $$
declare h bigint; h2 bigint; h3 bigint; h4 bigint; rid bigint; r jsonb; original jsonb; n integer; actor uuid; v_tel text:='0000000001'; clave text:=repeat('a',64); rechazo boolean;
begin
 select usuario_id into actor from public.administradores limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 if (public.r200_panel()->>'administrador')::boolean is distinct from true then raise exception 'TEST: panel administrador'; end if;
 h4:=public.r200_crear_horario(1,1,current_date+8,'08:00','Tepic');
 rechazo:=false; begin perform public.r200_crear_horario(1,1,current_date+8,'09:00','Tepic'); exception when others then if sqlerrm like '%40 minutos%' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: horarios superpuestos'; end if;
 perform public.r200_cerrar_horario(h4);
 rechazo:=false; begin perform public.r200_reservar(h4,'Prueba cerrado','0000000009',1,repeat('9',64)); exception when others then if sqlerrm like '%inactivo%' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: horario cerrado aceptó reserva'; end if;
 rechazo:=false; begin perform public.r200_reservar(h4,'Prueba cinco','0000000009',5,repeat('8',64)); exception when others then if sqlerrm like '%Revisa nombre%' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: cinco asientos'; end if;
 insert into public.horarios(vehiculo_id,conductor_id,origen,destino,fecha,hora_salida,cupos_totales) values(1,1,'Tepic','Mezcales',current_date+3,'08:00',4) returning id into h;
 r:=public.r200_reservar(h,'Prueba RUTA 200',v_tel,3,clave); original:=r;
 if r->>'estado'<>'confirmada' or (r->>'total')::integer<>750 then raise exception 'TEST: confirmación/total'; end if;
 if public.r200_reservar(h,'Prueba RUTA 200',v_tel,3,clave)<>original then raise exception 'TEST: idempotencia'; end if;
 if public.r200_boleto(clave)<>original then raise exception 'TEST: recuperación boleto'; end if;
 rechazo:=false;
 begin perform public.r200_reservar(h,'Otra persona','0000000002',2,repeat('b',64)); exception when others then if sqlerrm like '%asientos disponibles%' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: sobreventa permitida'; end if;
 perform public.r200_reservar(h,'Otra persona','0000000002',1,repeat('b',64));
 select cupos_ocupados into n from public.horarios where id=h; if n<>4 then raise exception 'TEST: cupos esperados 4'; end if;
 r:=public.r200_cancelar(clave); if r->>'estado'<>'cancelada' then raise exception 'TEST: cancelación'; end if;
 perform public.r200_cancelar(clave);
 select cupos_ocupados into n from public.horarios where id=h; if n<>1 then raise exception 'TEST: cancelación debe liberar exactamente 3'; end if;
 if exists(select 1 from public.historial_ausencias where telefono_pasajero=v_tel) then raise exception 'TEST: cancelación contó ausencia'; end if;
 perform public.r200_reservar(h,'Prueba RUTA 200',v_tel,3,repeat('c',64));
 rechazo:=false; begin perform public.r200_boleto(repeat('f',64)); exception when others then if sqlerrm='Boleto no encontrado' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: boleto sin clave'; end if;
 -- Cancelación tardía: crea a futuro, mueve la salida a 20 minutos desde ahora.
 insert into public.horarios(vehiculo_id,conductor_id,origen,destino,fecha,hora_salida,cupos_totales) values(1,1,'Tepic','Mezcales',current_date+3,'12:00',4) returning id into h2;
 perform public.r200_reservar(h2,'Prueba tardía','0000000003',1,repeat('d',64));
 update public.horarios set fecha=((clock_timestamp()+interval '20 minutes') at time zone 'America/Mazatlan')::date,hora_salida=((clock_timestamp()+interval '20 minutes') at time zone 'America/Mazatlan')::time where id=h2;
 rechazo:=false; begin perform public.r200_cancelar(repeat('d',64)); exception when others then if sqlerrm like '%30 minutos%' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: cancelación tardía permitida'; end if;
 -- No se marca ausencia antes de la salida.
 select id into rid from public.reservaciones where horario_id=h2;
 rechazo:=false; begin perform public.r200_ausencia(rid,true,'Prueba prematura'); exception when others then if sqlerrm like '%antes de la salida%' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: ausencia prematura'; end if;
 -- Tres viajes distintos, tres ausencias; doble toque no duplica.
 for n in 1..3 loop
  insert into public.horarios(vehiculo_id,conductor_id,origen,destino,fecha,hora_salida,cupos_totales) values(1,1,'Tepic','Mezcales',current_date+4,'08:00',4) returning id into h3;
  perform public.r200_reservar(h3,'Prueba ausencias','0000000004',1,lpad(n::text,64,'0'));
  update public.horarios set fecha=current_date-2 where id=h3;
  select id into rid from public.reservaciones where horario_id=h3;
  perform public.r200_ausencia(rid,true,'No llegó a la salida');
  perform public.r200_ausencia(rid,true,'No llegó a la salida');
 end loop;
 if not exists(select 1 from public.pasajeros where telefono='0000000004' and ausencias=3 and suspendido) then raise exception 'TEST: tercera ausencia'; end if;
 rechazo:=false; begin perform public.r200_reservar(h2,'Prueba ausencias','0000000004',1,repeat('e',64)); exception when others then if sqlerrm like '%suspendido%' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: suspendido reservó'; end if;
 perform public.r200_ausencia(rid,false,'Error corregido por administrador');
 if not exists(select 1 from public.pasajeros where telefono='0000000004' and ausencias=2 and suspendido) then raise exception 'TEST: suspensión no debe vencer sola'; end if;
 perform public.r200_reactivar('0000000004','Segunda oportunidad autorizada');
 if not exists(select 1 from public.pasajeros where telefono='0000000004' and ausencias=0 and not suspendido) then raise exception 'TEST: reactivación'; end if;
 if (select count(*) from public.historial_ausencias where telefono_pasajero='0000000004')<>3 then raise exception 'TEST: historial borrado'; end if;
 perform public.r200_reservar(h2,'Prueba ausencias','0000000004',1,repeat('e',64));
 if public.r200_salida('2026-11-20','08:00','Tepic')-public.r200_salida('2026-11-20','08:00','Mezcales')<>interval '1 hour' then raise exception 'TEST: zonas horarias'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 rechazo:=false; begin perform public.r200_panel(); exception when others then if sqlerrm='Acceso no autorizado' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: panel abierto'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
 rechazo:=false; begin perform public.r200_panel(); exception when others then if sqlerrm='Acceso no autorizado' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: usuario ajeno accedió al panel'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
end $$;
select 'PRUEBAS SQL CORRECTAS: cupos, reintentos, boleto privado, cancelación, ausencias, suspensión, corrección, reactivación y horarios' resultado;

-- Activa únicamente los puntos de acceso definidos. No permite leer tablas privadas.
grant execute on function public.r200_horarios(date,text),public.r200_reservar(bigint,text,text,integer,text),public.r200_boleto(text),public.r200_cancelar(text) to anon,authenticated;
grant execute on function public.r200_panel(),public.r200_ausencia(bigint,boolean,text),public.r200_reactivar(text,text),public.r200_crear_horario(bigint,bigint,date,time,text),public.r200_cerrar_horario(bigint) to authenticated;
notify pgrst,'reload schema';

do $$ begin
 if has_function_privilege('anon','public.r200_panel()','EXECUTE') or has_function_privilege('anon','public.r200_ticket_interno(bigint)','EXECUTE') or has_function_privilege('authenticated','public.r200_ticket_interno(bigint)','EXECUTE') or has_table_privilege('anon','public.reservaciones','SELECT') or has_table_privilege('authenticated','public.reservaciones','UPDATE') then raise exception 'TEST: permiso excesivo'; end if;
 if not has_function_privilege('anon','public.r200_reservar(bigint,text,text,integer,text)','EXECUTE') then raise exception 'TEST: RPC no concedido'; end if;
end $$;
rollback;
select 'PRUEBAS SQL Y PERMISOS CORRECTOS; todo revertido' resultado;