ALTER TABLE public.station_drawings
  ADD COLUMN IF NOT EXISTS sch_date date,
  ADD COLUMN IF NOT EXISTS sch_apprvl_date date;