REVOKE EXECUTE ON FUNCTION public.match_document_chunks(vector, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(vector, int) TO authenticated, service_role;