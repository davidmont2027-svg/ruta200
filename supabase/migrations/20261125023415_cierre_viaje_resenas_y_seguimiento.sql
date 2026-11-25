create table r200_privado.viajes_finalizados (
 horario_id bigint primary key references public.horarios(id) on delete cascade,
 finalizado_at timestamptz not null default now()
);
create table r200_privado.viajeros_seguimiento (
 reserva_id bigint primary key references public.reservaciones(id) on delete cascade,
 abordo_at timestamptz,
 estrellas smallint check (estrellas between 1 and 5),
 comentario text check (length(comentario) <= 500),
 nota_chofer text check (length(nota_chofer) <= 500),
 nota_admin text check (length(nota_admin) <= 500)
);
alter table r200_privado.viajes_finalizados enable row level security;
alter table r200_privado.viajeros_seguimiento enable row level security;
revoke all on r200_privado.viajes_finalizados,r200_privado.viajeros_seguimiento from public,anon,authenticated;

create function public.r200_cierre_viaje(p_horario bigint,p_accion text default 'ver',p_reserva bigint default null,p_nota text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.horarios; r public.reservaciones; finalizado boolean; propio boolean;
begin
 if auth.uid() is null or not public.r200_operador(p_horario) then
  raise exception 'Acceso no autorizado' using errcode='42501';
 end if;
 select * into h from public.horarios where id=p_horario for update;
 if not found then raise exception 'Viaje no encontrado'; end if;
 select exists(select 1 from public.conductores c where c.id=h.conductor_id and c.activo and c.usuario_id=auth.uid()) into propio;
 select exists(select 1 from r200_privado.viajes_finalizados v where v.horario_id=h.id) into finalizado;
 if p_accion not in ('ver','abordar','finalizar','nota') or p_accion is null then raise exception 'Acción desconocida'; end if;
 if p_accion in ('abordar','finalizar') and (h.cancelado_at is not null or public.r200_salida(h.fecha,h.hora_salida,h.origen)>now()) then
  raise exception 'La salida aún no comienza o fue cancelada';
 end if;
 if p_accion='finalizar' then
  if exists (select 1 from public.reservaciones x left join r200_privado.viajeros_seguimiento s on s.reserva_id=x.id where x.horario_id=h.id and x.estado='confirmada' and s.abordo_at is null) then
   raise exception 'Marca quién abordó o registra su ausencia antes de finalizar.';
  end if;
  insert into r200_privado.viajes_finalizados(horario_id) values(h.id) on conflict do nothing;
  finalizado:=true;
 elsif p_accion in ('abordar','nota') then
  select * into r from public.reservaciones where id=p_reserva and horario_id=h.id for update;
  if not found or r.estado<>'confirmada' then raise exception 'La reservación no está confirmada'; end if;
  if p_accion='abordar' then
   if finalizado then raise exception 'El viaje ya finalizó'; end if;
   insert into r200_privado.viajeros_seguimiento(reserva_id,abordo_at) values(r.id,now()) on conflict(reserva_id) do update set abordo_at=coalesce(viajeros_seguimiento.abordo_at,excluded.abordo_at);
  else
   if not finalizado or not exists(select 1 from r200_privado.viajeros_seguimiento where reserva_id=r.id and abordo_at is not null) then raise exception 'La nota requiere que el pasajero haya viajado'; end if;
   if p_nota is null or length(btrim(p_nota)) not between 1 and 500 then raise exception 'Escribe una nota de hasta 500 caracteres'; end if;
   if public.es_administrador() then
    update r200_privado.viajeros_seguimiento set nota_admin=btrim(p_nota) where reserva_id=r.id;
   elsif propio then
    update r200_privado.viajeros_seguimiento set nota_chofer=btrim(p_nota) where reserva_id=r.id;
   end if;
  end if;
 end if;
 return jsonb_build_object('finalizado',finalizado,'pasajeros',(
  select coalesce(jsonb_agg(jsonb_build_object('id',r0.id,'abordo',s.abordo_at is not null,
   'estrellas',case when propio and finalizado and r0.estado='confirmada' then s.estrellas end,
   'comentario',case when propio and finalizado and r0.estado='confirmada' then s.comentario end,
   'nota_chofer',case when propio or public.es_administrador() then s.nota_chofer end,
   'nota_admin',case when public.es_administrador() then s.nota_admin end)), '[]'::jsonb)
  from public.reservaciones r0 left join r200_privado.viajeros_seguimiento s on s.reserva_id=r0.id where r0.horario_id=h.id
 ));
end; $$;

create function public.r200_resena_boleto(p_clave text,p_estrellas integer default null,p_comentario text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reservaciones; s r200_privado.viajeros_seguimiento; habilitada boolean;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' then raise exception 'Enlace de boleto inválido'; end if;
 select * into r from public.reservaciones where clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex');
 if not found then raise exception 'Boleto no encontrado'; end if;
 select * into s from r200_privado.viajeros_seguimiento where reserva_id=r.id;
 habilitada:=r.estado='confirmada' and s.abordo_at is not null and exists(select 1 from r200_privado.viajes_finalizados where horario_id=r.horario_id);
 if p_estrellas is not null then
  if not habilitada then raise exception 'La reseña se abre después de finalizar el viaje'; end if;
  if p_estrellas not between 1 and 5 or length(coalesce(p_comentario,''))>500 then raise exception 'Elige entre 1 y 5 estrellas y escribe hasta 500 caracteres'; end if;
  update r200_privado.viajeros_seguimiento set estrellas=p_estrellas,comentario=nullif(btrim(p_comentario),'')
  where reserva_id=r.id and estrellas is null;
  s.estrellas:=p_estrellas;
 end if;
 return jsonb_build_object('habilitada',habilitada,'enviada',s.estrellas is not null);
end; $$;

create function public.r200_historial_viajes_pasajero(p_telefono text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.es_administrador() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha desc,x.hora_salida desc),'[]'::jsonb) from (
  select h.fecha,h.hora_salida,h.origen,h.destino,r.estado,
   s.abordo_at is not null as abordo,v.finalizado_at is not null as finalizado,s.nota_chofer,s.nota_admin
  from public.reservaciones r join public.horarios h on h.id=r.horario_id
  left join r200_privado.viajeros_seguimiento s on s.reserva_id=r.id
  left join r200_privado.viajes_finalizados v on v.horario_id=h.id
  where r.telefono_pasajero=p_telefono order by h.fecha desc,h.hora_salida desc limit 100
 ) x);
end; $$;

revoke all on function public.r200_cierre_viaje(bigint,text,bigint,text),public.r200_resena_boleto(text,integer,text),public.r200_historial_viajes_pasajero(text) from public,anon,authenticated;
grant execute on function public.r200_cierre_viaje(bigint,text,bigint,text),public.r200_historial_viajes_pasajero(text) to authenticated;
grant execute on function public.r200_resena_boleto(text,integer,text) to anon,authenticated;
