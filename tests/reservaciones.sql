-- Ejecutar DESPUÉS de 001, DENTRO de BEGIN ... ROLLBACK. No conserva datos de prueba.
do $$
declare h bigint; h2 bigint; h3 bigint; h4 bigint; rid bigint; r jsonb; original jsonb; n integer; actor uuid; v_tel text:='0000000001'; clave text:=repeat('a',64); rechazo boolean;
begin
 select usuario_id into actor from public.administradores limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.horarios(vehiculo_id,conductor_id,origen,destino,fecha,hora_salida,cupos_totales) values(1,1,'Tepic','Mezcales',current_date+3,'08:00',4) returning id into h;
 r:=public.r200_reservar(h,'Prueba RUTA 200',v_tel,3,clave); original:=r;
 if r->>'estado'<>'confirmada' or (r->>'total')::integer<>750 then raise exception 'TEST: confirmación/total'; end if;
 if public.r200_reservar(h,'Prueba RUTA 200',v_tel,3,clave)<>original then raise exception 'TEST: idempotencia'; end if;
 if public.r200_boleto(clave)<>original then raise exception 'TEST: recuperación boleto'; end if;
 rechazo:=false;
 begin perform public.r200_reservar(h,'Otra persona','0000000002',2,repeat('b',64)); exception when others then if sqlerrm like '%asientos disponibles%' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: sobreventa permitida'; end if;
 perform public.r200_reservar(h,'Otra persona','0000000002',1,repeat('b',64));
 select cupos_ocupados into n from public.horarios where id=h; if n<>4 then raise exception 'TEST: cupos esperados 4'; end if;
 r:=public.r200_cancelar(clave); if r->>'estado'<>'cancelada' then raise exception 'TEST: cancelación'; end if;
 perform public.r200_cancelar(clave);
 select cupos_ocupados into n from public.horarios where id=h; if n<>1 then raise exception 'TEST: cancelación debe liberar exactamente 3'; end if;
 if exists(select 1 from public.historial_ausencias where telefono_pasajero=v_tel) then raise exception 'TEST: cancelación contó ausencia'; end if;
 perform public.r200_reservar(h,'Prueba RUTA 200',v_tel,3,repeat('c',64));
 rechazo:=false; begin perform public.r200_boleto(repeat('f',64)); exception when others then if sqlerrm='Boleto no encontrado' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: boleto sin clave'; end if;
 -- Cancelación tardía: crea a futuro, mueve la salida a 20 minutos desde ahora.
 insert into public.horarios(vehiculo_id,conductor_id,origen,destino,fecha,hora_salida,cupos_totales) values(1,1,'Tepic','Mezcales',current_date+3,'12:00',4) returning id into h2;
 perform public.r200_reservar(h2,'Prueba tardía','0000000003',1,repeat('d',64));
 update public.horarios set fecha=((clock_timestamp()+interval '20 minutes') at time zone 'America/Mazatlan')::date,hora_salida=((clock_timestamp()+interval '20 minutes') at time zone 'America/Mazatlan')::time where id=h2;
 rechazo:=false; begin perform public.r200_cancelar(repeat('d',64)); exception when others then if sqlerrm like '%30 minutos%' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: cancelación tardía permitida'; end if;
 -- No se marca ausencia antes de la salida.
 select id into rid from public.reservaciones where horario_id=h2;
 rechazo:=false; begin perform public.r200_ausencia(rid,true,'Prueba prematura'); exception when others then if sqlerrm like '%antes de la salida%' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: ausencia prematura'; end if;
 -- Tres viajes distintos, tres ausencias; doble toque no duplica.
 for n in 1..3 loop
  insert into public.horarios(vehiculo_id,conductor_id,origen,destino,fecha,hora_salida,cupos_totales) values(1,1,'Tepic','Mezcales',current_date+4,'08:00',4) returning id into h3;
  perform public.r200_reservar(h3,'Prueba ausencias','0000000004',1,lpad(n::text,64,'0'));
  update public.horarios set fecha=current_date-2 where id=h3;
  select id into rid from public.reservaciones where horario_id=h3;
  perform public.r200_ausencia(rid,true,'No llegó a la salida');
  perform public.r200_ausencia(rid,true,'No llegó a la salida');
 end loop;
 if not exists(select 1 from public.pasajeros where telefono='0000000004' and ausencias=3 and suspendido) then raise exception 'TEST: tercera ausencia'; end if;
 rechazo:=false; begin perform public.r200_reservar(h2,'Prueba ausencias','0000000004',1,repeat('e',64)); exception when others then if sqlerrm like '%suspendido%' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: suspendido reservó'; end if;
 perform public.r200_ausencia(rid,false,'Error corregido por administrador');
 if not exists(select 1 from public.pasajeros where telefono='0000000004' and ausencias=2 and suspendido) then raise exception 'TEST: suspensión no debe vencer sola'; end if;
 perform public.r200_reactivar('0000000004','Segunda oportunidad autorizada');
 if not exists(select 1 from public.pasajeros where telefono='0000000004' and ausencias=0 and not suspendido) then raise exception 'TEST: reactivación'; end if;
 if (select count(*) from public.historial_ausencias where telefono_pasajero='0000000004')<>3 then raise exception 'TEST: historial borrado'; end if;
 perform public.r200_reservar(h2,'Prueba ausencias','0000000004',1,repeat('e',64));
 if public.r200_salida('2026-11-20','08:00','Tepic')-public.r200_salida('2026-11-20','08:00','Mezcales')<>interval '1 hour' then raise exception 'TEST: zonas horarias'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 rechazo:=false; begin perform public.r200_panel(); exception when others then if sqlerrm='Acceso no autorizado' then rechazo:=true; else raise; end if; end;
 if not rechazo then raise exception 'TEST: panel abierto'; end if;
end $$;
select 'PRUEBAS SQL CORRECTAS: cupos, reintentos, boleto privado, cancelación, ausencias, suspensión, corrección, reactivación y horarios' resultado;
