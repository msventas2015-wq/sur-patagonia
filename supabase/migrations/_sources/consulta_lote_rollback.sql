-- Restore the preceding Worker first. Keep the two nullable columns and any
-- historical lot associations; the original RPC already ignores those columns.
DROP FUNCTION public.qr_contacto_registrar_interno_v1(
 text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea,uuid
);
NOTIFY pgrst,'reload schema';
