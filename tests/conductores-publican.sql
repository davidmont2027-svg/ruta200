-- Ejecutar en una transacción y revertir todos los viajes de prueba.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"8177a754-d553-40a1-ab9e-bbc550fc323e","role":"authenticated"}',true);
do $t$
declare d jsonb; r jsonb; failed boolean; future_date date := current_date+400;
begin
 d:=public.r200_panel();
 if d->>'administrador'<>'false' or jsonb_array_length(d->'conductores')<>1 or d->'conductores'->0->>'id'<>'1' or jsonb_array_length(d->'vehiculos')<>1 or d->'vehiculos'->0->>'id'<>'1' then raise exception 'Panel no restringido';end if;
 r:=public.r200_crear_rol(1,jsonb_build_array(jsonb_build_object('fecha',future_date,'hora','08:00','origen','Mezcales')));
 if (r->>'creadas')::int<>1 then raise exception 'No publicó';end if;
 r:=public.r200_crear_rol(1,jsonb_build_array(jsonb_build_object('fecha',future_date,'hora','08:00','origen','Mezcales')));
 if (r->>'ya_publicadas')::int<>1 then raise exception 'Duplicó';end if;
 failed:=false;begin perform public.r200_crear_rol(2,jsonb_build_array(jsonb_build_object('fecha',future_date,'hora','08:00','origen','Tepic')));exception when others then if sqlerrm not like '%propio rol%' then raise;end if;failed:=true;end;if not failed then raise exception 'Publicó ajeno';end if;
 failed:=false;begin perform public.r200_crear_horario(2,2,future_date,'08:00','Tepic');exception when others then if sqlerrm not like '%propio vehículo%' then raise;end if;failed:=true;end;if not failed then raise exception 'Directo ajeno';end if;
 failed:=false;begin perform public.r200_crear_horario(2,1,future_date,'08:00','Tepic');exception when others then if sqlerrm not like '%propio vehículo%' then raise;end if;failed:=true;end;if not failed then raise exception 'Vehículo ajeno';end if;
 failed:=false;begin perform public.r200_crear_rol(1,jsonb_build_array(jsonb_build_object('fecha',future_date,'hora','08:30','origen','Mezcales')));exception when others then if sqlerrm not like '%margen%' then raise;end if;failed:=true;end;if not failed then raise exception 'Permitió empalme';end if;
end $t$;
select set_config('request.jwt.claims','{"sub":"9bbb58c7-3ebf-42bd-8c1b-f07084cd4a16","role":"authenticated"}',true);
do $t$ begin begin perform public.r200_crear_rol(1,'[]');raise exception 'Permitió pasajero';exception when others then if sqlerrm not like '%propio rol%' then raise;end if;end;end $t$;
select 'Pruebas correctas: publicación propia, aislamiento, reintento, empalme y bloqueo pasajero' resultado;
rollback;
