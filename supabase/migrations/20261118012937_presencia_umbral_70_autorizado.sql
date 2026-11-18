-- El administrador autorizó expresamente el umbral 70.
CREATE OR REPLACE FUNCTION r200_privado.r200_presencia_finalizar(p_usuario uuid, p_intento uuid, p_estado text, p_confianza numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare intento public.r200_presencia_intentos; nuevo_estado text; nuevo_motivo text;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Acceso no permitido'; end if;
 if p_estado is null or p_estado not in ('CREATED','IN_PROGRESS','SUCCEEDED','FAILED','EXPIRED') then raise exception 'Resultado inválido'; end if;
 if p_estado='SUCCEEDED' and (p_confianza is null or not(p_confianza between 0 and 100)) then raise exception 'Resultado inválido'; end if;
 select * into intento from public.r200_presencia_intentos where id=p_intento and usuario_id=p_usuario for update;
 if not found or intento.aws_session_id is null then raise exception 'Prueba no encontrada'; end if;
 if not exists(select 1 from auth.users u where u.id=p_usuario and u.phone_confirmed_at is not null and regexp_replace(u.phone,'[^0-9]','','g')=intento.telefono) then raise exception 'Confirma tu teléfono'; end if;
 if intento.estado in ('aprobado','rechazado','expirado') then return jsonb_build_object('estado',intento.estado,'verificado',intento.estado='aprobado','motivo',intento.motivo_resultado); end if;
 if intento.creado_at<=now()-interval '3 minutes' then nuevo_estado:='expirado';
 elsif p_estado='SUCCEEDED' then nuevo_estado:=case when p_confianza>=70 then 'aprobado' else 'rechazado' end;
 elsif p_estado='FAILED' then nuevo_estado:='rechazado';
 elsif p_estado='EXPIRED' then nuevo_estado:='expirado';
 else nuevo_estado:='iniciado'; end if;
 nuevo_motivo:=case when nuevo_estado='expirado' then 'expirado' when nuevo_estado='aprobado' then 'aprobado' when p_estado='FAILED' then 'aws_failed' when nuevo_estado='rechazado' then 'confianza_insuficiente' else 'en_proceso' end;
 update public.r200_presencia_intentos set resultado_aws=p_estado,motivo_resultado=nuevo_motivo,estado=nuevo_estado,terminado_at=case when nuevo_estado<>'iniciado' then now() else null end where id=p_intento;
 if nuevo_estado='aprobado' then
  insert into public.r200_presencia_confirmaciones(usuario_id,telefono,intento_id) values(p_usuario,intento.telefono,p_intento)
   on conflict(usuario_id) do update set telefono=excluded.telefono,intento_id=excluded.intento_id,confirmado_at=now();
 end if;
 return jsonb_build_object('estado',nuevo_estado,'verificado',nuevo_estado='aprobado','motivo',nuevo_motivo);
end;
$function$
;
