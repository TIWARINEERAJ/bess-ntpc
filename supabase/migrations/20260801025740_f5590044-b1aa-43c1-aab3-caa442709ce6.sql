ALTER TABLE public.station_boi_status
  ADD COLUMN IF NOT EXISTS oem_name text,
  ADD COLUMN IF NOT EXISTS expected_delivery_date date;

CREATE TABLE IF NOT EXISTS public.oem_vendors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  category text,
  tier text,
  source text NOT NULL DEFAULT 'user',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS oem_vendors_name_key ON public.oem_vendors (lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oem_vendors TO authenticated;
GRANT ALL ON public.oem_vendors TO service_role;
ALTER TABLE public.oem_vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read oem vendors" ON public.oem_vendors;
CREATE POLICY "auth read oem vendors" ON public.oem_vendors FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth insert oem vendors" ON public.oem_vendors;
CREATE POLICY "auth insert oem vendors" ON public.oem_vendors FOR INSERT TO authenticated WITH CHECK (true);