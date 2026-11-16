-- Activa únicamente los puntos de acceso definidos. No permite leer tablas privadas.
grant execute on function public.r200_horarios(date,text),public.r200_reservar(bigint,text,text,integer,text),public.r200_boleto(text),public.r200_cancelar(text) to anon,authenticated;
grant execute on function public.r200_panel(),public.r200_ausencia(bigint,boolean,text),public.r200_reactivar(text,text),public.r200_crear_horario(bigint,bigint,date,time,text),public.r200_cerrar_horario(bigint) to authenticated;
notify pgrst,'reload schema';
