ALTER TABLE public.station_boi_status ADD COLUMN IF NOT EXISTS committed_date date;
ALTER TABLE public.station_compliance ADD COLUMN IF NOT EXISTS committed_date date;