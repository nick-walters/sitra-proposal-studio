DO $$
DECLARE
  v_owner uuid := 'f18c7751-5e6c-4910-8663-d1bf6d7a7505';
  v_proposal uuid;
  v_template uuid;
  v_section uuid;
  v_table_card uuid;
  v_figure_card uuid;
  v_cell uuid;
  v_col uuid;
  v_row uuid;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_proposal := public.create_proposal_with_role(
    'ZZ-3B-VERIFY', 'Phase 3b verification', 'RIA'::public.proposal_type,
    'traditional'::public.budget_type, 'full', NULL, NULL, NULL, NULL, NULL, false
  );

  INSERT INTO public.proposal_templates (proposal_id) VALUES (v_proposal) RETURNING id INTO v_template;
  INSERT INTO public.proposal_template_sections (proposal_template_id, section_number, title, part, order_index)
  VALUES (v_template, '1.2', 'Methodology', 'B', 0) RETURNING id INTO v_section;

  v_table_card := public.create_table_card(v_section, 3, 3, 1);
  v_figure_card := public.create_figure_card(v_section, NULL);

  SELECT c.id INTO v_cell FROM public.card_table_cells c
    JOIN public.card_table_rows r ON r.id = c.row_id
   WHERE r.card_id = v_table_card ORDER BY r.order_index LIMIT 1;
  PERFORM public.save_card_table_cell(v_cell, '{"content_html":"<p>Cell text</p>","align_h":"center","align_v":"bottom"}'::jsonb);

  SELECT id INTO v_col FROM public.card_table_columns WHERE card_id = v_table_card ORDER BY order_index LIMIT 1;
  PERFORM public.save_card_table_column(v_col, '{"width_px":220}'::jsonb);
  PERFORM public.save_card_table_meta(v_table_card, '{"caption":"Verification table"}'::jsonb);

  PERFORM public.add_card_table_row(v_table_card, 1, 'body');
  PERFORM public.add_card_table_column(v_table_card, 1);

  SELECT r.id INTO v_row FROM public.card_table_rows r
   WHERE r.card_id = v_table_card AND r.row_type = 'body' ORDER BY r.order_index DESC LIMIT 1;
  PERFORM public.delete_card_table_row(v_row);
  PERFORM public.delete_card_table_column((SELECT id FROM public.card_table_columns WHERE card_id = v_table_card ORDER BY order_index DESC LIMIT 1));

  PERFORM public.save_card_figure(v_figure_card, '{"caption":"Verification figure","float":"left","max_width_cm":12}'::jsonb);

  PERFORM set_config('request.jwt.claims', '', true);
  RESET ROLE;
END $$;
RESET ROLE;