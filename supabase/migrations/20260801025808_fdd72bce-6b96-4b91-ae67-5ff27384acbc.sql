DROP POLICY IF EXISTS "auth insert oem vendors" ON public.oem_vendors;
CREATE POLICY "auth insert oem vendors" ON public.oem_vendors FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());
REVOKE UPDATE, DELETE ON public.oem_vendors FROM authenticated;