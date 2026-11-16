begin;
do $test$
declare u uuid:='62000000-0000-4000-8000-000000000074'; a uuid:='72000000-0000-4000-8000-000000000091'; b uuid:='72000000-0000-4000-8000-000000000092'; r jsonb;
begin
 if exists(select 1 from auth.users where id=u or phone='520000000074') then raise exception 'Fixture ocupado';end if;
 insert into auth.users(id,aud,role,phone,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data) values(u,'authenticated','authenticated','520000000074',now(),'{"provider":"phone","providers":["phone"]}','{}');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into public.r200_presencia_intentos(id,usuario_id,telefono,consentimiento,aws_session_id,estado) values
 (a,u,'520000000074','r200-presencia-v1','82000000-0000-4000-8000-000000000091','iniciado'),
 (b,u,'520000000074','r200-presencia-v1','82000000-0000-4000-8000-000000000092','iniciado');
 r:=public.r200_presencia_finalizar(u,a,'SUCCEEDED',79.99);
 if (r->>'verificado')::boolean or r->>'motivo'<>'confianza_insuficiente' then raise exception 'Aprueba por debajo de 80';end if;
 r:=public.r200_presencia_finalizar(u,a,'SUCCEEDED',100);
 if (r->>'verificado')::boolean then raise exception 'Reabre un rechazo';end if;
 r:=public.r200_presencia_finalizar(u,b,'SUCCEEDED',80);
 if not (r->>'verificado')::boolean or not exists(select 1 from public.r200_presencia_confirmaciones where usuario_id=u and intento_id=b) then raise exception 'No aprueba 80 con teléfono confirmado';end if;
end;
$test$;
rollback;
select not exists(select 1 from auth.users where id='62000000-0000-4000-8000-000000000074') as fixture_revertido, '79.99 rechazado; 80 aprobado; rechazo previo inmutable' as resultado;
