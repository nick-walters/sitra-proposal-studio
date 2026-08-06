DO $$
DECLARE
  p_id uuid := 'af325ea2-ae8c-4f59-8625-283d5437efba';
  f_id uuid;
  idx int;
BEGIN
  SELECT id INTO f_id FROM public.figures
  WHERE proposal_id = p_id AND figure_type = 'overview-canvas' LIMIT 1;

  IF f_id IS NULL THEN
    SELECT count(*) INTO idx FROM public.figures WHERE proposal_id = p_id AND section_id = '1.1';
    INSERT INTO public.figures (proposal_id, figure_number, section_id, title, caption, figure_type, content, order_index)
    VALUES (p_id, '1.1.' || chr(97 + idx), '1.1', 'SUSIE-Q overview', 'SUSIE-Q overview', 'overview-canvas', NULL, idx)
    RETURNING id INTO f_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.impact_canvas_columns WHERE proposal_id = p_id AND figure_id = f_id) THEN
    INSERT INTO public.impact_canvas_columns (proposal_id, figure_id, key, heading, guideline, order_index)
    VALUES
      (p_id, f_id, 'challenges', 'Challenges', 'What challenges does the project address?', 0),
      (p_id, f_id, 'approaches_outputs', 'Approaches & key outputs', 'How will the project address them, and what will it produce?', 1),
      (p_id, f_id, 'impacts', 'Impacts', 'What wider effects will the results bring about?', 2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.impact_canvas_rows WHERE proposal_id = p_id AND figure_id = f_id) THEN
    INSERT INTO public.impact_canvas_rows (proposal_id, figure_id, content, order_index)
    VALUES (p_id, f_id, '{}'::jsonb, 0);
  END IF;
END $$;