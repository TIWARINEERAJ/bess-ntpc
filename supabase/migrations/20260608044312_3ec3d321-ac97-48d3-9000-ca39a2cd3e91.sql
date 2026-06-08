DROP POLICY IF EXISTS "Authenticated can insert snapshots" ON public.weekly_progress_snapshots;

CREATE POLICY "Authenticated can insert snapshots"
  ON public.weekly_progress_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.is_authenticated_user());