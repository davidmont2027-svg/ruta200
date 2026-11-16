-- PREPARADA, NO APLICADA. Activar junto con el frontend SMS.
-- Conserva reservas, pasajeros, historial, bloqueos, cupos y enlaces de boletos.
begin;
create or replace function public.r200_reservar(p_horario bigint,p_nombre text,p_telefono text,p_asientos integer,p_clave text) returns jsonb language plpgsql security definer set search_path='' as $$
declare hash text; anterior public.reservaciones; persona public.pasajeros; reserva_id bigint;
begin
 -- El teléfono proviene de auth.users, nunca de metadatos editables por el cliente.
 if auth.uid() is null or not exists(
  select 1 from auth.users u where u.id=auth.uid() and u.phone_confirmed_at is not null
  and regexp_replace(u.phone,'[^0-9]','','g')='52'||p_telefono
 ) then raise exception 'Confirma por SMS este teléfono antes de reservar'; end if;
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

revoke all on function public.r200_reservar(bigint,text,text,integer,text) from public,anon;
grant execute on function public.r200_reservar(bigint,text,text,integer,text) to authenticated;
-- Ejecutar junto a 006, sustituyendo su COMMIT por este bloque.
-- Todos los cambios de función y datos quedan deshechos con ROLLBACK.
create function pg_temp.assert_sms(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FALLÓ SMS: %',msg; end if; end $$;
create function pg_temp.reject_sms(statement text,needle text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
 begin execute statement;
 exception when others then
  if strpos(sqlerrm,needle)=0 then raise exception 'Error inesperado: %',sqlerrm; end if;
  rejected:=true;
 end;
 perform pg_temp.assert_sms(rejected,'Debió rechazarse: '||needle);
end $$;
select pg_temp.assert_sms(not has_function_privilege('anon','public.r200_reservar(bigint,text,text,integer,text)','execute'),'anon sin acceso');
select pg_temp.assert_sms(has_function_privilege('authenticated','public.r200_reservar(bigint,text,text,integer,text)','execute'),'authenticated conserva acceso');
select pg_temp.assert_sms(not exists(select 1 from auth.users where id in ('62000000-0000-4000-8000-000000000061','62000000-0000-4000-8000-000000000062','62000000-0000-4000-8000-000000000063') or phone in ('520000000061','520000000062','520000000063')),'fixtures auth libres');
select pg_temp.assert_sms(not exists(select 1 from public.pasajeros where telefono in ('0000000061','0000000062','0000000063')),'fixtures pasajeros libres');
insert into auth.users(id,aud,role,phone,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values ('62000000-0000-4000-8000-000000000061','authenticated','authenticated','520000000061',now(),'{"provider":"phone","providers":["phone"]}','{}'),
('62000000-0000-4000-8000-000000000062','authenticated','authenticated','520000000062',null,'{"provider":"phone","providers":["phone"]}','{"phone_verified":true}'),
('62000000-0000-4000-8000-000000000063','authenticated','authenticated','520000000063',now(),'{"provider":"phone","providers":["phone"]}','{}');
insert into public.vehiculos(id,marca,modelo,anio,color,capacidad_pasajeros,activo) overriding system value values(-20000601,'PRUEBA','SMS',2030,'Temporal',4,true);
insert into public.conductores(id,nombre,vehiculo_id,activo) overriding system value values(-20000601,'PRUEBA SMS',-20000601,true);
insert into public.horarios(id,vehiculo_id,conductor_id,origen,destino,fecha,hora_salida,cupos_totales,activo) overriding system value values(-20000601,-20000601,-20000601,'Tepic','Mezcales','2035-01-20','08:00',4,true);
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
select pg_temp.reject_sms($q$select public.r200_reservar(-20000601,'Prueba SMS','0000000061',3,repeat('a',64))$q$,'Confirma por SMS');
select set_config('request.jwt.claim.sub','62000000-0000-4000-8000-000000000062',true);
select pg_temp.reject_sms($q$select public.r200_reservar(-20000601,'Prueba SMS','0000000062',3,repeat('b',64))$q$,'Confirma por SMS');
select set_config('request.jwt.claim.sub','62000000-0000-4000-8000-000000000061',true);
select pg_temp.reject_sms($q$select public.r200_reservar(-20000601,'Prueba SMS','0000000062',3,repeat('b',64))$q$,'Confirma por SMS');
create temporary table resultado_sms as select public.r200_reservar(-20000601,'Prueba SMS','0000000061',3,repeat('a',64)) as ticket;
select pg_temp.assert_sms((select ticket->>'folio' from resultado_sms)=(public.r200_reservar(-20000601,'Prueba SMS','0000000061',3,repeat('a',64))->>'folio'),'reintento mismo boleto');
select pg_temp.assert_sms((select cupos_ocupados=3 from public.horarios where id=-20000601),'tres asientos, sin duplicado');
select pg_temp.reject_sms($q$select public.r200_reservar(-20000601,'Prueba SMS','0000000061',1,repeat('d',64))$q$,'ya tiene una reserva');
select set_config('request.jwt.claim.sub','62000000-0000-4000-8000-000000000063',true);
select pg_temp.reject_sms($q$select public.r200_reservar(-20000601,'Prueba SMS 3','0000000063',2,repeat('c',64))$q$,'No hay suficientes');
select pg_temp.assert_sms((select cupos_ocupados=3 from public.horarios where id=-20000601),'cupo tras intento rechazado');
select public.r200_reservar(-20000601,'Prueba SMS 3','0000000063',1,repeat('c',64));
select pg_temp.assert_sms((select cupos_ocupados=4 from public.horarios where id=-20000601),'máximo cuatro');
select public.r200_cancelar(repeat('a',64));
select public.r200_cancelar(repeat('c',64));
select pg_temp.assert_sms((select cupos_ocupados=0 from public.horarios where id=-20000601),'cancelaciones liberan todos los asientos');
update public.pasajeros set ausencias=3,suspendido=true,motivo_suspension='PRUEBA historial conservado' where telefono='0000000063';
select pg_temp.reject_sms($q$select public.r200_reservar(-20000601,'Prueba SMS 3','0000000063',1,repeat('e',64))$q$,'Número suspendido');
select pg_temp.assert_sms((select ausencias=3 and suspendido and motivo_suspension='PRUEBA historial conservado' from public.pasajeros where telefono='0000000063'),'SMS no borra suspensión ni incidencias previas');
select pg_temp.assert_sms((select count(*)=2 from public.reservaciones where horario_id=-20000601 and estado='cancelada'),'boletos conservados tras cancelar');
rollback;
select 'SMS: permisos, identidad, OTP confirmado, teléfono ajeno, idempotencia, cupos, cancelación y suspensión: OK' as resultado,
 not exists(select 1 from auth.users where id in ('62000000-0000-4000-8000-000000000061','62000000-0000-4000-8000-000000000062','62000000-0000-4000-8000-000000000063')) as usuarios_prueba_revertidos,
 not exists(select 1 from public.horarios where id=-20000601) as horario_prueba_revertido,
 has_function_privilege('anon','public.r200_reservar(bigint,text,text,integer,text)','execute') as permisos_originales_restaurados,
 strpos(pg_get_functiondef('public.r200_reservar(bigint,text,text,integer,text)'::regprocedure),'Confirma por SMS')=0 as funcion_original_restaurada;
