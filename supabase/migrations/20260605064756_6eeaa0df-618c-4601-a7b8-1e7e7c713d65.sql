-- Master Drawing List (MDL) tracking
ALTER TABLE public.stations ADD COLUMN IF NOT EXISTS mdl_total integer NOT NULL DEFAULT 0;

CREATE TABLE public.station_drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'General',
  drg_ref text NOT NULL DEFAULT '',
  drg_desc text NOT NULL DEFAULT '',
  cat text,
  submitted_date date,
  approved_date date,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.station_drawings TO authenticated;
GRANT ALL ON public.station_drawings TO service_role;

ALTER TABLE public.station_drawings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read drawings" ON public.station_drawings
  FOR SELECT USING (true);

CREATE POLICY "editor write drawings" ON public.station_drawings
  FOR ALL USING (can_edit_station(auth.uid(), station_id))
  WITH CHECK (can_edit_station(auth.uid(), station_id));

CREATE INDEX idx_station_drawings_station ON public.station_drawings(station_id);
CREATE INDEX idx_station_drawings_category ON public.station_drawings(category);

CREATE TRIGGER trg_station_drawings_updated_at
  BEFORE UPDATE ON public.station_drawings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();