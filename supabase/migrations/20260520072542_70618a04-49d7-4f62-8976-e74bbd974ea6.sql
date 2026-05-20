
ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS noa_date date,
  ADD COLUMN IF NOT EXISTS completion_date date,
  ADD COLUMN IF NOT EXISTS transformer_rating text,
  ADD COLUMN IF NOT EXISTS transformer_qty integer,
  ADD COLUMN IF NOT EXISTS project_cost_cr numeric;
