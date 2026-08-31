-- Recompute stored Part B page limits for proposals that were seeded before
-- the RIA/IA template type base was corrected from 45 to 40. The stored value
-- must be the template type base plus the deltas of the applied modifiers.
UPDATE public.proposal_templates pt
SET base_page_limit = tt.base_page_limit + COALESCE((
      SELECT SUM(COALESCE((tm.effects->>'page_limit_delta')::int, 0))
      FROM public.template_modifiers tm
      WHERE tm.id = ANY (pt.applied_modifier_ids)
    ), 0),
    updated_at = now()
FROM public.template_types tt
WHERE tt.id = pt.source_template_type_id
  AND COALESCE(pt.is_customized, false) = false
  AND pt.base_page_limit IS DISTINCT FROM (
      tt.base_page_limit + COALESCE((
        SELECT SUM(COALESCE((tm.effects->>'page_limit_delta')::int, 0))
        FROM public.template_modifiers tm
        WHERE tm.id = ANY (pt.applied_modifier_ids)
      ), 0)
  );