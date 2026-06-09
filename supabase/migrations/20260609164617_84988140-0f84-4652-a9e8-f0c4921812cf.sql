-- project_documents: restrict INSERT/UPDATE to admins or editors
DROP POLICY IF EXISTS "Signed-in users can add documents" ON public.project_documents;
DROP POLICY IF EXISTS "Signed-in users can update documents" ON public.project_documents;

CREATE POLICY "Editors and admins can add documents"
ON public.project_documents FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

CREATE POLICY "Editors and admins can update documents"
ON public.project_documents FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'editor'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

-- weekly_progress_snapshots: restrict INSERT to admins or editors
DROP POLICY IF EXISTS "Authenticated can insert snapshots" ON public.weekly_progress_snapshots;

CREATE POLICY "Editors and admins can insert snapshots"
ON public.weekly_progress_snapshots FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR can_edit_station(auth.uid(), station_id));

-- storage project-docs bucket: restrict uploads to admins or editors
DROP POLICY IF EXISTS "Signed-in users can upload project docs" ON storage.objects;

CREATE POLICY "Editors and admins can upload project docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-docs'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'editor'::app_role))
);