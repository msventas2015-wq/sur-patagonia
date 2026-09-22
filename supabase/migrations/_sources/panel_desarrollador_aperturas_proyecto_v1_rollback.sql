-- Reversión de panel_desarrollador_aperturas_proyecto_v1.sql.
-- Antes de ejecutarla, volver a publicar colaboradores/desarrollador.html de main:
-- la versión nueva del panel depende de estas dos funciones.
begin;

drop function if exists public.rpc_desarrollador_aperturas_proyecto_v1(timestamptz);
drop function if exists public.rpc_desarrollador_seguimiento_pendiente_v1(timestamptz);

do $postcheck$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.proname in ('rpc_desarrollador_aperturas_proyecto_v1',
                                 'rpc_desarrollador_seguimiento_pendiente_v1')) then
    raise exception 'PANEL_DEV_ROLLBACK_INCOMPLETO';
  end if;
end
$postcheck$;

commit;
