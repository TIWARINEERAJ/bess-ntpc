-- 1. AUDIT LOG: restrict reads to admins, remove permissive insert
DROP POLICY IF EXISTS "auth read audit" ON public.audit_log;
CREATE POLICY "admin read audit"
ON public.audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Inserts are performed by the SECURITY DEFINER trigger write_audit_log(),
-- which bypasses RLS; the permissive authenticated insert policy is unnecessary
-- and allowed log tampering.
DROP POLICY IF EXISTS "system insert audit" ON public.audit_log;

-- 2. Set a fixed search_path on the two functions missing it
CREATE OR REPLACE FUNCTION public.is_authenticated_user()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$ SELECT auth.uid() IS NOT NULL $function$;

CREATE OR REPLACE FUNCTION public.check_doc_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_count INT;
BEGIN
  IF TG_TABLE_NAME = 'boi_documents' THEN
    SELECT COUNT(*) INTO v_count FROM public.boi_documents
      WHERE station_id = NEW.station_id AND boi_id = NEW.boi_id
        AND COALESCE(category,'general') = COALESCE(NEW.category,'general');
  ELSE
    SELECT COUNT(*) INTO v_count FROM public.compliance_documents
      WHERE station_id = NEW.station_id AND compliance_id = NEW.compliance_id;
  END IF;
  IF v_count >= 3 THEN
    RAISE EXCEPTION 'Maximum 3 documents allowed';
  END IF;
  RETURN NEW;
END $function$;

-- 3. Lock down EXECUTE on SECURITY DEFINER functions.
-- Trigger-only functions: triggers invoke them without needing EXECUTE grants.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_audit_log() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_doc_limit() FROM PUBLIC, anon, authenticated;

-- RLS helper functions: must remain callable by authenticated (for policy
-- evaluation) but not by anonymous visitors.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_edit_station(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_station(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_authenticated_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_authenticated_user() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.user_station_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_station_id(uuid) TO authenticated;

-- 4. STORAGE: add UPDATE policy scoped to station editors for station-docs
CREATE POLICY "editor update station docs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'station-docs' AND public.can_edit_station(auth.uid(), ((storage.foldername(name))[1])::uuid))
WITH CHECK (bucket_id = 'station-docs' AND public.can_edit_station(auth.uid(), ((storage.foldername(name))[1])::uuid));