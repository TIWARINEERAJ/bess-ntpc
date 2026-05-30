-- Recordings table
CREATE TABLE public.meeting_recordings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid NOT NULL,
  station_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  duration_seconds integer,
  mime_type text,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_recordings TO authenticated;
GRANT ALL ON public.meeting_recordings TO service_role;

ALTER TABLE public.meeting_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read meeting recordings"
ON public.meeting_recordings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "editor write meeting recordings"
ON public.meeting_recordings
FOR ALL
TO authenticated
USING (can_edit_station(auth.uid(), station_id))
WITH CHECK (can_edit_station(auth.uid(), station_id));

CREATE INDEX idx_meeting_recordings_meeting ON public.meeting_recordings(meeting_id);

-- Private storage bucket for audio
INSERT INTO storage.buckets (id, name, public) VALUES ('meeting-audio', 'meeting-audio', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth read meeting audio"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'meeting-audio');

CREATE POLICY "editor write meeting audio"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'meeting-audio' AND can_edit_station(auth.uid(), ((storage.foldername(name))[1])::uuid));

CREATE POLICY "editor update meeting audio"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'meeting-audio' AND can_edit_station(auth.uid(), ((storage.foldername(name))[1])::uuid))
WITH CHECK (bucket_id = 'meeting-audio' AND can_edit_station(auth.uid(), ((storage.foldername(name))[1])::uuid));

CREATE POLICY "editor delete meeting audio"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'meeting-audio' AND can_edit_station(auth.uid(), ((storage.foldername(name))[1])::uuid));