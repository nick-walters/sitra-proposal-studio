DO $seed$
DECLARE
  v_ver uuid;
  v_type uuid;
  v_sec_b32 uuid;
  v_gid uuid;
BEGIN
  SELECT v.id, v.template_type_id INTO v_ver, v_type
    FROM public.template_versions v JOIN public.template_types tt ON tt.id = v.template_type_id
   WHERE tt.code = 'HE_RIA_IA_FULL' AND v.major = 1 AND v.minor = 0;
  IF v_ver IS NULL THEN RAISE EXCEPTION 'version 1.0 not found'; END IF;

  -- Blocks with no supplied guidance are not part of the template.
  DELETE FROM public.card_templates
   WHERE template_version_id = v_ver AND key IN ('b11.background','b21.key_pathways');

  -- B3.1 overview block adopts the supplied key.
  UPDATE public.card_templates
     SET key = 'b31.intro', default_title = 'Overall structure of the work plan'
   WHERE template_version_id = v_ver AND key = 'b31.overview';

  -- B3.2 is restructured to the supplied blocks.
  SELECT section_source_id INTO v_sec_b32 FROM public.card_templates
   WHERE template_version_id = v_ver AND key = 'b32.references';
  DELETE FROM public.card_templates
   WHERE template_version_id = v_ver AND section_number = 'B3.2' AND kind <> 'references';

  INSERT INTO public.card_templates (template_type_id, template_version_id, section_source_id, section_number,
    document, key, kind, default_title, anchor, order_index, is_deletable, is_hideable,
    is_source_fed, is_fixed_position, default_visible, is_active)
  VALUES
    (v_type, v_ver, v_sec_b32, 'B3.2', 'part_b', 'b32.interdisciplinarity', 'text',
      $t$Interdisciplinarity & complementarity of the consortium for addressing the project's objectives$t$,
      'free', 100, true, true, false, false, true, true),
    (v_type, v_ver, v_sec_b32, 'B3.2', 'part_b', 'b32.capacity', 'text',
      $t$Participants' capacity, contributions & resources$t$,
      'free', 101, true, true, false, false, true, true),
    (v_type, v_ver, v_sec_b32, 'B3.2', 'part_b', 'b32.value_chain_industrial', 'text',
      $t$Value chain coverage & industrial involvement$t$,
      'free', 102, true, true, false, false, true, true),
    (v_type, v_ver, v_sec_b32, 'B3.2', 'part_b', 'b32.other_countries', 'text',
      $t$Other countries and international organisations$t$,
      'free', 103, true, true, false, false, true, true);

  -- Every Commission guidance row attached to a Part B block is replaced,
  -- except the milestones and risks entries, which are kept as they are.
  DELETE FROM public.card_guidelines g
   WHERE g.template_version_id = v_ver
     AND g.guideline_type = 'commission'
     AND EXISTS (
       SELECT 1 FROM public.card_guideline_templates l
         JOIN public.card_templates ct ON ct.id = l.card_template_id
        WHERE l.guideline_id = g.id AND ct.document = 'part_b'
          AND ct.key NOT IN ('b31.table_d','b31.table_e'))
     AND NOT EXISTS (
       SELECT 1 FROM public.card_guideline_templates l
         JOIN public.card_templates ct ON ct.id = l.card_template_id
        WHERE l.guideline_id = g.id AND ct.key IN ('b31.table_d','b31.table_e'))
     AND NOT EXISTS (SELECT 1 FROM public.card_guideline_documents d WHERE d.guideline_id = g.id);

  ---------------------------------------------------------------- B1.1
  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Briefly describe the objectives of your proposed work. Why are they pertinent to the work programme topic? Are they measurable and verifiable? Are they realistically achievable?$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b11.objectives';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Describe how your project goes beyond the state-of-the-art, and the extent the proposed work is ambitious. Indicate any exceptional ground-breaking R&amp;I, novel concepts and approaches, new products, services or business and organisational models. Where relevant, illustrate the advance by referring to products and services already available on the market. Refer to any patent or publication search carried out.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b11.sota';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Describe where the proposed work is positioned in terms of R&amp;I maturity (i.e. where it is situated in the spectrum from 'idea to application', or from 'lab to market'). Where applicable, provide an indication of the Technology Readiness Level, if possible distinguishing the start and by the end of the project.<br>⚠ Please bear in mind that advances beyond the state of the art must be interpreted in the light of the positioning of the project. Expectations will not be the same for RIAs at lower TRL, compared with Innovation Actions at high TRLs.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b11.maturity';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$According to Annex G. Technology readiness levels (TRL), where a topic description refers to a TRL, the following definitions apply, unless otherwise specified:<div>• TRL 1 – basic principles observed</div><div>• TRL 2 – technology concept formulated</div><div>• TRL 3 – experimental proof of concept</div><div>• TRL 4 – technology validated in lab</div><div>• TRL 5 – technology validated in relevant environment (industrially relevant environment in the case of key enabling technologies)</div><div>• TRL 6 – technology demonstrated in relevant environment (industrially relevant environment in the case of key enabling technologies)</div><div>• TRL 7 – system prototype demonstration in operational environment</div><div>• TRL 8 – system complete and qualified</div><div>• TRL 9 – actual system proven in operational environment (competitive manufacturing in the case of key enabling technologies; or in space)</div>$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b11.trl_table';

  ---------------------------------------------------------------- B1.2
  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Describe and explain the overall methodology, including the concepts, models and assumptions that underpin your work. Explain how this will enable you to deliver your project's objectives. Refer to any important challenges you may have identified in the chosen methodology and how you intend to overcome them. [e.g. 10 pages]<br>⚠ This section should be presented as a narrative. The detailed tasks and work packages are described below under 'Implementation'.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b12.concepts';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Describe and explain the overall methodology, including the concepts, models and assumptions that underpin your work. Explain how this will enable you to deliver your project's objectives. Refer to any important challenges you may have identified in the chosen methodology and how you intend to overcome them. [e.g. 10 pages]<br>⚠ This section should be presented as a narrative. The detailed tasks and work packages are described below under 'Implementation'.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b12.methodologies';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Describe any national or international research and innovation activities whose results will feed into the project, and how that link will be established. [e.g. 1 page]$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b12.linked_activities';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Explain how expertise and methods from different disciplines will be brought together and integrated in pursuit of your objectives. If you consider that an inter-disciplinary approach is unnecessary in the context of the proposed work, please provide a justification. [e.g. 1/2 page]$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b12.interdisciplinarity';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$For topics where the work programme indicates the need for the integration of social sciences and humanities, show the role of these disciplines in the project or provide a justification if you consider that these disciplines are not relevant to your proposed project. [e.g. 1/2 page]$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b12.ssh';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Describe how the gender dimension (i.e. sex and/or gender analysis) is taken into account in the project's research and innovation content [e.g. 1 page]. If you do not consider such a gender dimension to be relevant in your project, please provide a justification.<br>⚠ <b>Note:</b> This section is mandatory except for topics which have been identified in the work programme as not requiring the integration of the gender dimension into R&amp;I content.<br>⚠ Remember that that this question relates to the content of the planned research and innovation activities, and not to gender balance in the teams in charge of carrying out the project.<br>⚠ Sex and gender analysis refers to biological characteristics and social/cultural factors respectively. For guidance on methods of sex / gender analysis and the issues to be taken into account, please refer to <a href="https://op.europa.eu/en/publication-detail/-/publication/33b4c99f-2e66-11eb-b27b-01aa75ed71a1/language-en">this publication</a>.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b12.gender';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Describe how appropriate open science practices are implemented as an integral part of the proposed methodology. Show how the choice of practices and their implementation are adapted to the nature of your work, in a way that will increase the chances of the project delivering on its objectives [e.g. 1 page]. If you believe that none of these practices are appropriate for your project, please provide a justification here.<br>⚠ Open science is an approach based on open cooperative work and systematic sharing of knowledge and tools as early and widely as possible in the process. Open science practices include early and open sharing of research (for example through preregistration, registered reports, pre-prints, or crowd-sourcing); research output management; measures to ensure reproducibility of research outputs; providing open access to research outputs (such as publications, data, software, models, algorithms, and workflows); participation in open peer-review; and involving all relevant knowledge actors including citizens, civil society and end users in the co-creation of R&amp;I agendas and contents (such as citizen science).<br>⚠ Please note that this question does not refer to outreach actions that may be planned as part of communication, dissemination and exploitation activities. These aspects should instead be described below under 'Impact'.<br>⚠ Proposals selected for funding under Horizon Europe will need to develop a detailed data management plan (DMP) for making their data/research outputs findable, accessible, interoperable and reusable (FAIR) as a deliverable by month 6 and revised towards the end of a project's lifetime.<br>⚠ For guidance on open science practices and research data management, please refer to the relevant section of the <a href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/horizon/guidance/programme-guide_horizon_en.pdf">HE Programme Guide</a> on the Funding &amp; Tenders Portal.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b12.open_science';

  ---------------------------------------------------------------- B2.1 outcomes (3 entries, one block)
  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$The results of your project should make a contribution to the expected outcomes set out for the work programme topic over the medium term. In this section you should show how your project could contribute to the outcomes described in the work programme, and the measures to maximise them.<br>Provide a narrative explaining how the project's results are expected to make a difference in terms of impact, beyond the immediate scope and duration of the project. The narrative should include the components below, tailored to your project.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.outcomes';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Unique contribution.</b> Describe the unique contribution your project results would make towards the outcomes specified in this topic. Provide quantified estimates where possible and meaningful.<br>⚠ Be specific, referring to the effects of your project, and not R&amp;I in general in this field.<br>⚠ State the target groups that would benefit. Even if target groups are mentioned in general terms in the work programme, you should be specific here, breaking target groups into particular interest groups or segments of society relevant to this project.$g$, 1, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 1, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.outcomes';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Requirements and barriers.</b> Describe any requirements and potential barriers — arising from factors beyond the scope and duration of the project — that may determine whether the desired outcomes. These may include, for example, other R&amp;I work within and beyond Horizon Europe; regulatory environment; targeted markets; user behaviour. Indicate if these factors might evolve over time. Describe any mitigating measures you propose, within or beyond your project, that could be needed should your assumptions prove to be wrong, or to address identified barriers.<br>⚠ Note that this does not include the critical risks inherent to the management of the project itself, which should be described below under 'Implementation'.$g$, 2, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 2, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.outcomes';

  ---------------------------------------------------------------- B2.1 impacts
  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$The results of your project should make a contribution to the wider expected impacts set out in the 'destination' over the longer term. In this section you should show how your project could contribute to the impacts described in the work programme, and the measures to maximise them.<br><br>Provide a narrative explaining how the project's results are expected to make a difference in terms of impact, beyond the immediate scope and duration of the project. The narrative should include the components below, tailored to your project.<br><br><b>Unique contribution.</b> Describe the unique contribution your project results would make towards the wider impacts, in the longer term, specified in the respective destinations in the work programme. Provide quantified estimates where possible and meaningful.<br><br>⚠ Be specific, referring to the effects of your project, and not R&amp;I in general in this field.<br><br>⚠ State the target groups that would benefit. Even if target groups are mentioned in general terms in the work programme, you should be specific here, breaking target groups into particular interest groups or segments of society relevant to this project.<br><br><b>Requirements and barriers.</b> Describe any requirements and potential barriers — arising from factors beyond the scope and duration of the project — that may determine whether the desired impacts are achieved. These may include, for example, other R&amp;I work within and beyond Horizon Europe; regulatory environment; targeted markets; user behaviour. Indicate if these factors might evolve over time. Describe any mitigating measures you propose, within or beyond your project, that could be needed should your assumptions prove to be wrong, or to address identified barriers.<br><br>⚠ Note that this does not include the critical risks inherent to the management of the project itself, which should be described below under 'Implementation'.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.impacts';

  ---------------------------------------------------------------- B2.1 impact summary (7 entries, one block)
  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Provide a summary of this section by presenting the key elements of the impact section.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.impact_summary';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Specific needs:</b> what are the specific needs that triggered this project?<div><b>Example 1:</b> Most airports use process flow-oriented models based on static mathematical values limiting the optimal management of passenger flow and hampering the accurate use of the available resources to the actual demand of passengers.</div><div><b>Example 2:</b> Electronic components need to get smaller and lighter to match the expectations of the end-users. At the same time there is a problem of sourcing of raw materials that has an environmental impact.</div>$g$, 1, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 1, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.impact_summary';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Expected results:</b> what do you expect to generate by the end of the project?<div><b>Example 1:</b> Successful large-scale demonstrator: Trial with 3 airports of an advanced forecasting system for proactive airport passenger flow management. Algorithmic model: Novel algorithmic model for proactive airport passenger flow management.</div><div><b>Example 2:</b> Publication of a scientific discovery on transparent electronics. New product: More sustainable electronic circuits. Three PhD students trained.</div>$g$, 2, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 2, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.impact_summary';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>DEC measures:</b> what dissemination, exploitation and communication measures will you apply to the results?<div><b>Example 1:</b> Exploitation: Patenting the algorithmic model. Dissemination towards the scientific community and airports: Scientific publication with the results of the large-scale demonstration. Communication towards citizens: An event in a shopping mall to show how the outcomes of the action are relevant to our everyday lives.</div><div><b>Example 2:</b> Exploitation of the new product: Patenting the new product; Licencing to major electronic companies. Dissemination towards the scientific community and industry: Participating at conferences; Developing a platform of material compositions for industry; Participation at EC project portfolios to disseminate the results as part of a group and maximise the visibility vis-à-vis companies.</div>$g$, 3, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 3, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.impact_summary';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Target groups:</b> who will use or further up-take the results of the project? Who will benefit from the results of the project?<div><b>Example 1:</b> 9 European airports: Schiphol, Brussels airport, etc. The European Union aviation safety agency. Air passengers (indirect).</div><div><b>Example 2:</b> End-users: consumers of electronic devices. Major electronic companies: Samsung, Apple, etc. Scientific community (field of transparent electronics).</div>$g$, 4, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 4, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.impact_summary';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Outcomes:</b> what change do you expect to see after successful dissemination and exploitation of project results to the target group(s)?<div><b>Example 1:</b> Up-take by airports: 9 European airports adopt the advanced forecasting system demonstrated during the project.</div><div><b>Example 2:</b> High use of the scientific discovery published (measured with the relative rate of citation index of project publications). A major electronic company (Samsung or Apple) exploits/uses the new product in their manufacturing.</div>$g$, 5, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 5, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.impact_summary';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Impacts:</b> what are the expected wider scientific, economic and societal effects of the project contributing to the expected impacts outlined in the respective destination in the work programme?<div><b>Example 1:</b> Scientific: New breakthrough scientific discovery on passenger forecast modelling. Economic: Increased airport efficiency. Size: 15% increase of maximum passenger capacity in European airports, leading to a 28% reduction in infrastructure expansion costs.</div><div><b>Example 2:</b> Scientific: New breakthrough scientific discovery on transparent electronics. Economic/Technological: A new market for touch enabled electronic devices. Societal: Lower climate impact of electronics manufacturing (including through material sourcing and waste management).</div>$g$, 6, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 6, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b21.impact_summary';

  ---------------------------------------------------------------- B2.2
  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Describe the planned measures to maximise the impact of your project by providing a first version of your 'plan for the dissemination and exploitation including communication activities'. Describe the dissemination, exploitation and communication measures that are planned, and the target group(s) addressed (e.g. scientific community, end users, financial actors, public at large).<br>⚠ Please remember that this plan is an admissibility condition, unless the work programme topic explicitly states otherwise. In case your proposal is selected for funding, a more detailed 'plan for dissemination and exploitation including communication activities' will need to be provided as a mandatory project deliverable within 6 months after signature date. This plan shall be periodically updated in alignment with the project's progress.<br>⚠ Communication measures should promote the project throughout the full lifespan of the project. The aim is to inform and reach out to society and show the activities performed, and the use and the benefits the project will have for citizens. Activities must be strategically planned, with clear objectives, start at the outset and continue through the lifetime of the project. The description of the communication activities needs to state the main messages as well as the tools and channels that will be used to reach out to each of the chosen target groups. For further guidance on communicating EU research and innovation for project participants, please refer to the <a href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/om_en.pdf">Online Manual</a> on the Funding &amp; Tenders Portal.<br>⚠ All measures should be proportionate to the scale of the project, and should contain concrete actions to be implemented both during and after the end of the project, e.g. standardisation activities. Your plan should give due consideration to the possible follow-up of your project, once it is finished. In the justification, explain why each measure chosen is best suited to reach the target group addressed. Where relevant, and for innovation actions in particular, describe the measures for a plausible path to commercialise the innovations.<br>⚠ If exploitation is expected primarily in non-associated third countries, justify by explaining how that exploitation is still in the Union's interest.<br>⚠ Describe possible feedback to policy measures generated by the project that will contribute to designing, monitoring, reviewing and rectifying (if necessary) existing policy and programmatic measures or shaping and supporting the implementation of new policy initiatives and decisions.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b22.dec';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Outline your strategy for the management of intellectual property, foreseen protection measures, such as patents, design rights, copyright, trade secrets, etc., and how these would be used to support exploitation.<br>⚠ If your project is selected, you will need an appropriate consortium agreement to manage (amongst other things) the ownership and access to key knowledge (IPR, research data etc.). Where relevant, these will allow you, collectively and individually, to pursue market opportunities arising from the project.<br>⚠ If your project is selected, you must indicate the owner(s) of the results (results ownership list) in the final periodic report.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b22.ipr';

  ---------------------------------------------------------------- B3.1 overall structure (9 entries, one block)
  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Please provide a brief presentation of the overall structure of the work plan.<div>Since all parts of section 3.1 are compulsory, and on Sitra Proposal Studio all are autogenerated from other parts of the platform, apart from the milestones and risks tables, all of the guidelines for the other parts are summarised here.</div>$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b31.intro';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Figure 3.1.a — Pert chart.</b> Graphical presentation of the components showing how they inter-relate.$g$, 1, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 1, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b31.intro';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Figure 3.1.b — Gantt chart.</b> Timing of the different work packages and their components.$g$, 2, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 2, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b31.intro';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Table 3.1.a — List of work packages.</b>$g$, 3, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 3, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b31.intro';

  -- Entry 5 — also attached to the Table 3.1.b block, which the WP draft
  -- description field reads for its own field guidelines.
  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Table 3.1.b — Work package descriptions.</b><div>The work package descriptions should include the objectives and a description of work (where appropriate, broken down into tasks), lead partner and role of participants. For each task, quantify the amount of work. Provide enough detail to justify the resources requested and clarify why the work is needed and who will do it. Deliverables linked to each WP are listed in table 3.1c (no need to repeat the information here).<br>⚠ Give full details. Base your account on the logical structure of the project and the stages in which it is to be carried out. Each work package should be a substantial part of the work plan, and the number of work packages should be proportionate to the scale and complexity of the project.<br>⚠ Structure each work package by breaking it down into tasks. If tasks are not appropriate, work packages can be organised according to other criteria (e.g. according to the type of work or thematically). For each task or element of the work package, describe all activities to be carried out and quantify them (e.g. number of protocols, tests, measurements, combinations, study subjects, conferences, publications, etc.). Provide enough detail to clarify who will do this work and why it is needed for the project (e.g. the level of qualification and number of person-months for personnel, as well as the requested equipment, consumables, meetings, etc.), to justify the proposed resources and so that progress can be monitored, including by the Commission.<br>⚠ Resources assigned to work packages should be in line with their objectives and deliverables. You are advised to include a distinct work package on 'project management', and to give due visibility in the work plan to 'data management', 'dissemination and exploitation' and 'communication activities', either with distinct tasks or distinct work packages.</div>$g$, 4, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 4, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b31.intro';
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b31.table_b';

  -- Entry 6 — also attached to the Table 3.1.c block, read by the WP draft
  -- deliverables table.
  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Table 3.1.c — List of deliverables.</b><div><b>Deliverable numbers</b> in order of delivery dates. Please use the numbering convention &lt;WP number&gt;.&lt;number of deliverable within that WP&gt;. For example, deliverable 4.2 would be the second deliverable from work package 4.</div><div><b>Type:</b> Use one of the following codes:</div><div>• R: Document, report (excluding the periodic and final reports);</div><div>• DEM: Demonstrator, pilot, prototype, plan designs;</div><div>• DEC: Websites, patents filing, press &amp; media actions, videos, etc.;</div><div>• DATA: Data sets, microdata, etc.;</div><div>• DMP: Data management plan;</div><div>• ETHICS: Deliverables related to ethics issues;</div><div>• SECURITY: Deliverables related to security issues;</div><div>• OTHER: Software, technical diagram, algorithms, models, etc.</div><div><b>Dissemination level:</b> Use one of the following codes:</div><div>• PU – Public, fully open, e.g. web (Deliverables flagged as public will be automatically published in CORDIS project's page);</div><div>• SEN – Sensitive, limited under the conditions of the Grant Agreement;</div><div>• Classified R-UE/EU-R – EU RESTRICTED under the Commission Decision № 2015/444;</div><div>• Classified C-UE/EU-C – EU CONFIDENTIAL under the Commission Decision № 2015/444;</div><div>• Classified S-UE/EU-S – EU SECRET under the Commission Decision № 2015/444.</div><div><b>Delivery date:</b> Measured in months from the project start date (month 1).</div><div>⚠ You must include a data management plan (DMP) and a 'plan for dissemination and exploitation including communication activities' as distinct deliverables within the first 6 months of the project. The DMP will evolve during the lifetime of the project in order to present the status of the project's reflections on data management. A template for such a plan is available in the <a href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/om_en.pdf">Online Manual</a> on the Funding &amp; Tenders Portal.</div><div>⚠ You will be required to update the 'plan for the dissemination and exploitation of results including communication activities', and a 'data management plan' (this does not apply to topics where a plan was not required). This should include a record of activities related to dissemination and exploitation that have been undertaken and those still planned.</div>$g$, 5, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 5, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b31.intro';
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b31.table_c';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Table 3.1.f — Summary of staff effort.</b> Number of person months required.$g$, 6, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 6, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b31.intro';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Table 3.1.g — Subcontracting costs.</b> Description and justification of subcontracting costs for each participant.<div>⚠ Please make sure the information in this section matches the costs as stated in the budget table in section 3 of the application forms, and the number of person months shown in the detailed work package descriptions.</div>$g$, 7, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 7, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b31.intro';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$<b>Table 3.1.h — Purchase costs.</b> Justifications for equipment costs under 'purchase costs' for participants where those costs exceed 15% of the personnel costs, according to the budget table in Part A.<div>⚠ Please make sure the information in this section matches the costs as stated in the budget table in section 3 of the application forms, and the number of person months shown in the detailed work package descriptions.</div>$g$, 8, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 8, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b31.intro';

  ---------------------------------------------------------------- B3.2
  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Describe the consortium. How does it match the project's objectives, and bring together the necessary disciplinary and inter-disciplinary knowledge? Show how this includes expertise in social sciences and humanities, open science practices, and gender aspects of R&amp;I, as appropriate. Include in the description affiliated entities and associated partners, if any.<div>⚠ The individual participants of the consortium are described in a separate section under Part A. There is no need to repeat that information here.</div>$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b32.interdisciplinarity';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Show how the partners will have access to critical infrastructure needed to carry out the project activities.$g$, 1, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 1, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b32.interdisciplinarity';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Describe how the members complement one another.$g$, 2, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 2, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b32.interdisciplinarity';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$In what way does each of them contribute to the project? Show that each has a valid role, and adequate resources in the project to fulfil that role.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b32.capacity';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$Describe how the members cover the value chain, where appropriate.<div>If applicable, describe the industrial/commercial involvement in the project to ensure exploitation of the results and explain why this is consistent with and will help to achieve the specific measures which are proposed for exploitation of the results of the project (see section 2.2).</div>$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b32.value_chain_industrial';

  INSERT INTO public.card_guidelines (template_version_id, guideline_type, content, order_index, is_active)
  VALUES (v_ver, 'commission', $g$If one or more of the participants requesting EU funding is based in a country or is an international organisation that is not automatically eligible for such funding (entities from Member States of the EU, from Associated Countries and from one of the countries in the exhaustive list included in the Work Programme General Annexes B are automatically eligible for EU funding), explain why the participation of the entity in question is essential to successfully carry out the project.$g$, 0, true) RETURNING id INTO v_gid;
  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT v_gid, ct.id, 0, v_ver FROM public.card_templates ct WHERE ct.template_version_id = v_ver AND ct.key = 'b32.other_countries';
END
$seed$;