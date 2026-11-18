-- Retorno coordinado con el frontend histórico. V1 vuelve a regenerar los UUID al guardar.
begin;
do $retorno$
declare
  v1 regprocedure := to_regprocedure('public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)');
  v2 regprocedure := to_regprocedure('public.admin_guardar_proyecto_lotes_v2(uuid,jsonb,jsonb,timestamptz,uuid[])');
begin
  if pg_catalog.obj_description(v2,'pg_proc') is distinct from 'G4_EDITOR_PROYECTOS_IDENTIDAD_V2'
     or pg_catalog.obj_description(v1,'pg_proc') is distinct from 'G4_EDITOR_PROYECTOS_V1'
     or (select md5(prosrc) from pg_catalog.pg_proc where oid=v1) is distinct from '3c29e795c9fb6ad110100cf1d1629045' then
    raise exception 'G4_V2_ROLLBACK_BASE_NO_RECONOCIDA';
  end if;
end
$retorno$;
drop function public.admin_guardar_proyecto_lotes_v2(uuid,jsonb,jsonb,timestamptz,uuid[]);
grant execute on function public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
