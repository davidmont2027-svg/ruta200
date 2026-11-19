create table r200_privado.errores_huella(
 id uuid primary key default gen_random_uuid(),
 usuario_id uuid not null references auth.users(id) on delete cascade,
 creado_at timestamptz not null default now(),
 etapa text not null check(length(etapa)<=60),
 nombre text not null check(length(nombre)<=60),
 codigo text not null check(length(codigo)<=80),
 mensaje text not null check(length(mensaje)<=320),
 sitio text not null check(length(sitio)<=120),
 dominio text not null check(length(dominio)<=120)
);
alter table r200_privado.errores_huella enable row level security;
revoke all on r200_privado.errores_huella from public,anon,authenticated;
create index errores_huella_usuario_fecha on r200_privado.errores_huella(usuario_id,creado_at desc);
create function public.r200_diagnostico_huella(p_etapa text,p_nombre text,p_codigo text,p_mensaje text,p_sitio text,p_dominio text)
returns boolean language plpgsql security definer set search_path='' as $function$
begin
 if auth.uid() is null or r200_privado.operador_en_mantenimiento() or not(public.es_administrador() or exists(select 1 from public.conductores where usuario_id=auth.uid() and activo)) then raise exception 'Acceso no autorizado';end if;
 if p_etapa is null or p_etapa not in ('cargar modulo','preparar sesion','obtener registro','comprobacion de seguridad','obtener acceso','leer opciones','abrir selector','confirmar con servidor') then raise exception 'Etapa inválida';end if;
 perform pg_advisory_xact_lock(hashtextextended('r200_huella_'||auth.uid()::text,0));
 if exists(select 1 from r200_privado.errores_huella where usuario_id=auth.uid() and creado_at>clock_timestamp()-interval '5 seconds') then return false;end if;
 insert into r200_privado.errores_huella(usuario_id,etapa,nombre,codigo,mensaje,sitio,dominio) values(auth.uid(),p_etapa,left(coalesce(p_nombre,''),60),left(coalesce(p_codigo,''),80),left(coalesce(p_mensaje,''),320),left(coalesce(p_sitio,''),120),left(coalesce(p_dominio,''),120));
 return true;
end $function$;
revoke all on function public.r200_diagnostico_huella(text,text,text,text,text,text) from public,anon;
grant execute on function public.r200_diagnostico_huella(text,text,text,text,text,text) to authenticated;
