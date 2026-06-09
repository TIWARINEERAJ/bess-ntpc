-- Track every committed-date revision (R0, R1, R2 ...) across tasks, BOI and compliance.
CREATE TABLE public.commitment_revisions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('task','boi','compliance')),
  entity_id uuid NOT NULL,
  revision_no integer NOT NULL,
  committed_date date NOT NULL,
  recorded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (station_id, entity_type, entity_id, revision_no)
);

GRANT SELECT, INSERT ON public.commitment_revisions TO authenticated;
GRANT ALL ON public.commitment_revisions TO service_role;

ALTER TABLE public.commitment_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read commitment revisions"
  ON public.commitment_revisions FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_commitment_revisions_entity
  ON public.commitment_revisions (station_id, entity_type, entity_id, revision_no);

-- Generic trigger that records a new revision whenever a committed_date is set
-- or changed to a new value on any of the three status tables.
CREATE OR REPLACE FUNCTION public.log_commitment_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_entity uuid;
  v_rev integer;
  v_last date;
BEGIN
  IF NEW.committed_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.committed_date IS NOT DISTINCT FROM OLD.committed_date THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'station_task_status' THEN
    v_type := 'task'; v_entity := NEW.task_id;
  ELSIF TG_TABLE_NAME = 'station_boi_status' THEN
    v_type := 'boi'; v_entity := NEW.boi_id;
  ELSIF TG_TABLE_NAME = 'station_compliance' THEN
    v_type := 'compliance'; v_entity := NEW.compliance_id;
  ELSE
    RETURN NEW;
  END IF;

  SELECT committed_date INTO v_last
  FROM public.commitment_revisions
  WHERE station_id = NEW.station_id AND entity_type = v_type AND entity_id = v_entity
  ORDER BY revision_no DESC
  LIMIT 1;

  -- Skip if the most recent recorded commitment already equals the new value.
  IF v_last IS NOT NULL AND v_last = NEW.committed_date THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_rev
  FROM public.commitment_revisions
  WHERE station_id = NEW.station_id AND entity_type = v_type AND entity_id = v_entity;

  INSERT INTO public.commitment_revisions (station_id, entity_type, entity_id, revision_no, committed_date, recorded_by)
  VALUES (NEW.station_id, v_type, v_entity, v_rev, NEW.committed_date, auth.uid());

  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_commit_task
  AFTER INSERT OR UPDATE OF committed_date ON public.station_task_status
  FOR EACH ROW EXECUTE FUNCTION public.log_commitment_revision();

CREATE TRIGGER trg_log_commit_boi
  AFTER INSERT OR UPDATE OF committed_date ON public.station_boi_status
  FOR EACH ROW EXECUTE FUNCTION public.log_commitment_revision();

CREATE TRIGGER trg_log_commit_compliance
  AFTER INSERT OR UPDATE OF committed_date ON public.station_compliance
  FOR EACH ROW EXECUTE FUNCTION public.log_commitment_revision();

-- Backfill existing committed dates as the baseline revision R0.
INSERT INTO public.commitment_revisions (station_id, entity_type, entity_id, revision_no, committed_date, created_at)
SELECT station_id, 'task', task_id, 0, committed_date, COALESCE(updated_at, now())
FROM public.station_task_status WHERE committed_date IS NOT NULL;

INSERT INTO public.commitment_revisions (station_id, entity_type, entity_id, revision_no, committed_date, created_at)
SELECT station_id, 'boi', boi_id, 0, committed_date, COALESCE(updated_at, now())
FROM public.station_boi_status WHERE committed_date IS NOT NULL;

INSERT INTO public.commitment_revisions (station_id, entity_type, entity_id, revision_no, committed_date, created_at)
SELECT station_id, 'compliance', compliance_id, 0, committed_date, COALESCE(updated_at, now())
FROM public.station_compliance WHERE committed_date IS NOT NULL;