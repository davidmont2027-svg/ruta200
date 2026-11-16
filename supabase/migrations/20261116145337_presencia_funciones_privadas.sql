-- Encapsula el acceso privilegiado y deja los RPC públicos como invocadores.
create schema if not exists r200_privado;
revoke all on schema r200_privado from public,anon;
grant usage on schema r200_privado to authenticated,service_role;
create index if not exists r200_presencia_confirmaciones_intento_idx on public.r200_presencia_confirmaciones(intento_id);
create or replace function r200_privado.r200_presencia_estado() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('telefono_confirmado',u.phone_confirmed_at is not null,
  'presencia_confirmada',exists(select 1 from public.r200_presencia_confirmaciones v
   where v.usuario_id=u.id and v.telefono=regexp_replace(u.phone,'[^0-9]','','g')))
 from auth.users u where u.id=auth.uid();
$$;
revoke all on function r200_privado.r200_presencia_estado() from public,anon;
grant execute on function r200_privado.r200_presencia_estado() to authenticated;

create or replace function r200_privado.r200_presencia_iniciar(p_usuario uuid,p_intento uuid,p_consentimiento text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare telefono_actual text; intento public.r200_presencia_intentos; cantidad integer;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Acceso no permitido'; end if;
 if p_usuario is null or p_intento is null or p_consentimiento is distinct from 'r200-presencia-v1' then raise exception 'Solicitud inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended('r200-presencia:'||p_usuario::text,0));
 select regexp_replace(u.phone,'[^0-9]','','g') into telefono_actual from auth.users u where u.id=p_usuario and u.phone_confirmed_at is not null;
 if telefono_actual is null or telefono_actual !~ '^52[0-9]{10}$' then raise exception 'Confirma tu teléfono'; end if;
 if exists(select 1 from public.pasajeros p where p.telefono=right(telefono_actual,10) and (p.suspendido or p.ausencias>=3)) then raise exception 'Contacta a atención al cliente'; end if;
 if exists(select 1 from public.r200_presencia_confirmaciones v where v.usuario_id=p_usuario and v.telefono=telefono_actual) then return jsonb_build_object('verificado',true); end if;
 select * into intento from public.r200_presencia_intentos where id=p_intento;
 if found and (intento.usuario_id<>p_usuario or intento.telefono<>telefono_actual) then raise exception 'Solicitud inválida'; end if;
 if found and (intento.estado not in ('reservado','iniciado') or intento.creado_at<=now()-interval '3 minutes') then raise exception 'La prueba venció. Inicia otra'; end if;
 if not found then
  -- Reusar la prueba activa evita gastar intentos por doble toque o nueva clave de red.
  select * into intento from public.r200_presencia_intentos where usuario_id=p_usuario and telefono=telefono_actual and estado in ('reservado','iniciado') and creado_at>now()-interval '150 seconds' order by creado_at desc limit 1;
  if not found then
   select count(*) into cantidad from public.r200_presencia_intentos where usuario_id=p_usuario and creado_at>now()-interval '24 hours';
   if cantidad>=3 then raise exception 'Límite de intentos. Contacta a atención al cliente'; end if;
   insert into public.r200_presencia_intentos(id,usuario_id,telefono,consentimiento) values(p_intento,p_usuario,telefono_actual,p_consentimiento) returning * into intento;
  end if;
 end if;
 return jsonb_build_object('verificado',false,'intento_id',intento.id,'aws_session_id',intento.aws_session_id,'vence_at',intento.creado_at+interval '3 minutes');
end;
$$;

create or replace function r200_privado.r200_presencia_asociar(p_usuario uuid,p_intento uuid,p_sesion uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare intento public.r200_presencia_intentos;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Acceso no permitido'; end if;
 select * into intento from public.r200_presencia_intentos where id=p_intento and usuario_id=p_usuario for update;
 if not found or p_sesion is null or intento.estado not in ('reservado','iniciado') or intento.creado_at<=now()-interval '3 minutes' then raise exception 'La prueba no está disponible'; end if;
 if not exists(select 1 from auth.users u where u.id=p_usuario and u.phone_confirmed_at is not null and regexp_replace(u.phone,'[^0-9]','','g')=intento.telefono) then raise exception 'Confirma tu teléfono'; end if;
 if intento.aws_session_id is not null and intento.aws_session_id<>p_sesion then raise exception 'La prueba ya fue asociada'; end if;
 update public.r200_presencia_intentos set aws_session_id=p_sesion,estado='iniciado' where id=p_intento;
 return jsonb_build_object('intento_id',p_intento,'session_id',p_sesion,'vence_at',intento.creado_at+interval '3 minutes');
end;
$$;

create or replace function r200_privado.r200_presencia_consultar(p_usuario uuid,p_intento uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare intento public.r200_presencia_intentos;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Acceso no permitido'; end if;
 select * into intento from public.r200_presencia_intentos where id=p_intento and usuario_id=p_usuario for update;
 if not found then raise exception 'Prueba no encontrada'; end if;
 if not exists(select 1 from auth.users u where u.id=p_usuario and u.phone_confirmed_at is not null and regexp_replace(u.phone,'[^0-9]','','g')=intento.telefono) then raise exception 'Confirma tu teléfono'; end if;
 if intento.estado in ('aprobado','rechazado','expirado') then return jsonb_build_object('estado',intento.estado,'puede_consultar',false); end if;
 if intento.creado_at<=now()-interval '3 minutes' then
  update public.r200_presencia_intentos set estado='expirado',terminado_at=now() where id=p_intento;
  return jsonb_build_object('estado','expirado','puede_consultar',false);
 end if;
 if intento.aws_session_id is null or intento.consultado_at>clock_timestamp()-interval '2 seconds' then return jsonb_build_object('estado',intento.estado,'puede_consultar',false); end if;
 if intento.consultas>=20 then raise exception 'Límite de consultas. Contacta a atención al cliente'; end if;
 update public.r200_presencia_intentos set consultas=consultas+1,consultado_at=clock_timestamp() where id=p_intento;
 return jsonb_build_object('estado',intento.estado,'puede_consultar',true,'aws_session_id',intento.aws_session_id);
end;
$$;

create or replace function r200_privado.r200_presencia_finalizar(p_usuario uuid,p_intento uuid,p_estado text,p_confianza numeric) returns jsonb
language plpgsql security definer set search_path='' as $$
declare intento public.r200_presencia_intentos; nuevo_estado text;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Acceso no permitido'; end if;
 if p_estado is null or p_estado not in ('CREATED','IN_PROGRESS','SUCCEEDED','FAILED','EXPIRED') then raise exception 'Resultado inválido'; end if;
 if p_estado='SUCCEEDED' and (p_confianza is null or not(p_confianza between 0 and 100)) then raise exception 'Resultado inválido'; end if;
 select * into intento from public.r200_presencia_intentos where id=p_intento and usuario_id=p_usuario for update;
 if not found or intento.aws_session_id is null then raise exception 'Prueba no encontrada'; end if;
 if not exists(select 1 from auth.users u where u.id=p_usuario and u.phone_confirmed_at is not null and regexp_replace(u.phone,'[^0-9]','','g')=intento.telefono) then raise exception 'Confirma tu teléfono'; end if;
 if intento.estado in ('aprobado','rechazado','expirado') then return jsonb_build_object('estado',intento.estado,'verificado',intento.estado='aprobado'); end if;
 if intento.creado_at<=now()-interval '3 minutes' then nuevo_estado:='expirado';
 elsif p_estado='SUCCEEDED' then nuevo_estado:=case when p_confianza>=90 then 'aprobado' else 'rechazado' end;
 elsif p_estado='FAILED' then nuevo_estado:='rechazado';
 elsif p_estado='EXPIRED' then nuevo_estado:='expirado';
 else nuevo_estado:='iniciado'; end if;
 update public.r200_presencia_intentos set estado=nuevo_estado,terminado_at=case when nuevo_estado<>'iniciado' then now() else null end where id=p_intento;
 if nuevo_estado='aprobado' then
  insert into public.r200_presencia_confirmaciones(usuario_id,telefono,intento_id) values(p_usuario,intento.telefono,p_intento)
   on conflict(usuario_id) do update set telefono=excluded.telefono,intento_id=excluded.intento_id,confirmado_at=now();
 end if;
 return jsonb_build_object('estado',nuevo_estado,'verificado',nuevo_estado='aprobado');
end;
$$;

revoke all on function r200_privado.r200_presencia_iniciar(uuid,uuid,text),r200_privado.r200_presencia_asociar(uuid,uuid,uuid),r200_privado.r200_presencia_consultar(uuid,uuid),r200_privado.r200_presencia_finalizar(uuid,uuid,text,numeric) from public,anon,authenticated;
grant execute on function r200_privado.r200_presencia_iniciar(uuid,uuid,text),r200_privado.r200_presencia_asociar(uuid,uuid,uuid),r200_privado.r200_presencia_consultar(uuid,uuid),r200_privado.r200_presencia_finalizar(uuid,uuid,text,numeric) to service_role;
notify pgrst,'reload schema';

create or replace function public.r200_presencia_estado() returns jsonb language sql stable security invoker set search_path='' as $$select r200_privado.r200_presencia_estado();$$;
create or replace function public.r200_presencia_iniciar(p_usuario uuid,p_intento uuid,p_consentimiento text) returns jsonb language sql security invoker set search_path='' as $$select r200_privado.r200_presencia_iniciar(p_usuario,p_intento,p_consentimiento);$$;
create or replace function public.r200_presencia_asociar(p_usuario uuid,p_intento uuid,p_sesion uuid) returns jsonb language sql security invoker set search_path='' as $$select r200_privado.r200_presencia_asociar(p_usuario,p_intento,p_sesion);$$;
create or replace function public.r200_presencia_consultar(p_usuario uuid,p_intento uuid) returns jsonb language sql security invoker set search_path='' as $$select r200_privado.r200_presencia_consultar(p_usuario,p_intento);$$;
create or replace function public.r200_presencia_finalizar(p_usuario uuid,p_intento uuid,p_estado text,p_confianza numeric) returns jsonb language sql security invoker set search_path='' as $$select r200_privado.r200_presencia_finalizar(p_usuario,p_intento,p_estado,p_confianza);$$;
revoke all on function public.r200_presencia_estado() from public,anon;
grant execute on function public.r200_presencia_estado() to authenticated;
revoke all on function public.r200_presencia_iniciar(uuid,uuid,text),public.r200_presencia_asociar(uuid,uuid,uuid),public.r200_presencia_consultar(uuid,uuid),public.r200_presencia_finalizar(uuid,uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.r200_presencia_iniciar(uuid,uuid,text),public.r200_presencia_asociar(uuid,uuid,uuid),public.r200_presencia_consultar(uuid,uuid),public.r200_presencia_finalizar(uuid,uuid,text,numeric) to service_role;
notify pgrst,'reload schema';
