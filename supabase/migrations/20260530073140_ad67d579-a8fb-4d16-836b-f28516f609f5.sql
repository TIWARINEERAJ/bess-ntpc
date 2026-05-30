ALTER TABLE public.meeting_recordings ALTER COLUMN meeting_id DROP NOT NULL;
ALTER TABLE public.meeting_recordings ADD COLUMN IF NOT EXISTS meeting_type text;
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_station_type ON public.meeting_recordings(station_id, meeting_type);