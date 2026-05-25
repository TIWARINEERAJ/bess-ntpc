
-- BOI: add per-equipment drawings & inspection status
ALTER TABLE public.station_boi_status
  ADD COLUMN IF NOT EXISTS drawings_status text,
  ADD COLUMN IF NOT EXISTS inspection_status text;

-- BOI docs: allow categorising (e.g. 'general', 'quality_plan')
ALTER TABLE public.boi_documents
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';

-- Update the 3-doc limit trigger function to be category-aware
CREATE OR REPLACE FUNCTION public.check_doc_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE v_count INT;
BEGIN
  IF TG_TABLE_NAME = 'boi_documents' THEN
    SELECT COUNT(*) INTO v_count FROM public.boi_documents
      WHERE station_id = NEW.station_id AND boi_id = NEW.boi_id
        AND COALESCE(category,'general') = COALESCE(NEW.category,'general');
  ELSE
    SELECT COUNT(*) INTO v_count FROM public.compliance_documents
      WHERE station_id = NEW.station_id AND compliance_id = NEW.compliance_id;
  END IF;
  IF v_count >= 3 THEN
    RAISE EXCEPTION 'Maximum 3 documents allowed';
  END IF;
  RETURN NEW;
END $function$;

-- Compliance: add Project Drawings category items (MDL, SLD, GLP, Revised DL)
INSERT INTO public.compliance_master (category, name, authority, sort_order) VALUES
  ('Drawings', 'Master Drawing List (MDL)', 'Engineering', 100),
  ('Drawings', 'Single Line Diagram (SLD)', 'Engineering', 101),
  ('Drawings', 'General Layout Plan (GLP)', 'Engineering', 102),
  ('Drawings', 'Revised Drawing List (Post-Completion)', 'Engineering', 103);
