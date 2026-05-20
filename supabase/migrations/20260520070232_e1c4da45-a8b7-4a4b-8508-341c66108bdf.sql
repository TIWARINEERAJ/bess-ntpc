
ALTER TABLE public.l2_tasks DROP CONSTRAINT IF EXISTS l2_tasks_wbs_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS l2_tasks_station_wbs_uniq ON public.l2_tasks(COALESCE(station_id::text,''), wbs_code);
