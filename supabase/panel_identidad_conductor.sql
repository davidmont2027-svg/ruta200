CREATE OR REPLACE FUNCTION public.r200_panel()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if r200_privado.operador_en_mantenimiento() then raise exception using errcode='42501',message='Aplicación en mantenimiento. Intenta más tarde.'; end if;
 if auth.uid() is null or not (public.es_administrador() or exists(select 1 from public.conductores where usuario_id=auth.uid() and activo)) then raise exception 'Acceso no autorizado'; end if;
 return jsonb_build_object('administrador',public.es_administrador(),'mis_conductores',(select coalesce(jsonb_agg(id),'[]'::jsonb) from public.conductores where usuario_id=auth.uid() and activo),
 'vehiculos',case when public.es_administrador() then (select coalesce(jsonb_agg(v),'[]') from public.vehiculos v) else (select coalesce(jsonb_agg(v),'[]') from public.vehiculos v where exists(select 1 from public.conductores c where c.usuario_id=auth.uid() and c.activo and c.vehiculo_id=v.id)) end,
 'conductores',case when public.es_administrador() then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'vehiculo_id',vehiculo_id)),'[]') from public.conductores where activo) else (select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'vehiculo_id',vehiculo_id)),'[]') from public.conductores where activo and usuario_id=auth.uid()) end,
 'horarios',(select coalesce(jsonb_agg(x order by x.fecha desc,x.hora_salida),'[]') from (select h.*,(select c.nombre from public.conductores c where c.id=h.conductor_id) conductor_nombre,(select concat_ws(' ',v.marca,v.modelo,v.anio,v.color) from public.vehiculos v where v.id=h.vehiculo_id) vehiculo_nombre from public.horarios h where public.r200_operador(h.id) order by h.fecha desc limit 200)x),
 'reservaciones',(select coalesce(jsonb_agg(x order by x.id desc),'[]') from (select r.id,r.horario_id,r.nombre_pasajero,r.telefono_pasajero,r.asientos,r.estado,r.folio from public.reservaciones r where public.r200_operador(r.horario_id) order by r.id desc limit 500)x),
 'pasajeros',(select coalesce(jsonb_agg(x),'[]') from (select p.telefono,p.nombre,p.ausencias,p.suspendido,p.motivo_suspension from public.pasajeros p order by p.created_at desc limit 500)x),
 'historial',(select coalesce(jsonb_agg(x),'[]') from (select a.reservacion_id,a.telefono_pasajero,a.fecha_registro,a.motivo,a.anulada_at from public.historial_ausencias a order by a.fecha_registro desc limit 500)x));
end;
$function$
