
ALTER TABLE public.section_comments
  ADD COLUMN IF NOT EXISTS anchor_type text,
  ADD COLUMN IF NOT EXISTS anchor_payload jsonb;

COMMENT ON COLUMN public.section_comments.anchor_type IS 'editor_text or b31_dom';
COMMENT ON COLUMN public.section_comments.anchor_payload IS 'JSON anchor data: {from,to,quote,contextBefore,contextAfter} or {commentableKey,quote,startOffset,endOffset}';
