CREATE OR REPLACE FUNCTION public.add_expertise_matrix_column_for_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.expertise_matrix_columns (proposal_id, kind, participant_id, header_text, order_index)
  SELECT NEW.proposal_id, 'participant', NEW.id, NULL,
         COALESCE((SELECT MAX(order_index) + 1 FROM public.expertise_matrix_columns WHERE proposal_id = NEW.proposal_id), 0)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.expertise_matrix_columns
    WHERE proposal_id = NEW.proposal_id AND participant_id = NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_expertise_matrix_column ON public.participants;
CREATE TRIGGER trg_add_expertise_matrix_column
AFTER INSERT ON public.participants
FOR EACH ROW EXECUTE FUNCTION public.add_expertise_matrix_column_for_participant();

DROP INDEX IF EXISTS public.expertise_matrix_columns_proposal_participant_key;