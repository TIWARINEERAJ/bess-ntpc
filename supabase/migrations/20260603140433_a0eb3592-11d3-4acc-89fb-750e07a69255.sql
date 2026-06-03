CREATE TABLE public.meeting_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id uuid NOT NULL,
  meeting_type text NOT NULL,
  title text,
  planned_date date NOT NULL,
  planned_time text,
  agenda text,
  status text NOT NULL DEFAULT 'planned',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_plans TO authenticated;
GRANT ALL ON public.meeting_plans TO service_role;

ALTER TABLE public.meeting_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read meeting plans"
ON public.meeting_plans
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "editor write meeting plans"
ON public.meeting_plans
FOR ALL
TO authenticated
USING (can_edit_station(auth.uid(), station_id))
WITH CHECK (can_edit_station(auth.uid(), station_id));

CREATE INDEX idx_meeting_plans_station_type ON public.meeting_plans (station_id, meeting_type);
CREATE INDEX idx_meeting_plans_date ON public.meeting_plans (planned_date);

CREATE TRIGGER set_meeting_plans_updated_at
BEFORE UPDATE ON public.meeting_plans
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();