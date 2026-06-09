-- 1. Restrict station_drawings policies to authenticated users only (was public/anon)
DROP POLICY IF EXISTS "auth read drawings" ON public.station_drawings;
DROP POLICY IF EXISTS "editor write drawings" ON public.station_drawings;

CREATE POLICY "auth read drawings"
  ON public.station_drawings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "editor write drawings"
  ON public.station_drawings
  FOR ALL
  TO authenticated
  USING (can_edit_station(auth.uid(), station_id))
  WITH CHECK (can_edit_station(auth.uid(), station_id));

-- 2. Default newly self-registered users to 'viewer' (read-only) instead of 'editor'.
--    The first user still becomes admin. This removes blanket write access for anyone
--    who self-registers; an admin must explicitly promote a user to editor afterwards.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END $function$;