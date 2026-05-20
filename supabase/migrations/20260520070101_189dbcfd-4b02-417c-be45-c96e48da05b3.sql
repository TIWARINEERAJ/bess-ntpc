
-- ============= 1. Solapur split =============
UPDATE public.stations SET name = 'Solapur-1', lot = 'Lot-1' WHERE id = '5bc3182d-990b-4150-8c4c-ad1b9aa4161d';

INSERT INTO public.stations (name, lot, capacity_mwh, capacity_mw, sort_order, project_start_date, agency, ntpc_eic)
SELECT 'Solapur-2', 'Lot-2', capacity_mwh, capacity_mw, 8, project_start_date, agency, ntpc_eic
FROM public.stations WHERE id = '5bc3182d-990b-4150-8c4c-ad1b9aa4161d';

UPDATE public.stations SET sort_order = sort_order + 1 WHERE sort_order >= 8 AND id != (SELECT id FROM public.stations WHERE name = 'Solapur-2');
UPDATE public.stations SET sort_order = 8 WHERE name = 'Solapur-2';

-- ============= 2. Per-station auth =============
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS station_id UUID NULL;
-- Drop unique (user_id, role) and replace with (user_id, role, station_id) so a user could have multiple station scopes if needed
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_role_station_uniq ON public.user_roles(user_id, role, COALESCE(station_id::text, ''));

CREATE OR REPLACE FUNCTION public.can_edit_station(_user_id uuid, _station_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin') OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'editor'
      AND (station_id IS NULL OR station_id = _station_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.user_station_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT station_id FROM public.user_roles
  WHERE user_id = _user_id AND role = 'editor' AND station_id IS NOT NULL LIMIT 1
$$;

-- Update RLS policies to use can_edit_station
DROP POLICY IF EXISTS "editor write status" ON public.station_task_status;
CREATE POLICY "editor write status" ON public.station_task_status FOR ALL TO authenticated
  USING (public.can_edit_station(auth.uid(), station_id))
  WITH CHECK (public.can_edit_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "editor write boi status" ON public.station_boi_status;
CREATE POLICY "editor write boi status" ON public.station_boi_status FOR ALL TO authenticated
  USING (public.can_edit_station(auth.uid(), station_id))
  WITH CHECK (public.can_edit_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "editor write station compliance" ON public.station_compliance;
CREATE POLICY "editor write station compliance" ON public.station_compliance FOR ALL TO authenticated
  USING (public.can_edit_station(auth.uid(), station_id))
  WITH CHECK (public.can_edit_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "editor write delay" ON public.delay_register;
CREATE POLICY "editor write delay" ON public.delay_register FOR ALL TO authenticated
  USING (public.can_edit_station(auth.uid(), station_id))
  WITH CHECK (public.can_edit_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "editor write issues" ON public.issues;
CREATE POLICY "editor write issues" ON public.issues FOR ALL TO authenticated
  USING (public.can_edit_station(auth.uid(), station_id))
  WITH CHECK (public.can_edit_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "editor write meetings" ON public.meetings;
CREATE POLICY "editor write meetings" ON public.meetings FOR ALL TO authenticated
  USING (public.can_edit_station(auth.uid(), station_id))
  WITH CHECK (public.can_edit_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "editor write plan" ON public.weekly_review_plan;
CREATE POLICY "editor write plan" ON public.weekly_review_plan FOR ALL TO authenticated
  USING (public.can_edit_station(auth.uid(), station_id))
  WITH CHECK (public.can_edit_station(auth.uid(), station_id));

-- ============= 3. l2_tasks per-station =============
ALTER TABLE public.l2_tasks ADD COLUMN IF NOT EXISTS station_id UUID NULL;
CREATE INDEX IF NOT EXISTS l2_tasks_station_idx ON public.l2_tasks(station_id, sort_order);

-- ============= 4. Document upload tables =============
CREATE TABLE IF NOT EXISTS public.boi_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id UUID NOT NULL,
  boi_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.boi_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read boi docs" ON public.boi_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write boi docs" ON public.boi_documents FOR ALL TO authenticated
  USING (public.can_edit_station(auth.uid(), station_id))
  WITH CHECK (public.can_edit_station(auth.uid(), station_id));
CREATE INDEX boi_docs_lookup_idx ON public.boi_documents(station_id, boi_id);

CREATE TABLE IF NOT EXISTS public.compliance_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id UUID NOT NULL,
  compliance_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.compliance_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read compliance docs" ON public.compliance_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write compliance docs" ON public.compliance_documents FOR ALL TO authenticated
  USING (public.can_edit_station(auth.uid(), station_id))
  WITH CHECK (public.can_edit_station(auth.uid(), station_id));
CREATE INDEX compliance_docs_lookup_idx ON public.compliance_documents(station_id, compliance_id);

-- Enforce max 3 documents per (station, boi/compliance)
CREATE OR REPLACE FUNCTION public.check_doc_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_count INT;
BEGIN
  IF TG_TABLE_NAME = 'boi_documents' THEN
    SELECT COUNT(*) INTO v_count FROM public.boi_documents WHERE station_id = NEW.station_id AND boi_id = NEW.boi_id;
  ELSE
    SELECT COUNT(*) INTO v_count FROM public.compliance_documents WHERE station_id = NEW.station_id AND compliance_id = NEW.compliance_id;
  END IF;
  IF v_count >= 3 THEN
    RAISE EXCEPTION 'Maximum 3 documents allowed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER boi_doc_limit BEFORE INSERT ON public.boi_documents FOR EACH ROW EXECUTE FUNCTION public.check_doc_limit();
CREATE TRIGGER compliance_doc_limit BEFORE INSERT ON public.compliance_documents FOR EACH ROW EXECUTE FUNCTION public.check_doc_limit();

-- ============= 5. Storage bucket =============
INSERT INTO storage.buckets (id, name, public) VALUES ('station-docs', 'station-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth read station docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'station-docs');
CREATE POLICY "editor write station docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'station-docs' AND public.can_edit_station(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "editor delete station docs" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'station-docs' AND public.can_edit_station(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
