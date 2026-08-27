ALTER TABLE public.template_sections DROP CONSTRAINT template_sections_part_check;
ALTER TABLE public.template_sections ADD CONSTRAINT template_sections_part_check
  CHECK (part = ANY (ARRAY['A'::text, 'B'::text, 'drafts'::text]));