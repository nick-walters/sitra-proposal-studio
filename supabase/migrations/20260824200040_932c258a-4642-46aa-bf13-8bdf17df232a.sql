DO $seed$
DECLARE
  v_ver uuid;
  v_gid uuid;
  v_old_gid uuid;
BEGIN
  SELECT v.id INTO v_ver
    FROM public.template_versions v
    JOIN public.template_types tt ON tt.id = v.template_type_id
   WHERE tt.code = 'HE_RIA_IA_FULL' AND v.major = 1 AND v.minor = 0;

  IF v_ver IS NULL THEN RAISE EXCEPTION 'version 1.0 not found for HE_RIA_IA_FULL'; END IF;

  -- Remove the previous single long Expected impacts entry.
  SELECT g.id INTO v_old_gid
    FROM public.card_guidelines g
    JOIN public.card_guideline_templates l ON l.guideline_id = g.id
    JOIN public.card_templates ct ON ct.id = l.card_template_id
   WHERE ct.template_version_id = v_ver
     AND ct.key = 'b21.impacts'
     AND g.guideline_type = 'commission'
     AND g.content LIKE '%wider expected impacts set out in the ''destination''%';

  IF v_old_gid IS NOT NULL THEN
    DELETE FROM public.card_guideline_templates WHERE guideline_id = v_old_gid;
    DELETE FROM public.card_guidelines WHERE id = v_old_gid;
  END IF;

  ---------------------------------------------------------------- B2.1 impacts (3 entries, one block)
  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$The results of your project should make a contribution to the wider expected impacts set out in the 'destination' over the longer term. In this section you should show how your project could contribute to the impacts described in the work programme, and the measures to maximise them.<br>Provide a narrative explaining how the project's results are expected to make a difference in terms of impact, beyond the immediate scope and duration of the project. The narrative should include the components below, tailored to your project.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.impacts';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Unique contribution.</b> Describe the unique contribution your project results would make towards the wider impacts, in the longer term, specified in the respective destinations in the work programme. Provide quantified estimates where possible and meaningful.<br>⚠ Be specific, referring to the effects of your project, and not R&amp;I in general in this field.<br>⚠ State the target groups that would benefit. Even if target groups are mentioned in general terms in the work programme, you should be specific here, breaking target groups into particular interest groups or segments of society relevant to this project.$g$, 1, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 1, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.impacts';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Requirements and barriers.</b> Describe any requirements and potential barriers — arising from factors beyond the scope and duration of the project — that may determine whether the desired impacts are achieved. These may include, for example, other R&amp;I work within and beyond Horizon Europe; regulatory environment; targeted markets; user behaviour. Indicate if these factors might evolve over time. Describe any mitigating measures you propose, within or beyond your project, that could be needed should your assumptions prove to be wrong, or to address identified barriers.<br>⚠ Note that this does not include the critical risks inherent to the management of the project itself, which should be described below under 'Implementation'.$g$, 2, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 2, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.impacts';
END $seed$;