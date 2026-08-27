ALTER TABLE public.card_templates DROP CONSTRAINT card_templates_document_check;
ALTER TABLE public.card_templates ADD CONSTRAINT card_templates_document_check
  CHECK (document = ANY (ARRAY['part_b'::text, 'fstp_annex'::text, 'drafts'::text]));
COMMENT ON CONSTRAINT card_templates_document_check ON public.card_templates IS
  'Blocks belong to Part B, the FSTP annex, or the Drafts surfaces (work package and case drafts).';