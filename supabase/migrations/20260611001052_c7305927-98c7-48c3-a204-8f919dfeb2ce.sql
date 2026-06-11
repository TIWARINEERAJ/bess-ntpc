-- Make BOI master per-station so each plant can have its own equipment list.

-- 1. Add the station link (nullable while we migrate existing global rows).
ALTER TABLE public.boi_master
  ADD COLUMN station_id uuid REFERENCES public.stations(id) ON DELETE CASCADE;

-- 2. Add a connectivity transformer field on stations (drives which BOI items apply).
ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS connectivity_transformer text;

-- 3. Clone the current global BOI master into a per-station copy for every station,
--    remembering which new row replaces which template row.
CREATE TEMP TABLE boi_clone_map (old_id uuid, new_id uuid, station_id uuid) ON COMMIT DROP;

WITH ins AS (
  INSERT INTO public.boi_master
    (id, station_id, sl_no, name, drawings_count, scheduled_po_date, inspection_category, sort_order)
  SELECT gen_random_uuid(), s.id, b.sl_no, b.name, b.drawings_count, b.scheduled_po_date, b.inspection_category, b.sort_order
  FROM public.boi_master b
  CROSS JOIN public.stations s
  WHERE b.station_id IS NULL
  RETURNING id, station_id, sort_order
)
INSERT INTO boi_clone_map (old_id, new_id, station_id)
SELECT t.id, ins.id, ins.station_id
FROM ins
JOIN public.boi_master t ON t.station_id IS NULL AND t.sort_order = ins.sort_order;

-- 4. Repoint existing per-station status records to their station-specific BOI row.
UPDATE public.station_boi_status sbs
SET boi_id = m.new_id
FROM boi_clone_map m
WHERE m.station_id = sbs.station_id AND m.old_id = sbs.boi_id;

-- 5. Repoint existing BOI documents the same way.
UPDATE public.boi_documents bd
SET boi_id = m.new_id
FROM boi_clone_map m
WHERE m.station_id = bd.station_id AND m.old_id = bd.boi_id;

-- 6. Remove the old global template rows and lock station_id.
DELETE FROM public.boi_master WHERE station_id IS NULL;
ALTER TABLE public.boi_master ALTER COLUMN station_id SET NOT NULL;
ALTER TABLE public.boi_master
  ADD CONSTRAINT boi_master_station_sort_unique UNIQUE (station_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_boi_master_station ON public.boi_master(station_id);

-- 7. Seed connectivity transformer values per station (from tender sheet).
UPDATE public.stations SET connectivity_transformer = CASE name
  WHEN 'Kudgi'        THEN '400/33/33 KV'
  WHEN 'Mouda'        THEN '132/33 KV'
  WHEN 'Solapur-1'    THEN '132/33 KV'
  WHEN 'Barh'         THEN '132/33 KV'
  WHEN 'Nabinagar'    THEN '132/33 KV'
  WHEN 'Simhadri'     THEN '400/33 KV'
  WHEN 'Ramagundam'   THEN 'Existing 33KV'
  WHEN 'Solapur-2'    THEN '132/33 KV'
  WHEN 'Barauni'      THEN '220/33 KV'
  WHEN 'Bongaigaon'   THEN 'Existing 33KV'
  WHEN 'Dadri'        THEN '220/33 KV'
  WHEN 'Unchahar'     THEN 'Existing 33KV'
  WHEN 'Gadarwara'    THEN '132/33 KV'
  WHEN 'Khargone'     THEN '400/33/33 KV'
  WHEN 'NTECL-Vallur' THEN '400/33/33 KV'
  WHEN 'Tanda'        THEN '220/33 KV'
  ELSE connectivity_transformer
END;