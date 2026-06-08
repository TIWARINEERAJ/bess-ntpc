CREATE TABLE public.weekly_progress_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date date NOT NULL,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  station_name text NOT NULL,
  pct integer NOT NULL DEFAULT 0,
  delayed integer NOT NULL DEFAULT 0,
  completed integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  health text NOT NULL DEFAULT 'green',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, station_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_progress_snapshots TO authenticated;
GRANT ALL ON public.weekly_progress_snapshots TO service_role;

ALTER TABLE public.weekly_progress_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view snapshots"
  ON public.weekly_progress_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert snapshots"
  ON public.weekly_progress_snapshots FOR INSERT TO authenticated WITH CHECK (true);

CREATE TRIGGER set_weekly_progress_snapshots_updated_at
  BEFORE UPDATE ON public.weekly_progress_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();