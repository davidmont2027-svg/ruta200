-- Ejecutar dentro de BEGIN ... ROLLBACK. No deja salidas publicadas.
do $$ declare actor uuid; resultado jsonb; plan jsonb; rechazo boolean:=false; begin
 select usuario_id into actor from public.administradores limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 plan:='[{"fecha":"2031-01-20","hora":"04:00","origen":"Tepic"},{"fecha":"2031-01-20","hora":"08:10","origen":"Mezcales"},{"fecha":"2031-01-20","hora":"10:20","origen":"Tepic"},{"fecha":"2031-01-20","hora":"14:30","origen":"Mezcales"},{"fecha":"2031-01-20","hora":"16:40","origen":"Tepic"},{"fecha":"2031-01-20","hora":"20:50","origen":"Mezcales"}]';
 resultado:=public.r200_crear_rol(1,plan);
 if (resultado->>'creadas')::integer<>6 then raise exception 'TEST: tres vueltas'; end if;
 resultado:=public.r200_crear_rol(1,plan);
 if (resultado->>'creadas')::integer<>0 or (resultado->>'ya_publicadas')::integer<>6 then raise exception 'TEST: duplicó rol'; end if;
 begin perform public.r200_crear_rol(1,'[{"fecha":"2031-01-21","hora":"04:00","origen":"Tepic"},{"fecha":"2031-01-21","hora":"05:00","origen":"Tepic"}]'); exception when others then if sqlerrm like '%Salida 2:%' then rechazo:=true; else raise; end if; end;
 if not rechazo or exists(select 1 from public.horarios where vehiculo_id=1 and fecha='2031-01-21') then raise exception 'TEST: publicación parcial'; end if;
 perform set_config('request.jwt.claim.sub','',true);rechazo:=false;
 begin perform public.r200_crear_rol(1,plan);exception when others then if sqlerrm like '%Solo el administrador%' then rechazo:=true;else raise;end if;end;
 if not rechazo or has_function_privilege('anon','public.r200_crear_rol(bigint,jsonb)','EXECUTE') then raise exception 'TEST: rol accesible a visitantes';end if;
end $$;
