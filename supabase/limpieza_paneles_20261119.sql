-- Limpieza única solicitada por el administrador; no volver a ejecutar.
lock table public.horarios,public.reservaciones,public.historial_ausencias in access exclusive mode;
create table r200_privado.respaldo_limpieza_paneles_20261119 as
select clock_timestamp() as creado_at,
(select coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) from public.horarios h) as horarios,
(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.reservaciones r) as reservaciones,
(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.historial_ausencias a) as ausencias;
alter table r200_privado.respaldo_limpieza_paneles_20261119 enable row level security;
revoke all on r200_privado.respaldo_limpieza_paneles_20261119 from public,anon,authenticated;
delete from public.historial_ausencias;
delete from public.reservaciones;
delete from public.horarios;
