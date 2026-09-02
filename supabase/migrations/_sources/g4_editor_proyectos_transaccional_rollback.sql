begin;

do $g4_rollback_precheck$
declare
  v_oid oid := to_regprocedure('public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)');
begin
  if v_oid is null then
    raise exception 'G4_ROLLBACK_RPC_INEXISTENTE';
  end if;
  if pg_catalog.obj_description(v_oid, 'pg_proc') is distinct from 'G4_EDITOR_PROYECTOS_V1' then
    raise exception 'G4_ROLLBACK_RPC_NO_RECONOCIDA';
  end if;
end
$g4_rollback_precheck$;

drop function public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb);

do $g4_rollback_postcheck$
begin
  if to_regprocedure('public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)') is not null then
    raise exception 'G4_ROLLBACK_RPC_PERSISTE';
  end if;
end
$g4_rollback_postcheck$;

notify pgrst, 'reload schema';
select 'G4_EDITOR_PROYECTOS_ROLLBACK_OK' as recibo;

commit;
