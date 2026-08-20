CREATE UNIQUE INDEX IF NOT EXISTS expertise_matrix_columns_proposal_participant_key
  ON public.expertise_matrix_columns (proposal_id, participant_id)
  WHERE participant_id IS NOT NULL;