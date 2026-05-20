
-- 1) Clone the global L2 template into stations that don't have their own L2 yet.
WITH stations_without_tasks AS (
  SELECT s.id AS station_id
  FROM public.stations s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.l2_tasks t WHERE t.station_id = s.id
  )
)
INSERT INTO public.l2_tasks (
  station_id, wbs_code, parent_wbs, name, is_section,
  duration_days, baseline_start, baseline_finish, predecessors, sort_order
)
SELECT swt.station_id, g.wbs_code, g.parent_wbs, g.name, g.is_section,
       g.duration_days, g.baseline_start, g.baseline_finish, g.predecessors, g.sort_order
FROM stations_without_tasks swt
CROSS JOIN public.l2_tasks g
WHERE g.station_id IS NULL;

-- 2) Remap any station_task_status rows whose task_id still points at a global task
--    to the matching station-specific task (matched by WBS code).
UPDATE public.station_task_status sts
SET task_id = new_t.id
FROM public.l2_tasks old_t
JOIN public.l2_tasks new_t
  ON new_t.wbs_code = old_t.wbs_code
WHERE sts.task_id = old_t.id
  AND old_t.station_id IS NULL
  AND new_t.station_id = sts.station_id;

-- 3) Delete any status rows that still don't reference a valid task for their station.
DELETE FROM public.station_task_status sts
WHERE NOT EXISTS (
  SELECT 1 FROM public.l2_tasks t
  WHERE t.id = sts.task_id AND t.station_id = sts.station_id
);

-- 4) Drop the global template — every station now has its own.
DELETE FROM public.l2_tasks WHERE station_id IS NULL;

-- 5) Enforce uniqueness so duplicates can't be reintroduced.
ALTER TABLE public.l2_tasks
  ALTER COLUMN station_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS l2_tasks_station_wbs_unique
  ON public.l2_tasks(station_id, wbs_code);
