
DO $$
DECLARE
  kudgi_id uuid;
BEGIN
  SELECT id INTO kudgi_id FROM stations WHERE name = 'Kudgi' LIMIT 1;

  CREATE TEMP TABLE _status_snap ON COMMIT DROP AS
  SELECT DISTINCT ON (s.station_id, t.wbs_code)
         s.station_id, t.wbs_code, s.actual_start, s.actual_finish,
         s.percent_complete, s.status, s.remarks, s.owner, s.updated_by, s.updated_at
  FROM station_task_status s
  JOIN l2_tasks t ON t.id = s.task_id
  WHERE s.station_id <> kudgi_id
  ORDER BY s.station_id, t.wbs_code, s.updated_at DESC;

  CREATE TEMP TABLE _delay_snap ON COMMIT DROP AS
  SELECT DISTINCT ON (d.id) d.id AS delay_id, d.station_id, t.wbs_code
  FROM delay_register d
  JOIN l2_tasks t ON t.id = d.task_id
  WHERE d.task_id IS NOT NULL AND d.station_id <> kudgi_id;

  DELETE FROM station_task_status WHERE station_id <> kudgi_id;
  UPDATE delay_register SET task_id = NULL WHERE station_id <> kudgi_id;
  DELETE FROM l2_tasks WHERE station_id <> kudgi_id;

  INSERT INTO l2_tasks (station_id, wbs_code, parent_wbs, name, is_section,
                        duration_days, baseline_start, baseline_finish, predecessors, sort_order)
  SELECT s.id, t.wbs_code, t.parent_wbs, t.name, t.is_section,
         t.duration_days, t.baseline_start, t.baseline_finish, t.predecessors, t.sort_order
  FROM stations s
  CROSS JOIN l2_tasks t
  WHERE s.id <> kudgi_id AND t.station_id = kudgi_id;

  INSERT INTO station_task_status (station_id, task_id, actual_start, actual_finish,
                                   percent_complete, status, remarks, owner, updated_by, updated_at)
  SELECT ss.station_id, t.id, ss.actual_start, ss.actual_finish,
         ss.percent_complete, ss.status, ss.remarks, ss.owner, ss.updated_by, ss.updated_at
  FROM _status_snap ss
  JOIN l2_tasks t ON t.station_id = ss.station_id AND t.wbs_code = ss.wbs_code AND NOT t.is_section;

  UPDATE delay_register d
  SET task_id = t.id
  FROM _delay_snap ds
  JOIN l2_tasks t ON t.station_id = ds.station_id AND t.wbs_code = ds.wbs_code
  WHERE d.id = ds.delay_id;
END $$;
