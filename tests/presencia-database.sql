begin;
do $test$
declare
 u1 uuid:='62000000-0000-4000-8000-000000000071'; u2 uuid:='62000000-0000-4000-8000-000000000072'; u3 uuid:='62000000-0000-4000-8000-000000000073';
 a1 uuid:='72000000-0000-4000-8000-000000000071'; a2 uuid:='72000000-0000-4000-8000-000000000072'; a3 uuid:='72000000-0000-4000-8000-000000000073'; a4 uuid:='72000000-0000-4000-8000-000000000074';
 s1 uuid:='82000000-0000-4000-8000-000000000071'; s2 uuid:='82000000-0000-4000-8000-000000000072'; s3 uuid:='82000000-0000-4000-8000-000000000073';
 r jsonb; rejected boolean; fn_before text;
begin
 fn_before:=pg_get_functiondef('public.r200_reservar(bigint,text,text,integer,text)'::regprocedure);
 if exists(select 1 from auth.users where id in(u1,u2,u3) or phone in('520000000071','520000000072','520000000073','520000000079')) then raise exception 'Fixtures ocupados'; end if;
 if has_function_privilege('authenticated','public.r200_presencia_finalizar(uuid,uuid,text,numeric)','EXECUTE') or has_function_privilege('anon','public.r200_presencia_iniciar(uuid,uuid,text)','EXECUTE') then raise exception 'Permisos RPC demasiado amplios'; end if;
 if has_table_privilege('authenticated','public.r200_presencia_confirmaciones','UPDATE') or has_table_privilege('authenticated','public.r200_presencia_intentos','INSERT') or has_table_privilege('anon','public.r200_presencia_confirmaciones','SELECT') then raise exception 'Tablas expuestas'; end if;
 insert into auth.users(id,aud,role,phone,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 (u1,'authenticated','authenticated','520000000071',now(),'{"provider":"phone","providers":["phone"]}','{}'),
 (u2,'authenticated','authenticated','520000000072',null,'{"provider":"phone","providers":["phone"]}','{"phone_verified":true,"presencia_confirmada":true}'),
 (u3,'authenticated','authenticated','520000000073',now(),'{"provider":"phone","providers":["phone"]}','{}');
 perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 rejected:=false;begin perform public.r200_presencia_iniciar(u1,a1,'r200-presencia-v1');exception when others then if strpos(sqlerrm,'Acceso no permitido')=0 then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'Un usuario puede invocar escritura privada';end if;
 perform set_config('request.jwt.claim.role','service_role',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 rejected:=false;begin perform public.r200_presencia_iniciar(u2,a1,'r200-presencia-v1');exception when others then if strpos(sqlerrm,'Confirma tu teléfono')=0 then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'Aceptó teléfono sin confirmar con metadata falsa';end if;
 r:=public.r200_presencia_iniciar(u1,a1,'r200-presencia-v1');if r->>'intento_id'<>a1::text or (r->>'verificado')::boolean then raise exception 'Inicio incorrecto';end if;
 r:=public.r200_presencia_iniciar(u1,a2,'r200-presencia-v1');if r->>'intento_id'<>a1::text or (select count(*) from public.r200_presencia_intentos where usuario_id=u1)<>1 then raise exception 'Doble toque gastó otro intento';end if;
 rejected:=false;begin perform public.r200_presencia_consultar(u3,a1);exception when others then if strpos(sqlerrm,'Prueba no encontrada')=0 then raise;end if;rejected:=true;end;if not rejected then raise exception 'Consultó sesión ajena';end if;
 rejected:=false;begin perform public.r200_presencia_asociar(u3,a1,s1);exception when others then if strpos(sqlerrm,'La prueba no está disponible')=0 then raise;end if;rejected:=true;end;if not rejected then raise exception 'Asoció sesión ajena';end if;
 perform public.r200_presencia_asociar(u1,a1,s1);
 rejected:=false;begin perform public.r200_presencia_asociar(u1,a1,s2);exception when others then if strpos(sqlerrm,'ya fue asociada')=0 then raise;end if;rejected:=true;end;if not rejected then raise exception 'Cambió AWS sessionId';end if;
 r:=public.r200_presencia_consultar(u1,a1);if not (r->>'puede_consultar')::boolean or r->>'aws_session_id'<>s1::text then raise exception 'Consulta incorrecta';end if;
 r:=public.r200_presencia_consultar(u1,a1);if (r->>'puede_consultar')::boolean then raise exception 'No limita consultas seguidas';end if;
 r:=public.r200_presencia_finalizar(u1,a1,'IN_PROGRESS',100);if (r->>'verificado')::boolean then raise exception 'Aprobó prueba incompleta';end if;
 r:=public.r200_presencia_finalizar(u1,a1,'SUCCEEDED',25);if (r->>'verificado')::boolean or r->>'estado'<>'rechazado' then raise exception 'Aprobó confianza insuficiente';end if;
 if r->>'motivo'<>'confianza_insuficiente' or (select resultado_aws from public.r200_presencia_intentos where id=a1)<>'SUCCEEDED' then raise exception 'No conserva motivo de AWS';end if;
 r:=public.r200_presencia_finalizar(u1,a1,'SUCCEEDED',100);if (r->>'verificado')::boolean then raise exception 'Reabrió prueba rechazada';end if;
 perform public.r200_presencia_iniciar(u1,a2,'r200-presencia-v1');perform public.r200_presencia_asociar(u1,a2,s2);
 update public.r200_presencia_intentos set creado_at=now()-interval '4 minutes' where id=a2;
 r:=public.r200_presencia_finalizar(u1,a2,'SUCCEEDED',100);if (r->>'verificado')::boolean or r->>'estado'<>'expirado' then raise exception 'Aprobó sesión vencida';end if;
 perform public.r200_presencia_iniciar(u1,a3,'r200-presencia-v1');perform public.r200_presencia_asociar(u1,a3,s3);
 r:=public.r200_presencia_finalizar(u1,a3,'SUCCEEDED',97.6);if not (r->>'verificado')::boolean then raise exception 'No aprobó resultado válido';end if;
 r:=public.r200_presencia_iniciar(u1,a4,'r200-presencia-v1');if not (r->>'verificado')::boolean or (select count(*) from public.r200_presencia_intentos where usuario_id=u1)<>3 then raise exception 'No conserva aprobación';end if;
 perform set_config('request.jwt.claim.sub',u1::text,true);r:=public.r200_presencia_estado();if not (r->>'presencia_confirmada')::boolean then raise exception 'Estado propio incorrecto';end if;
 perform set_config('request.jwt.claim.sub',u3::text,true);r:=public.r200_presencia_estado();if (r->>'presencia_confirmada')::boolean then raise exception 'Filtra aprobación ajena';end if;
 update auth.users set phone='520000000079' where id=u1;
 perform set_config('request.jwt.claim.sub',u1::text,true);r:=public.r200_presencia_estado();if (r->>'presencia_confirmada')::boolean then raise exception 'Conserva selfie tras cambiar teléfono';end if;
 insert into public.r200_presencia_intentos(id,usuario_id,telefono,consentimiento,estado,creado_at) values
 ('72000000-0000-4000-8000-000000000081',u3,'520000000073','r200-presencia-v1','rechazado',now()-interval '5 minutes'),
 ('72000000-0000-4000-8000-000000000082',u3,'520000000073','r200-presencia-v1','rechazado',now()-interval '5 minutes'),
 ('72000000-0000-4000-8000-000000000083',u3,'520000000073','r200-presencia-v1','rechazado',now()-interval '5 minutes');
 rejected:=false;begin perform public.r200_presencia_iniciar(u3,a4,'r200-presencia-v1');exception when others then if strpos(sqlerrm,'Límite de intentos')=0 then raise;end if;rejected:=true;end;if not rejected then raise exception 'No limita a tres intentos';end if;
 rejected:=false;begin update public.r200_presencia_intentos set cuota_reintegrada_at=now() where id='72000000-0000-4000-8000-000000000081';exception when check_violation then rejected:=true;end;if not rejected then raise exception 'Acepta reintegro sin motivo';end if;
 update public.r200_presencia_intentos set cuota_reintegrada_at=now(),motivo_reintegro='Revisión de prueba sintética' where id='72000000-0000-4000-8000-000000000081';
 r:=public.r200_presencia_iniciar(u3,a4,'r200-presencia-v1');if (r->>'verificado')::boolean or r->>'intento_id'<>a4::text then raise exception 'Reintegro aprueba o no permite inicio';end if;
 if (select estado from public.r200_presencia_intentos where id='72000000-0000-4000-8000-000000000081')<>'rechazado' then raise exception 'Reintegro cambia resultado anterior';end if;
 perform public.r200_presencia_asociar(u3,a4,'82000000-0000-4000-8000-000000000074');
 r:=public.r200_presencia_finalizar(u3,a4,'FAILED',null);if (r->>'verificado')::boolean or r->>'motivo'<>'aws_failed' then raise exception 'Resultado FAILED incorrecto';end if;
 if fn_before<>pg_get_functiondef('public.r200_reservar(bigint,text,text,integer,text)'::regprocedure) then raise exception 'Modificó reservas';end if;
end;
$test$;
rollback;
select 'Presencia: permisos, teléfono, dueño, idempotencia, consultas, expiración, aprobación y cuota: OK' as resultado,
 not exists(select 1 from auth.users where id in('62000000-0000-4000-8000-000000000071','62000000-0000-4000-8000-000000000072','62000000-0000-4000-8000-000000000073')) as usuarios_prueba_revertidos,
 not exists(select 1 from public.r200_presencia_intentos where usuario_id in('62000000-0000-4000-8000-000000000071','62000000-0000-4000-8000-000000000072','62000000-0000-4000-8000-000000000073')) as intentos_prueba_revertidos;
