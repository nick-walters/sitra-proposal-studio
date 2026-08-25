-- Milestones (Table 3.1.d) and critical risks (Table 3.1.e) become authored
-- blocks. Their rows stay in proposal_milestones / proposal_risks; only the
-- editing surface moves into the B3.1 board, exactly as b12.linked_activities
-- already works.

UPDATE public.card_templates
   SET is_source_fed = false
 WHERE source_key IN ('b31.table_d', 'b31.table_e');

UPDATE public.proposal_cards
   SET is_source_fed = false
 WHERE source_key IN ('b31.table_d', 'b31.table_e')
   AND deleted_at IS NULL;