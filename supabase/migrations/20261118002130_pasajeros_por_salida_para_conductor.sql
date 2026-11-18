create function public.r200_pasajeros_salida(p_horario bigint)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
begin
 if r200_privado.operador_en_mantenimiento() then raise exception using errcode='42501',message='Aplicación en mantenimiento. Intenta más tarde.'; end if;
 if auth.uid() is null or not public.r200_operador(p_horario) then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 if not exists(select 1 from public.horarios where id=p_horario) then raise exception 'La salida no está disponible'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('nombre',r.nombre_pasajero,'telefono',r.telefono_pasajero,'asientos',r.asientos,'estado',r.estado) order by r.created_at,r.id),'[]'::jsonb)
 from public.reservaciones r where r.horario_id=p_horario and r.estado in ('confirmada','ausente'));
end;
$function$;
revoke all on function public.r200_pasajeros_salida(bigint) from public,anon,authenticated;
grant execute on function public.r200_pasajeros_salida(bigint) to authenticated;
