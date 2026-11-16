alter table public.r200_presencia_intentos
 add column cuota_reintegrada_at timestamptz,
 add column motivo_reintegro text,
 add column resultado_aws text check(resultado_aws in ('CREATED','IN_PROGRESS','SUCCEEDED','FAILED','EXPIRED')),
 add column motivo_resultado text check(motivo_resultado in ('expirado','aprobado','aws_failed','confianza_insuficiente','en_proceso')),
 add constraint r200_reintegro_con_motivo check ((cuota_reintegrada_at is null and motivo_reintegro is null) or (cuota_reintegrada_at is not null and length(trim(motivo_reintegro)) between 5 and 300));
comment on column public.r200_presencia_intentos.cuota_reintegrada_at is 'Reposición administrativa de cuota. Conserva intactos el intento y su resultado. Sin permisos de escritura para pasajeros.';
CREATE OR REPLACE FUNCTION r200_privado.r200_presencia_iniciar(p_usuario uuid, p_intento uuid, p_consentimiento text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   select count(*) into cantidad from public.r200_presencia_intentos where usuario_id=p_usuario and creado_at>now()-interval '24 hours' and cuota_reintegrada_at is null;
   if cantidad>=3 then raise exception 'Límite de intentos. Contacta a atención al cliente'; end if;
   insert into public.r200_presencia_intentos(id,usuario_id,telefono,consentimiento) values(p_intento,p_usuario,telefono_actual,p_consentimiento) returning * into intento;
  end if;
 end if;
 return jsonb_build_object('verificado',false,'intento_id',intento.id,'aws_session_id',intento.aws_session_id,'vence_at',intento.creado_at+interval '3 minutes');
end;
$function$;

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
 elsif p_estado='SUCCEEDED' then nuevo_estado:=case when p_confianza>=90 then 'aprobado' else 'rechazado' end;
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
$function$;

