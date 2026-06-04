ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_meeting_type_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_meeting_type_check
  CHECK (meeting_type = ANY (ARRAY['weekly'::text, 'monthly'::text, 'hop_vendor'::text, 'management'::text, 'prt'::text, 'crm'::text, 'tcm'::text]));