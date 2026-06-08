CREATE POLICY "Signed-in users can read project docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-docs');

CREATE POLICY "Signed-in users can upload project docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-docs');

CREATE POLICY "Admins can delete project docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-docs' AND public.has_role(auth.uid(), 'admin'));