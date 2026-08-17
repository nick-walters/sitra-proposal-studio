ALTER TABLE public.proposal_cards DISABLE TRIGGER USER;
WITH ranked AS (
  SELECT id, 106 + row_number() OVER (PARTITION BY section_id ORDER BY order_index) AS new_index
  FROM public.proposal_cards
  WHERE deleted_at IS NULL AND anchor = 'free' AND template_key IS NULL
)
UPDATE public.proposal_cards c SET order_index = r.new_index FROM ranked r WHERE c.id = r.id;
ALTER TABLE public.proposal_cards ENABLE TRIGGER USER;