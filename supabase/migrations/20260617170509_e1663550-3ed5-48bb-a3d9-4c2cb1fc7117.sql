CREATE TABLE public.entity_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  remark text NOT NULL,
  author_name text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_remarks TO authenticated;
GRANT ALL ON public.entity_remarks TO service_role;

ALTER TABLE public.entity_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read remarks"
  ON public.entity_remarks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "editor write remarks"
  ON public.entity_remarks FOR ALL
  TO authenticated
  USING (can_edit_station(auth.uid(), station_id))
  WITH CHECK (can_edit_station(auth.uid(), station_id));

CREATE INDEX idx_entity_remarks_lookup
  ON public.entity_remarks (station_id, entity_type, entity_id, created_at DESC);

CREATE TRIGGER audit_entity_remarks
  AFTER INSERT OR DELETE OR UPDATE ON public.entity_remarks
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();