
DROP TABLE IF EXISTS public.wp_draft_milestones CASCADE;
DROP TABLE IF EXISTS public.wp_draft_risks CASCADE;

ALTER TABLE public.wp_drafts
  DROP COLUMN IF EXISTS methodology,
  DROP COLUMN IF EXISTS background_knowledge,
  DROP COLUMN IF EXISTS approach_summary,
  DROP COLUMN IF EXISTS methodologies_list,
  DROP COLUMN IF EXISTS foreseen_challenges,
  DROP COLUMN IF EXISTS inputs_question,
  DROP COLUMN IF EXISTS outputs_question,
  DROP COLUMN IF EXISTS bottlenecks_question;

CREATE OR REPLACE FUNCTION public.initialize_wp_drafts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  default_colors text[] := ARRAY['#73C92D', '#008549', '#FF9F37', '#E8114B', '#9163CB', '#86247E', '#129498', '#75CFEB', '#367ABA'];
  dec_template wp_draft_templates%ROWTYPE;
  coord_template wp_draft_templates%ROWTYPE;
  new_wp_id uuid;
  wp_num integer;
  task_data jsonb;
  deliv_data jsonb;
  task_num integer;
  deliv_num integer;
BEGIN
  SELECT * INTO dec_template FROM public.wp_draft_templates WHERE short_name = 'DEC' AND is_system = true LIMIT 1;
  SELECT * INTO coord_template FROM public.wp_draft_templates WHERE short_name = 'COORD' AND is_system = true LIMIT 1;

  INSERT INTO public.wp_color_palette (proposal_id, colors)
  VALUES (NEW.id, to_jsonb(default_colors));

  FOR wp_num IN 1..9 LOOP
    IF wp_num = 8 AND dec_template.id IS NOT NULL THEN
      INSERT INTO public.wp_drafts (proposal_id, number, short_name, title, objectives, color, order_index)
      VALUES (NEW.id, wp_num, dec_template.short_name, dec_template.title, dec_template.objectives_template, default_colors[wp_num], wp_num - 1)
      RETURNING id INTO new_wp_id;

      FOR task_data IN SELECT * FROM jsonb_array_elements(dec_template.default_tasks)
      LOOP
        INSERT INTO public.wp_draft_tasks (wp_draft_id, number, title, description, order_index)
        VALUES (new_wp_id, (task_data->>'number')::integer, task_data->>'title', task_data->>'description', (task_data->>'number')::integer - 1);
      END LOOP;

      FOR deliv_data IN SELECT * FROM jsonb_array_elements(dec_template.default_deliverables)
      LOOP
        INSERT INTO public.wp_draft_deliverables (wp_draft_id, number, title, type, dissemination_level, due_month, order_index)
        VALUES (new_wp_id, (deliv_data->>'number')::integer, deliv_data->>'title', deliv_data->>'type', deliv_data->>'dissemination_level', (deliv_data->>'due_month')::integer, (deliv_data->>'number')::integer - 1);
      END LOOP;

    ELSIF wp_num = 9 AND coord_template.id IS NOT NULL THEN
      INSERT INTO public.wp_drafts (proposal_id, number, short_name, title, objectives, color, order_index)
      VALUES (NEW.id, wp_num, coord_template.short_name, coord_template.title, coord_template.objectives_template, default_colors[wp_num], wp_num - 1)
      RETURNING id INTO new_wp_id;

      FOR task_data IN SELECT * FROM jsonb_array_elements(coord_template.default_tasks)
      LOOP
        INSERT INTO public.wp_draft_tasks (wp_draft_id, number, title, description, order_index)
        VALUES (new_wp_id, (task_data->>'number')::integer, task_data->>'title', task_data->>'description', (task_data->>'number')::integer - 1);
      END LOOP;

      FOR deliv_data IN SELECT * FROM jsonb_array_elements(coord_template.default_deliverables)
      LOOP
        INSERT INTO public.wp_draft_deliverables (wp_draft_id, number, title, type, dissemination_level, due_month, order_index)
        VALUES (new_wp_id, (deliv_data->>'number')::integer, deliv_data->>'title', deliv_data->>'type', deliv_data->>'dissemination_level', (deliv_data->>'due_month')::integer, (deliv_data->>'number')::integer - 1);
      END LOOP;

    ELSE
      INSERT INTO public.wp_drafts (proposal_id, number, color, order_index)
      VALUES (NEW.id, wp_num, default_colors[wp_num], wp_num - 1)
      RETURNING id INTO new_wp_id;

      FOR task_num IN 1..3 LOOP
        INSERT INTO public.wp_draft_tasks (wp_draft_id, number, order_index)
        VALUES (new_wp_id, task_num, task_num - 1);
      END LOOP;

      FOR deliv_num IN 1..3 LOOP
        INSERT INTO public.wp_draft_deliverables (wp_draft_id, number, order_index)
        VALUES (new_wp_id, deliv_num, deliv_num - 1);
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;
