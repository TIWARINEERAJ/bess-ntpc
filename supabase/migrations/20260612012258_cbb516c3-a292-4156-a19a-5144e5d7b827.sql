CREATE TABLE public.station_vendor_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  package text NOT NULL,
  vendor_name text,
  sort_order integer NOT NULL DEFAULT 0,
  docs_submitted date,
  engg_approved date,
  cqa_approved date,
  final_approved date,
  remarks text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, package)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.station_vendor_status TO authenticated;
GRANT ALL ON public.station_vendor_status TO service_role;

ALTER TABLE public.station_vendor_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read vendor status" ON public.station_vendor_status
  FOR SELECT USING (true);
CREATE POLICY "editor write vendor status" ON public.station_vendor_status
  FOR ALL USING (can_edit_station(auth.uid(), station_id))
  WITH CHECK (can_edit_station(auth.uid(), station_id));

CREATE TRIGGER set_vendor_updated_at BEFORE UPDATE ON public.station_vendor_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_vendor AFTER INSERT OR DELETE OR UPDATE ON public.station_vendor_status
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- Seed common packages for every station
INSERT INTO public.station_vendor_status (station_id, package, sort_order)
SELECT s.id, p.package, p.sort_order
FROM public.stations s
CROSS JOIN (VALUES
  ('BESS OEM', 1),
  ('PCS OEM', 2),
  ('Power Transformer (PCS duty & Auxiliary)', 3),
  ('33 kV Switchgear', 4)
) AS p(package, sort_order);

-- Seed EHV packages only for stations with an EHV connectivity transformer
INSERT INTO public.station_vendor_status (station_id, package, sort_order)
SELECT s.id, p.package, p.sort_order
FROM public.stations s
CROSS JOIN (VALUES
  ('Main Power Transformer (EHV)', 5),
  ('EHV Switchyard Equipment', 6)
) AS p(package, sort_order)
WHERE COALESCE(s.connectivity_transformer,'') NOT ILIKE '%existing 33%';