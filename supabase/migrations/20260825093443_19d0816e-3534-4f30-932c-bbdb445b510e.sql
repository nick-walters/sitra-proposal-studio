UPDATE public.card_templates
SET default_title = 'Introduction to work plan', title_mode = 'editor_only', updated_at = now()
WHERE key = 'b31.intro';

UPDATE public.proposal_cards
SET title = 'Introduction to work plan', title_mode = 'editor_only', updated_at = now()
WHERE template_key = 'b31.intro' AND deleted_at IS NULL;