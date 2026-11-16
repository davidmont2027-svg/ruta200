CREATE OR REPLACE FUNCTION public.r200_reservar(p_horario bigint, p_nombre text, p_telefono text, p_asientos integer, p_clave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 -- Solo una reserva nueva exige presencia; recuperar un boleto previo conserva idempotencia.
 if not exists(select 1 from public.r200_presencia_confirmaciones v where v.usuario_id=auth.uid() and v.telefono='52'||p_telefono) then raise exception 'Completa la prueba de presencia antes de reservar';end if;
 insert into public.pasajeros(nombre,telefono) values(btrim(p_nombre),p_telefono) on conflict(telefono) do nothing;
 select * into persona from public.pasajeros where telefono=p_telefono for update;
 if persona.suspendido or persona.ausencias>=3 then raise exception 'Número suspendido. Contacta a atención al cliente para solicitar revisión.'; end if;
 if exists(select 1 from public.reservaciones where horario_id=p_horario and telefono_pasajero=p_telefono and estado='confirmada') then raise exception 'Este número ya tiene una reserva en esa salida'; end if;
 insert into public.reservaciones(horario_id,nombre_pasajero,telefono_pasajero,asientos,clave_hash) values(p_horario,btrim(p_nombre),p_telefono,p_asientos,hash) returning id into reserva_id;
 return public.r200_ticket_interno(reserva_id);
end;
$function$;
