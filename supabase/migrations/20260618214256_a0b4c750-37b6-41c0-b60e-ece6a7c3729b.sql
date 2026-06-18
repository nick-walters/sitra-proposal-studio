CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_proposal_pic
ON public.participants(proposal_id, pic_number)
WHERE pic_number IS NOT NULL;