CREATE TABLE IF NOT EXISTS public.card_guideline_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guideline_id uuid NOT NULL REFERENCES public.card_guidelines(id) ON DELETE CASCADE,
  document text NOT NULL CHECK (document IN ('part_b','fstp_annex')),
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_guideline_documents_uniq UNIQUE (guideline_id, document)
);

CREATE INDEX IF NOT EXISTS card_guideline_documents_doc_order_idx
  ON public.card_guideline_documents (document, order_index);

GRANT SELECT, INSERT, UPDATE ON public.card_guideline_documents TO authenticated;
GRANT ALL ON public.card_guideline_documents TO service_role;

ALTER TABLE public.card_guideline_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view guideline document links"
  ON public.card_guideline_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Global admins can insert guideline document links"
  ON public.card_guideline_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_global_admin(auth.uid()));
CREATE POLICY "Global admins can update guideline document links"
  ON public.card_guideline_documents FOR UPDATE TO authenticated
  USING (public.is_global_admin(auth.uid())) WITH CHECK (public.is_global_admin(auth.uid()));

CREATE TRIGGER card_guideline_documents_updated_at BEFORE UPDATE ON public.card_guideline_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();