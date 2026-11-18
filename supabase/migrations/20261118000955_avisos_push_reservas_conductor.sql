create extension if not exists pg_net;
create extension if not exists pg_cron;
create table r200_privado.push_claves(id boolean primary key default true check(id),public_key text not null,private_key text not null);
create table r200_privado.push_dispositivos(
 id uuid primary key default gen_random_uuid(),usuario_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique,p256dh text not null,auth text not null,actualizado_at timestamptz not null default now()
);
create index push_dispositivos_usuario on r200_privado.push_dispositivos(usuario_id);
create table r200_privado.push_eventos(
 id uuid primary key default gen_random_uuid(),reservacion_id bigint not null unique references public.reservaciones(id) on delete cascade,
 usuario_id uuid not null references auth.users(id) on delete cascade,
 token text not null default encode(extensions.gen_random_bytes(32),'hex'),
 estado text not null default 'pendiente' check(estado in ('pendiente','procesando','enviado','omitido')),
 solicitudes int not null default 0,solicitado_at timestamptz,lock_hasta timestamptz,creado_at timestamptz not null default now()
);
create index push_eventos_pendientes on r200_privado.push_eventos(estado,solicitado_at);
alter table r200_privado.push_claves enable row level security;
alter table r200_privado.push_dispositivos enable row level security;
alter table r200_privado.push_eventos enable row level security;
revoke all on r200_privado.push_claves,r200_privado.push_dispositivos,r200_privado.push_eventos from public,anon,authenticated,service_role;
create function public.r200_push_estado(p_endpoint text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or r200_privado.operador_en_mantenimiento() or not (public.es_administrador() or exists(select 1 from public.conductores where usuario_id=auth.uid() and activo)) then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 return jsonb_build_object('activo',exists(select 1 from r200_privado.push_dispositivos where usuario_id=auth.uid() and endpoint=p_endpoint));
end $$;
create function public.r200_push_guardar(p_endpoint text,p_p256dh text,p_auth text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.r200_push_estado();
 if length(p_endpoint)>2048 or p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)/' or p_p256dh !~ '^[A-Za-z0-9_-]{87}={0,2}$' or p_auth !~ '^[A-Za-z0-9_-]{22}={0,2}$' then raise exception 'Suscripción no válida'; end if;
 if p_endpoint is null or p_p256dh is null or p_auth is null then raise exception 'Suscripción incompleta'; end if;
 if (select count(*) from r200_privado.push_dispositivos where usuario_id=auth.uid() and endpoint<>p_endpoint)>=5 then raise exception 'Máximo de cinco dispositivos. Desactiva uno antes de agregar otro.'; end if;
 insert into r200_privado.push_dispositivos(usuario_id,endpoint,p256dh,auth) values(auth.uid(),p_endpoint,p_p256dh,p_auth)
 on conflict(endpoint) do update set usuario_id=excluded.usuario_id,p256dh=excluded.p256dh,auth=excluded.auth,actualizado_at=now();
 return jsonb_build_object('activo',true);
end $$;
create function public.r200_push_quitar(p_endpoint text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 delete from r200_privado.push_dispositivos where usuario_id=auth.uid() and endpoint=p_endpoint;
end $$;
create function public.r200_push_claves(p_public text default null,p_private text default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_public is not null and p_private is not null then
  if length(p_public)<>87 or length(p_private)<>43 then raise exception 'Clave inválida'; end if;
  insert into r200_privado.push_claves(id,public_key,private_key) values(true,p_public,p_private) on conflict(id) do nothing;
 end if;
 return (select jsonb_build_object('publicKey',public_key,'privateKey',private_key) from r200_privado.push_claves where id);
end $$;
create function public.r200_push_destinos(p_usuario uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]') from r200_privado.push_dispositivos s
 where s.usuario_id=p_usuario and not exists(select 1 from r200_privado.operadores_mantenimiento m where m.usuario_id=p_usuario)
 and exists(select 1 from public.conductores c where c.usuario_id=p_usuario and c.activo);
$$;
create function public.r200_push_tomar(p_id uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e r200_privado.push_eventos; destinos jsonb;
begin
 select * into e from r200_privado.push_eventos where id=p_id and token=p_token and estado in ('pendiente','procesando') and (lock_hasta is null or lock_hasta<now()) for update;
 if not found then return null; end if;
 if not exists(select 1 from public.reservaciones r where r.id=e.reservacion_id and r.estado='confirmada') then update r200_privado.push_eventos set estado='omitido' where id=e.id; return jsonb_build_object('skip',true); end if;
 destinos:=public.r200_push_destinos(e.usuario_id);
 if jsonb_array_length(destinos)=0 then update r200_privado.push_eventos set estado='omitido' where id=e.id; return jsonb_build_object('skip',true); end if;
 update r200_privado.push_eventos set estado='procesando',lock_hasta=now()+interval '1 minute' where id=e.id;
 return jsonb_build_object('destinos',destinos,'eventId',e.id);
end $$;
create function public.r200_push_completar(p_id uuid,p_token text,p_exito boolean,p_caducados uuid[] default '{}') returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from r200_privado.push_eventos where id=p_id and token=p_token) then raise exception 'Solicitud inválida' using errcode='42501'; end if;
 delete from r200_privado.push_dispositivos where id=any(p_caducados);
 update r200_privado.push_eventos set estado=case when p_exito then 'enviado' else 'pendiente' end,lock_hasta=null where id=p_id;
end $$;
create function public.r200_push_caducados(p_ids uuid[]) returns void language sql security definer set search_path='' as $$delete from r200_privado.push_dispositivos where id=any(p_ids);$$;
create function r200_privado.push_solicitar(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare e r200_privado.push_eventos;
begin
 update r200_privado.push_eventos set solicitudes=solicitudes+1,solicitado_at=now() where id=p_id and solicitudes<5 and estado in ('pendiente','procesando') returning * into e;
 if not found then return; end if;
 perform net.http_post(url:='https://iepawxzdkkpssmoppfpd.supabase.co/functions/v1/ruta200-push',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('action','dispatch','event_id',e.id,'token',e.token),timeout_milliseconds:=15000);
end $$;
create function r200_privado.push_reintentar() returns void language plpgsql security definer set search_path='' as $$
declare e record;
begin
 for e in select id from r200_privado.push_eventos where estado in ('pendiente','procesando') and solicitudes<5 and (solicitado_at is null or solicitado_at<now()-interval '2 minutes') and (lock_hasta is null or lock_hasta<now()) order by creado_at limit 20 loop
  begin perform r200_privado.push_solicitar(e.id); exception when others then null; end;
 end loop;
end $$;
create function r200_privado.push_nueva_reserva() returns trigger language plpgsql security definer set search_path='' as $$
declare usuario uuid; evento uuid;
begin
 select c.usuario_id into usuario from public.horarios h join public.conductores c on c.id=h.conductor_id where h.id=new.horario_id and c.activo;
 if usuario is null then return new; end if;
 insert into r200_privado.push_eventos(reservacion_id,usuario_id) values(new.id,usuario) on conflict(reservacion_id) do nothing returning id into evento;
 if evento is not null then
  begin perform r200_privado.push_solicitar(evento); exception when others then null; end;
 end if;
 return new;
end $$;
create trigger r200_push_reserva after insert on public.reservaciones for each row when (new.estado='confirmada') execute function r200_privado.push_nueva_reserva();
revoke all on function public.r200_push_estado(text),public.r200_push_guardar(text,text,text),public.r200_push_quitar(text),public.r200_push_claves(text,text),public.r200_push_destinos(uuid),public.r200_push_tomar(uuid,text),public.r200_push_completar(uuid,text,boolean,uuid[]),public.r200_push_caducados(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.r200_push_estado(text),public.r200_push_guardar(text,text,text),public.r200_push_quitar(text) to authenticated;
grant execute on function public.r200_push_claves(text,text),public.r200_push_destinos(uuid),public.r200_push_tomar(uuid,text),public.r200_push_completar(uuid,text,boolean,uuid[]),public.r200_push_caducados(uuid[]) to service_role;
revoke all on function r200_privado.push_solicitar(uuid),r200_privado.push_reintentar(),r200_privado.push_nueva_reserva() from public,anon,authenticated,service_role;
select cron.schedule('ruta200-push-reintentos','* * * * *','select r200_privado.push_reintentar()');
