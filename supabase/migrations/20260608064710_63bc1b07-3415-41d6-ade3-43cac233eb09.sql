CREATE EXTENSION IF NOT EXISTS vector;

-- Documents registry
CREATE TABLE public.project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  page_count integer,
  chunk_count integer NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO authenticated;
GRANT ALL ON public.project_documents TO service_role;

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view documents"
  ON public.project_documents FOR SELECT TO authenticated
  USING (public.is_authenticated_user());

CREATE POLICY "Signed-in users can add documents"
  ON public.project_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_authenticated_user());

CREATE POLICY "Signed-in users can update documents"
  ON public.project_documents FOR UPDATE TO authenticated
  USING (public.is_authenticated_user());

CREATE POLICY "Admins can delete documents"
  ON public.project_documents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_project_documents_updated_at
  BEFORE UPDATE ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Chunks with embeddings (1536 dims = openai/text-embedding-3-small, HNSW-indexable)
CREATE TABLE public.document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.project_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.document_chunks TO authenticated;
GRANT ALL ON public.document_chunks TO service_role;

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view chunks"
  ON public.document_chunks FOR SELECT TO authenticated
  USING (public.is_authenticated_user());

CREATE INDEX document_chunks_embedding_idx
  ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX document_chunks_document_id_idx
  ON public.document_chunks (document_id);

-- Similarity search helper
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 6
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  document_name text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.document_id, c.content, d.name AS document_name,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks c
  JOIN public.project_documents d ON d.id = c.document_id
  WHERE c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE EXECUTE ON FUNCTION public.match_document_chunks(vector, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(vector, int) TO authenticated, service_role;