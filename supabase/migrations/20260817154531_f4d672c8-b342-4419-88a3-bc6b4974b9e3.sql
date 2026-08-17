
-- =========================================================
-- 1. CARD TEMPLATES for B1.1, B2.1, B2.2, B3.1, B3.2
-- =========================================================
INSERT INTO public.card_templates
  (template_type_id, section_source_id, section_number, document, key, kind, default_title,
   anchor, order_index, is_deletable, is_hideable, is_source_fed, default_visible, source_key,
   default_fields, default_table)
VALUES
-- B1.1
('33333333-3333-3333-3333-333333333333','00000000-0003-0001-0001-000000000002','B1.1','part_b','b11.background','text','Background','free',100,true,true,false,true,NULL,'[{"content_html":"","field_role":"narrative"}]'::jsonb,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0001-0001-000000000002','B1.1','part_b','b11.objectives','text','Objectives','free',101,false,true,false,true,NULL,'[{"content_html":"","field_role":"narrative"}]'::jsonb,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0001-0001-000000000002','B1.1','part_b','b11.sota','text','Advance beyond the state of the art','free',102,false,true,false,true,NULL,'[{"content_html":"","field_role":"narrative"}]'::jsonb,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0001-0001-000000000002','B1.1','part_b','b11.maturity','text','Research & innovation maturity','free',103,false,true,false,true,NULL,'[{"content_html":"","field_role":"narrative"}]'::jsonb,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0001-0001-000000000002','B1.1','part_b','b11.trl_table','table','TRL progression','free',104,true,true,false,true,NULL,NULL,'{"caption":"TRL progression","columns":["Component or result","TRL at start","TRL at end","Evidence"],"rows":1}'::jsonb),
('33333333-3333-3333-3333-333333333333','00000000-0003-0001-0001-000000000002','B1.1','part_b','b11.references','references','References','tail',1010,false,false,true,true,'b11.references',NULL,NULL),
-- B2.1
('33333333-3333-3333-3333-333333333333','00000000-0003-0002-0001-000000000002','B2.1','part_b','b21.outcomes','text','Expected outcomes','free',100,false,true,false,true,NULL,'[{"content_html":"","field_role":"narrative"}]'::jsonb,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0002-0001-000000000002','B2.1','part_b','b21.impacts','text','Expected impacts','free',101,false,true,false,true,NULL,'[{"content_html":"","field_role":"narrative"}]'::jsonb,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0002-0001-000000000002','B2.1','part_b','b21.key_pathways','text','Contributions to key impact pathways','free',102,true,true,false,true,NULL,'[{"content_html":"","field_role":"narrative"}]'::jsonb,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0002-0001-000000000002','B2.1','part_b','b21.impact_summary','table','Impact summary table','free',103,true,true,true,true,'b21.impact_summary',NULL,'{"caption":"Key elements of the impact section","captionAbovePart":1,"parts":[{"columns":["Target groups","Specific needs","Expected results"],"rows":1},{"columns":["DEC measures","Expected outcomes","Expected impacts"],"rows":1}]}'::jsonb),
('33333333-3333-3333-3333-333333333333','00000000-0003-0002-0001-000000000002','B2.1','part_b','b21.references','references','References','tail',1010,false,false,true,true,'b21.references',NULL,NULL),
-- B2.2
('33333333-3333-3333-3333-333333333333','00000000-0003-0002-0002-000000000002','B2.2','part_b','b22.dec','text','Dissemination, exploitation & communication','free',100,false,true,false,true,NULL,'[{"content_html":"","field_role":"narrative"}]'::jsonb,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0002-0002-000000000002','B2.2','part_b','b22.ipr','text','Management of intellectual property','free',101,true,true,false,true,NULL,'[{"content_html":"","field_role":"narrative"}]'::jsonb,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0002-0002-000000000002','B2.2','part_b','b22.references','references','References','tail',1010,false,false,true,true,'b22.references',NULL,NULL),
-- B3.1
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0001-000000000002','B3.1','part_b','b31.overview','text','Overall structure of the work plan','head',0,false,true,false,true,NULL,'[{"content_html":"","field_role":"narrative"}]'::jsonb,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0001-000000000002','B3.1','part_b','b31.gantt','figure','Gantt chart','tail',1000,false,true,true,true,'b31.gantt',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0001-000000000002','B3.1','part_b','b31.pert','figure','Pert chart','tail',1001,false,true,true,true,'b31.pert',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0001-000000000002','B3.1','part_b','b31.table_a','table','Table 3.1a — List of work packages','tail',1002,false,false,true,true,'b31.table_a',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0001-000000000002','B3.1','part_b','b31.table_b','table','Table 3.1b — Work package descriptions','tail',1003,false,false,true,true,'b31.table_b',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0001-000000000002','B3.1','part_b','b31.table_c','table','Table 3.1c — List of deliverables','tail',1004,false,false,true,true,'b31.table_c',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0001-000000000002','B3.1','part_b','b31.table_d','table','Table 3.1d — List of milestones','tail',1005,false,false,true,true,'b31.table_d',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0001-000000000002','B3.1','part_b','b31.table_e','table','Table 3.1e — Critical risks','tail',1006,false,false,true,true,'b31.table_e',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0001-000000000002','B3.1','part_b','b31.table_f','table','Table 3.1f — Summary of staff effort','tail',1007,false,false,true,true,'b31.table_f',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0001-000000000002','B3.1','part_b','b31.table_g','table','Table 3.1g — Subcontracting costs','tail',1008,false,true,true,true,'b31.table_g',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0001-000000000002','B3.1','part_b','b31.table_h','table','Table 3.1h — Purchase costs (equipment)','tail',1009,false,true,true,true,'b31.table_h',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0001-000000000002','B3.1','part_b','b31.references','references','References','tail',1010,false,false,true,true,'b31.references',NULL,NULL),
-- B3.2
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0002-000000000002','B3.2','part_b','b32.consortium','text','Consortium complementarity','free',100,false,true,false,true,NULL,'[{"content_html":"","field_role":"narrative"}]'::jsonb,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0002-000000000002','B3.2','part_b','b32.infrastructure','text','Access to critical infrastructure','free',101,false,true,true,true,'b32.infrastructure',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0002-000000000002','B3.2','part_b','b32.value_chain','text','Complementarity & value chain','free',102,false,true,true,true,'b32.value_chain',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0002-000000000002','B3.2','part_b','b32.roles','text','Role & resources of each participant','free',103,false,true,true,true,'b32.roles',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0002-000000000002','B3.2','part_b','b32.commercial','text','Industrial & commercial involvement','free',104,true,true,true,true,'b32.commercial',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0002-000000000002','B3.2','part_b','b32.non_eligible','text','Participation of non-eligible entities','free',105,true,true,true,true,'b32.non_eligible',NULL,NULL),
('33333333-3333-3333-3333-333333333333','00000000-0003-0003-0002-000000000002','B3.2','part_b','b32.references','references','References','tail',1010,false,false,true,true,'b32.references',NULL,NULL)
ON CONFLICT (template_type_id, key) DO UPDATE
  SET section_source_id = EXCLUDED.section_source_id,
      section_number    = EXCLUDED.section_number,
      kind              = EXCLUDED.kind,
      default_title     = EXCLUDED.default_title,
      anchor            = EXCLUDED.anchor,
      order_index       = EXCLUDED.order_index,
      is_deletable      = EXCLUDED.is_deletable,
      is_hideable       = EXCLUDED.is_hideable,
      is_source_fed     = EXCLUDED.is_source_fed,
      default_visible   = EXCLUDED.default_visible,
      source_key        = EXCLUDED.source_key,
      default_fields    = EXCLUDED.default_fields,
      default_table     = EXCLUDED.default_table;

-- B1.2 deletability corrected to match v5.1 (only linked activities and references are fixed).
UPDATE public.card_templates
   SET is_deletable = true
 WHERE template_type_id = '33333333-3333-3333-3333-333333333333'
   AND key IN ('b12.concepts','b12.methodologies','b12.interdisciplinarity','b12.ssh','b12.gender','b12.open_science');

UPDATE public.proposal_cards c
   SET is_deletable = true
 WHERE c.template_key IN ('b12.concepts','b12.methodologies','b12.interdisciplinarity','b12.ssh','b12.gender','b12.open_science');

-- =========================================================
-- 2. GUIDELINES (verbatim from HE RIA/IA Part B v5.1, 22.01.2026)
-- =========================================================
INSERT INTO public.card_guidelines (id, guideline_type, title, content, order_index) VALUES
-- Evaluation criteria
('ea000000-0000-4000-8000-000000000001','evaluation','Excellence — aspects to be taken into account',$g$Clarity and pertinence of the project’s objectives, and the extent to which the proposed work is ambitious, and goes beyond the state of the art.$g$,0),
('ea000000-0000-4000-8000-000000000002','evaluation','Excellence — aspects to be taken into account',$g$Soundness of the proposed methodology, including the underlying concepts, models, assumptions, interdisciplinary approaches, appropriate consideration of the gender dimension in research and innovation content, and the quality of open science practices, including sharing and management of research outputs and engagement of citizens, civil society and end users where appropriate.$g$,0),
('ea000000-0000-4000-8000-000000000003','evaluation','Impact — aspects to be taken into account',$g$Credibility of the pathways to achieve the expected outcomes and impacts specified in the work programme.$g$,0),
('ea000000-0000-4000-8000-000000000004','evaluation','Impact — aspects to be taken into account',$g$Suitability and quality of the measures to maximise expected outcomes and impacts, as set out in the dissemination and exploitation plan, including communication activities.$g$,0),
('ea000000-0000-4000-8000-000000000005','evaluation','Quality and efficiency of the implementation — aspects to be taken into account',$g$Quality and effectiveness of the work plan, assessment of risks, and appropriateness of the effort assigned to work packages, and the resources overall$g$,0),
('ea000000-0000-4000-8000-000000000006','evaluation','Quality and efficiency of the implementation — aspects to be taken into account',$g$Capacity and role of each participant, and extent to which the consortium as a whole brings together the necessary expertise.$g$,0),

-- 1.1 Objectives and ambition [e.g. 4 pages]
('c1100000-0000-4000-8000-000000000001','commission',NULL,$g$Briefly describe the objectives of your proposed work. Why are they pertinent to the work programme topic? Are they measurable and verifiable? Are they realistically achievable?$g$,10),
('c1100000-0000-4000-8000-000000000002','commission',NULL,$g$Describe how your project goes beyond the state-of-the-art, and the extent the proposed work is ambitious. Indicate any exceptional ground-breaking R&I, novel concepts and approaches, new products, services or business and organisational models. Where relevant, illustrate the advance by referring to products and services already available on the market. Refer to any patent or publication search carried out.$g$,10),
('c1100000-0000-4000-8000-000000000003','commission',NULL,$g$Describe where the proposed work is positioned in terms of R&I maturity (i.e. where it is situated in the spectrum from ‘idea to application’, or from ‘lab to market’). Where applicable, provide an indication of the Technology Readiness Level, if possible distinguishing the start and by the end of the project.$g$,10),
('c1100000-0000-4000-8000-000000000004','commission','Note',$g$Please bear in mind that advances beyond the state of the art must be interpreted in the light of the positioning of the project. Expectations will not be the same for RIAs at lower TRL, compared with Innovation Actions at high TRLs.$g$,11),

-- 1.2 Methodology [e.g. 14 pages]
('c1200000-0000-4000-8000-000000000001','commission','10 pages combined across both blocks',$g$Describe and explain the overall methodology, including the concepts, models and assumptions that underpin your work. Explain how this will enable you to deliver your project’s objectives. Refer to any important challenges you may have identified in the chosen methodology and how you intend to overcome them. [e.g. 10 pages]$g$,10),
('c1200000-0000-4000-8000-000000000002','commission','Note',$g$This section should be presented as a narrative. The detailed tasks and work packages are described below under ‘Implementation’.$g$,11),
('c1200000-0000-4000-8000-000000000003','commission',NULL,$g$Describe any national or international research and innovation activities whose results will feed into the project, and how that link will be established. [e.g. 1 page]$g$,10),
('c1200000-0000-4000-8000-000000000004','commission',NULL,$g$Explain how expertise and methods from different disciplines will be brought together and integrated in pursuit of your objectives. If you consider that an inter-disciplinary approach is unnecessary in the context of the proposed work, please provide a justification. [e.g. 1/2 page]$g$,10),
('c1200000-0000-4000-8000-000000000005','commission',NULL,$g$For topics where the work programme indicates the need for the integration of social sciences and humanities, show the role of these disciplines in the project or provide a justification if you consider that these disciplines are not relevant to your proposed project. [e.g. 1/2 page]$g$,10),
('c1200000-0000-4000-8000-000000000006','commission',NULL,$g$Describe how the gender dimension (i.e. sex and/or gender analysis) is taken into account in the project’s research and innovation content [e.g. 1 page]. If you do not consider such a gender dimension to be relevant in your project, please provide a justification.$g$,10),
('c1200000-0000-4000-8000-000000000007','commission','Note',$g$Note: This section is mandatory except for topics which have been identified in the work programme as not requiring the integration of the gender dimension into R&I content.$g$,11),
('c1200000-0000-4000-8000-000000000008','commission','Note',$g$Remember that that this question relates to the content of the planned research and innovation activities, and not to gender balance in the teams in charge of carrying out the project.$g$,12),
('c1200000-0000-4000-8000-000000000009','commission','Note',$g$Sex and gender analysis refers to biological characteristics and social/cultural factors respectively. For guidance on methods of sex / gender analysis and the issues to be taken into account, please refer to https://op.europa.eu/en/publication-detail/-/publication/33b4c99f-2e66-11eb-b27b-01aa75ed71a1/language-en$g$,13),
('c1200000-0000-4000-8000-000000000010','commission',NULL,$g$Describe how appropriate open science practices are implemented as an integral part of the proposed methodology. Show how the choice of practices and their implementation are adapted to the nature of your work, in a way that will increase the chances of the project delivering on its objectives [e.g. 1 page]. If you believe that none of these practices are appropriate for your project, please provide a justification here.$g$,10),
('c1200000-0000-4000-8000-000000000011','commission','Note',$g$Open science is an approach based on open cooperative work and systematic sharing of knowledge and tools as early and widely as possible in the process. Open science practices include early and open sharing of research (for example through preregistration, registered reports, pre-prints, or crowd-sourcing); research output management; measures to ensure reproducibility of research outputs; providing open access to research outputs (such as publications, data, software, models, algorithms, and workflows); participation in open peer-review; and involving all relevant knowledge actors including citizens, civil society and end users in the co-creation of R&I agendas and contents (such as citizen science).$g$,11),
('c1200000-0000-4000-8000-000000000012','commission','Note',$g$Please note that this question does not refer to outreach actions that may be planned as part of communication, dissemination and exploitation activities. These aspects should instead be described below under ‘Impact’.$g$,12),
('c1200000-0000-4000-8000-000000000013','commission','Note',$g$Proposals selected for funding under Horizon Europe will need to develop a detailed data management plan (DMP) for making their data/research outputs findable, accessible, interoperable and reusable (FAIR) as a deliverable by month 6 and revised towards the end of a project’s lifetime. The DMP should describe how research outputs (especially research data) generated and/or collected during the project will be managed so as to ensure that they are findable, accessible, interoperable and reusable. For guidance on open science practices and research data management, please refer to the relevant section of the HE Programme Guide on the Funding & Tenders Portal.$g$,13),

-- 2.1 Project’s pathways towards impact [e.g. 3 pages]
('c2100000-0000-4000-8000-000000000001','commission',NULL,$g$Provide a narrative explaining how the project’s results are expected to make a difference in terms of impact, beyond the immediate scope and duration of the project. The narrative should include the components below, tailored to your project.$g$,10),
('c2100000-0000-4000-8000-000000000002','commission',NULL,$g$(a) Describe the unique contribution your project results would make towards (1) the outcomes specified in this topic, and (2) the wider impacts, in the longer term, specified in the respective destinations in the work programme. Provide quantified estimates where possible and meaningful.$g$,11),
('c2100000-0000-4000-8000-000000000003','commission','Note',$g$Be specific, referring to the effects of your project, and not R&I in general in this field.$g$,12),
('c2100000-0000-4000-8000-000000000004','commission','Note',$g$State the target groups that would benefit. Even if target groups are mentioned in general terms in the work programme, you should be specific here, breaking target groups into particular interest groups or segments of society relevant to this project.$g$,13),
('c2100000-0000-4000-8000-000000000005','commission',NULL,$g$(b) Describe any requirements and potential barriers - arising from factors beyond the scope and duration of the project - that may determine whether the desired outcomes and impacts are achieved. These may include, for example, other R&I work within and beyond Horizon Europe; regulatory environment; targeted markets; user behaviour. Indicate if these factors might evolve over time. Describe any mitigating measures you propose, within or beyond your project, that could be needed should your assumptions prove to be wrong, or to address identified barriers.$g$,14),
('c2100000-0000-4000-8000-000000000006','commission','Note',$g$Note that this does not include the critical risks inherent to the management of the project itself, which should be described below under ‘Implementation’.$g$,15),
-- 2.1 impact summary table column prompts (from the template’s optional §2.3 canvas)
('c2100000-0000-4000-8000-000000000011','commission','Target groups',$g$Who will use or further up-take the results of the project? Who will benefit from the results of the project?$g$,20),
('c2100000-0000-4000-8000-000000000012','commission','Specific needs',$g$What are the specific needs that triggered this project?$g$,21),
('c2100000-0000-4000-8000-000000000013','commission','Expected results',$g$What do you expect to generate by the end of the project?$g$,22),
('c2100000-0000-4000-8000-000000000014','commission','D & E & C measures',$g$What dissemination, exploitation and communication measures will you apply to the results?$g$,23),
('c2100000-0000-4000-8000-000000000015','commission','Outcomes',$g$What change do you expect to see after successful dissemination and exploitation of project results to the target group(s)?$g$,24),
('c2100000-0000-4000-8000-000000000016','commission','Impacts',$g$What are the expected wider scientific, economic and societal effects of the project contributing to the expected impacts outlined in the respective destination in the work programme?$g$,25),

-- 2.2 Measures to maximise impact [e.g. 3 pages, excluding section 2.3]
('c2200000-0000-4000-8000-000000000001','commission',NULL,$g$Describe the planned measures to maximise the impact of your project by providing a first version of your ‘plan for the dissemination and exploitation including communication activities’. Describe the dissemination, exploitation and communication measures that are planned, and the target group(s) addressed (e.g. scientific community, end users, financial actors, public at large).$g$,10),
('c2200000-0000-4000-8000-000000000002','commission','Note',$g$Please remember that this plan is an admissibility condition, unless the work programme topic explicitly states otherwise. In case your proposal is selected for funding, a more detailed ‘plan for dissemination and exploitation including communication activities’ will need to be provided as a mandatory project deliverable within 6 months after signature date. This plan shall be periodically updated in alignment with the project’s progress.$g$,11),
('c2200000-0000-4000-8000-000000000003','commission','Note',$g$Communication measures should promote the project throughout the full lifespan of the project. The aim is to inform and reach out to society and show the activities performed, and the use and the benefits the project will have for citizens. Activities must be strategically planned, with clear objectives, start at the outset and continue through the lifetime of the project. The description of the communication activities needs to state the main messages as well as the tools and channels that will be used to reach out to each of the chosen target groups.$g$,12),
('c2200000-0000-4000-8000-000000000004','commission','Note',$g$All measures should be proportionate to the scale of the project, and should contain concrete actions to be implemented both during and after the end of the project, e.g. standardisation activities. Your plan should give due consideration to the possible follow-up of your project, once it is finished. In the justification, explain why each measure chosen is best suited to reach the target group addressed. Where relevant, and for innovation actions, in particular, describe the measures for a plausible path to commercialise the innovations.$g$,13),
('c2200000-0000-4000-8000-000000000005','commission','Note',$g$If exploitation is expected primarily in non-associated third countries, justify by explaining how that exploitation is still in the Union’s interest.$g$,14),
('c2200000-0000-4000-8000-000000000006','commission','Note',$g$Describe possible feedback to policy measures generated by the project that will contribute to designing, monitoring, reviewing and rectifying (if necessary) existing policy and programmatic measures or shaping and supporting the implementation of new policy initiatives and decisions.$g$,15),
('c2200000-0000-4000-8000-000000000007','commission',NULL,$g$Outline your strategy for the management of intellectual property, foreseen protection measures, such as patents, design rights, copyright, trade secrets, etc., and how these would be used to support exploitation.$g$,10),
('c2200000-0000-4000-8000-000000000008','commission','Note',$g$If your project is selected, you will need an appropriate consortium agreement to manage (amongst other things) the ownership and access to key knowledge (IPR, research data etc.). Where relevant, these will allow you, collectively and individually, to pursue market opportunities arising from the project.$g$,11),
('c2200000-0000-4000-8000-000000000009','commission','Note',$g$If your project is selected, you must indicate the owner(s) of the results (results ownership list) in the final periodic report.$g$,12),

-- 3.1 Work plan and resources [e.g. 12 pages (17 pages for topics using lump sum funding) – including tables]
('c3100000-0000-4000-8000-000000000001','commission',NULL,$g$Please provide the following: brief presentation of the overall structure of the work plan;$g$,10),
('c3100000-0000-4000-8000-000000000002','commission','Note',$g$Give full details. Base your account on the logical structure of the project and the stages in which it is to be carried out. Each work package should be a substantial part of the work plan, and the number of work packages should be proportionate to the scale and complexity of the project.$g$,11),
('c3100000-0000-4000-8000-000000000003','commission',NULL,$g$timing of the different work packages and their components (Gantt chart or similar);$g$,10),
('c3100000-0000-4000-8000-000000000004','commission',NULL,$g$graphical presentation of the components showing how they inter-relate (Pert chart or similar).$g$,10),
('c3100000-0000-4000-8000-000000000005','commission',NULL,$g$detailed work description, i.e.: a list of work packages (table 3.1a);$g$,10),
('c3100000-0000-4000-8000-000000000006','commission',NULL,$g$detailed work description, i.e.: a description of each work package (table 3.1b);$g$,10),
('c3100000-0000-4000-8000-000000000007','commission',NULL,$g$detailed work description, i.e.: a list of deliverables (table 3.1c);$g$,10),
('c3100000-0000-4000-8000-000000000008','commission','Note',$g$Structure each work package by breaking it down into tasks. If tasks are not appropriate, work packages can be organised according to other criteria (e.g., according to the type of work or thematically). For each task or element of the work package, describe all activities to be carried out and quantify them (e.g., number of protocols, tests, measurements, combinations, study subjects, conferences, publications, etc.). Provide enough detail to clarify who will do this work and why it is needed for the project, (e.g., the level of qualification and number of person-months for personnel, as well as the requested equipment, consumables, meetings, etc.), to justify the proposed resources and so that progress can be monitored, including by the Commission$g$,11),
('c3100000-0000-4000-8000-000000000009','commission','Note',$g$Resources assigned to work packages should be in line with their objectives and deliverables. You are advised to include a distinct work package on ‘project management’, and to give due visibility in the work plan to ‘data management’ ‘dissemination and exploitation’ and ‘communication activities’, either with distinct tasks or distinct work packages.$g$,12),
('c3100000-0000-4000-8000-000000000010','commission','Note',$g$You will be required to update the ‘plan for the dissemination and exploitation of results including communication activities’, and a ‘data management plan’, (this does not apply to topics where a plan was not required.) This should include a record of activities related to dissemination and exploitation that have been undertaken and those still planned.$g$,13),
('c3100000-0000-4000-8000-000000000011','commission','Note',$g$Please make sure the information in this section matches the costs as stated in the budget table in section 3 of the application forms, and the number of person months, shown in the detailed work package descriptions.$g$,14),
('c3100000-0000-4000-8000-000000000012','commission',NULL,$g$a list of milestones (table 3.1d);$g$,10),
('c3100000-0000-4000-8000-000000000013','commission',NULL,$g$a list of critical risks, relating to project implementation, that the stated project's objectives may not be achieved. Detail any risk mitigation measures. You will be able to update the list of critical risks and mitigation measures as the project progresses (table 3.1e);$g$,10),
('c3100000-0000-4000-8000-000000000014','commission',NULL,$g$a table showing number of person months required (table 3.1f);$g$,10),
('c3100000-0000-4000-8000-000000000015','commission',NULL,$g$a table showing description and justification of subcontracting costs for each participant (table 3.1g);$g$,10),
('c3100000-0000-4000-8000-000000000016','commission',NULL,$g$a table showing justifications for equipment costs under ‘purchase costs’ (table 3.1h) for participants where those costs exceed 15% of the personnel costs (according to the budget table in proposal part A);$g$,10),
('c3100000-0000-4000-8000-000000000017','commission','Tables for section 3.1',$g$Use plain text for the tables in section 3.1. If the proposal is invited to start Grant Agreement preparation, these tables will have to be encoded in the grant management IT tool, where no graphics or special formats are supported.$g$,1),

-- 3.2 Capacity of participants and consortium as a whole [e.g. 3 pages]
('c3200000-0000-4000-8000-000000000001','commission','Note',$g$The individual participants of the consortium are described in a separate section under Part A. There is no need to repeat that information here.$g$,1),
('c3200000-0000-4000-8000-000000000002','commission',NULL,$g$Describe the consortium. How does it match the project’s objectives, and bring together the necessary disciplinary and inter-disciplinary knowledge? Show how this includes expertise in social sciences and humanities, open science practices, and gender aspects of R&I, as appropriate. Include in the description affiliated entities and associated partners, if any.$g$,10),
('c3200000-0000-4000-8000-000000000003','commission',NULL,$g$Show how the partners will have access to critical infrastructure needed to carry out the project activities.$g$,10),
('c3200000-0000-4000-8000-000000000004','commission',NULL,$g$Describe how the members complement one another (and cover the value chain, where appropriate)$g$,10),
('c3200000-0000-4000-8000-000000000005','commission',NULL,$g$In what way does each of them contribute to the project? Show that each has a valid role, and adequate resources in the project to fulfil that role.$g$,10),
('c3200000-0000-4000-8000-000000000006','commission',NULL,$g$If applicable, describe the industrial/commercial involvement in the project to ensure exploitation of the results and explain why this is consistent with and will help to achieve the specific measures which are proposed for exploitation of the results of the project (see section 2.2).$g$,10),
('c3200000-0000-4000-8000-000000000007','commission',NULL,$g$Other countries and international organisations: If one or more of the participants requesting EU funding is based in a country or is an international organisation that is not automatically eligible for such funding (entities from Member States of the EU, from Associated Countries and from one of the countries in the exhaustive list included in the Work Programme General Annexes B are automatically eligible for EU funding), explain why the participation of the entity in question is essential to successfully carry out the project.$g$,10),

-- Sitra guidance placeholders (blocks with no Commission wording of their own)
('c5000000-0000-4000-8000-000000000001','sitra','Sitra guidance',$g$Sitra convention: the template has no bullet for a background block. Set the scene for the topic and the problem the project addresses, then hand over to the objectives block. Keep it short — it counts against the four indicative pages for 1.1.$g$,100),
('c5000000-0000-4000-8000-000000000002','sitra','Sitra guidance',$g$Sitra guidance to be authored.$g$,100),
('c5000000-0000-4000-8000-000000000003','sitra','Sitra guidance',$g$Sitra convention: v5.1 Part B contains no bullet on key impact pathways. Map the project’s contribution to the key impact pathways of the work programme destination, keeping it consistent with the outcomes and impacts described above.$g$,100),
('c5000000-0000-4000-8000-000000000004','sitra','Sitra guidance',$g$Sitra convention: references are not required by the template. An empty references block is suppressed from the export.$g$,100)
ON CONFLICT (id) DO UPDATE
  SET guideline_type = EXCLUDED.guideline_type,
      title          = EXCLUDED.title,
      content        = EXCLUDED.content,
      order_index    = EXCLUDED.order_index,
      is_active      = true;

-- =========================================================
-- 3. GUIDELINE -> BLOCK TEMPLATE JOINS
-- =========================================================
INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index)
SELECT v.gid::uuid, t.id, v.ord
FROM (VALUES
-- 1.1
('ea000000-0000-4000-8000-000000000001','b11.objectives',0),
('ea000000-0000-4000-8000-000000000001','b11.sota',0),
('ea000000-0000-4000-8000-000000000001','b11.maturity',0),
('ea000000-0000-4000-8000-000000000001','b11.trl_table',0),
('c1100000-0000-4000-8000-000000000001','b11.objectives',10),
('c1100000-0000-4000-8000-000000000002','b11.sota',10),
('c1100000-0000-4000-8000-000000000003','b11.maturity',10),
('c1100000-0000-4000-8000-000000000004','b11.maturity',11),
('c1100000-0000-4000-8000-000000000003','b11.trl_table',10),
('c5000000-0000-4000-8000-000000000001','b11.background',100),
('c5000000-0000-4000-8000-000000000002','b11.objectives',100),
('c5000000-0000-4000-8000-000000000002','b11.sota',100),
('c5000000-0000-4000-8000-000000000002','b11.maturity',100),
('c5000000-0000-4000-8000-000000000002','b11.trl_table',100),
('c5000000-0000-4000-8000-000000000004','b11.references',100),
-- 1.2
('ea000000-0000-4000-8000-000000000002','b12.concepts',0),
('ea000000-0000-4000-8000-000000000002','b12.methodologies',0),
('ea000000-0000-4000-8000-000000000002','b12.linked_activities',0),
('ea000000-0000-4000-8000-000000000002','b12.interdisciplinarity',0),
('ea000000-0000-4000-8000-000000000002','b12.ssh',0),
('ea000000-0000-4000-8000-000000000002','b12.gender',0),
('ea000000-0000-4000-8000-000000000002','b12.open_science',0),
('c1200000-0000-4000-8000-000000000001','b12.concepts',10),
('c1200000-0000-4000-8000-000000000002','b12.concepts',11),
('c1200000-0000-4000-8000-000000000001','b12.methodologies',10),
('c1200000-0000-4000-8000-000000000002','b12.methodologies',11),
('c1200000-0000-4000-8000-000000000003','b12.linked_activities',10),
('c1200000-0000-4000-8000-000000000004','b12.interdisciplinarity',10),
('c1200000-0000-4000-8000-000000000005','b12.ssh',10),
('c1200000-0000-4000-8000-000000000006','b12.gender',10),
('c1200000-0000-4000-8000-000000000007','b12.gender',11),
('c1200000-0000-4000-8000-000000000008','b12.gender',12),
('c1200000-0000-4000-8000-000000000009','b12.gender',13),
('c1200000-0000-4000-8000-000000000010','b12.open_science',10),
('c1200000-0000-4000-8000-000000000011','b12.open_science',11),
('c1200000-0000-4000-8000-000000000012','b12.open_science',12),
('c1200000-0000-4000-8000-000000000013','b12.open_science',13),
('c5000000-0000-4000-8000-000000000004','b12.references',100),
-- 2.1
('ea000000-0000-4000-8000-000000000003','b21.outcomes',0),
('ea000000-0000-4000-8000-000000000003','b21.impacts',0),
('ea000000-0000-4000-8000-000000000003','b21.key_pathways',0),
('ea000000-0000-4000-8000-000000000003','b21.impact_summary',0),
('c2100000-0000-4000-8000-000000000001','b21.outcomes',10),
('c2100000-0000-4000-8000-000000000002','b21.outcomes',11),
('c2100000-0000-4000-8000-000000000003','b21.outcomes',12),
('c2100000-0000-4000-8000-000000000004','b21.outcomes',13),
('c2100000-0000-4000-8000-000000000005','b21.outcomes',14),
('c2100000-0000-4000-8000-000000000006','b21.outcomes',15),
('c2100000-0000-4000-8000-000000000001','b21.impacts',10),
('c2100000-0000-4000-8000-000000000002','b21.impacts',11),
('c2100000-0000-4000-8000-000000000003','b21.impacts',12),
('c2100000-0000-4000-8000-000000000004','b21.impacts',13),
('c2100000-0000-4000-8000-000000000005','b21.impacts',14),
('c2100000-0000-4000-8000-000000000006','b21.impacts',15),
('c2100000-0000-4000-8000-000000000001','b21.impact_summary',10),
('c2100000-0000-4000-8000-000000000002','b21.impact_summary',11),
('c2100000-0000-4000-8000-000000000005','b21.impact_summary',12),
('c2100000-0000-4000-8000-000000000011','b21.impact_summary',20),
('c2100000-0000-4000-8000-000000000012','b21.impact_summary',21),
('c2100000-0000-4000-8000-000000000013','b21.impact_summary',22),
('c2100000-0000-4000-8000-000000000014','b21.impact_summary',23),
('c2100000-0000-4000-8000-000000000015','b21.impact_summary',24),
('c2100000-0000-4000-8000-000000000016','b21.impact_summary',25),
('c5000000-0000-4000-8000-000000000003','b21.key_pathways',100),
('c5000000-0000-4000-8000-000000000004','b21.references',100),
-- 2.2
('ea000000-0000-4000-8000-000000000004','b22.dec',0),
('ea000000-0000-4000-8000-000000000004','b22.ipr',0),
('c2200000-0000-4000-8000-000000000001','b22.dec',10),
('c2200000-0000-4000-8000-000000000002','b22.dec',11),
('c2200000-0000-4000-8000-000000000003','b22.dec',12),
('c2200000-0000-4000-8000-000000000004','b22.dec',13),
('c2200000-0000-4000-8000-000000000005','b22.dec',14),
('c2200000-0000-4000-8000-000000000006','b22.dec',15),
('c2200000-0000-4000-8000-000000000007','b22.ipr',10),
('c2200000-0000-4000-8000-000000000008','b22.ipr',11),
('c2200000-0000-4000-8000-000000000009','b22.ipr',12),
('c5000000-0000-4000-8000-000000000004','b22.references',100),
-- 3.1
('ea000000-0000-4000-8000-000000000005','b31.overview',0),
('ea000000-0000-4000-8000-000000000005','b31.gantt',0),
('ea000000-0000-4000-8000-000000000005','b31.pert',0),
('ea000000-0000-4000-8000-000000000005','b31.table_a',0),
('ea000000-0000-4000-8000-000000000005','b31.table_b',0),
('ea000000-0000-4000-8000-000000000005','b31.table_c',0),
('ea000000-0000-4000-8000-000000000005','b31.table_d',0),
('ea000000-0000-4000-8000-000000000005','b31.table_e',0),
('ea000000-0000-4000-8000-000000000005','b31.table_f',0),
('ea000000-0000-4000-8000-000000000005','b31.table_g',0),
('ea000000-0000-4000-8000-000000000005','b31.table_h',0),
('c3100000-0000-4000-8000-000000000001','b31.overview',10),
('c3100000-0000-4000-8000-000000000002','b31.overview',11),
('c3100000-0000-4000-8000-000000000003','b31.gantt',10),
('c3100000-0000-4000-8000-000000000004','b31.pert',10),
('c3100000-0000-4000-8000-000000000005','b31.table_a',10),
('c3100000-0000-4000-8000-000000000008','b31.table_a',11),
('c3100000-0000-4000-8000-000000000009','b31.table_a',12),
('c3100000-0000-4000-8000-000000000010','b31.table_a',13),
('c3100000-0000-4000-8000-000000000011','b31.table_a',14),
('c3100000-0000-4000-8000-000000000006','b31.table_b',10),
('c3100000-0000-4000-8000-000000000008','b31.table_b',11),
('c3100000-0000-4000-8000-000000000009','b31.table_b',12),
('c3100000-0000-4000-8000-000000000010','b31.table_b',13),
('c3100000-0000-4000-8000-000000000011','b31.table_b',14),
('c3100000-0000-4000-8000-000000000007','b31.table_c',10),
('c3100000-0000-4000-8000-000000000008','b31.table_c',11),
('c3100000-0000-4000-8000-000000000009','b31.table_c',12),
('c3100000-0000-4000-8000-000000000010','b31.table_c',13),
('c3100000-0000-4000-8000-000000000011','b31.table_c',14),
('c3100000-0000-4000-8000-000000000012','b31.table_d',10),
('c3100000-0000-4000-8000-000000000013','b31.table_e',10),
('c3100000-0000-4000-8000-000000000014','b31.table_f',10),
('c3100000-0000-4000-8000-000000000015','b31.table_g',10),
('c3100000-0000-4000-8000-000000000016','b31.table_h',10),
('c5000000-0000-4000-8000-000000000004','b31.references',100),
-- 3.2
('ea000000-0000-4000-8000-000000000006','b32.consortium',0),
('ea000000-0000-4000-8000-000000000006','b32.infrastructure',0),
('ea000000-0000-4000-8000-000000000006','b32.value_chain',0),
('ea000000-0000-4000-8000-000000000006','b32.roles',0),
('ea000000-0000-4000-8000-000000000006','b32.commercial',0),
('ea000000-0000-4000-8000-000000000006','b32.non_eligible',0),
('c3200000-0000-4000-8000-000000000002','b32.consortium',10),
('c3200000-0000-4000-8000-000000000003','b32.infrastructure',10),
('c3200000-0000-4000-8000-000000000004','b32.value_chain',10),
('c3200000-0000-4000-8000-000000000005','b32.roles',10),
('c3200000-0000-4000-8000-000000000006','b32.commercial',10),
('c3200000-0000-4000-8000-000000000007','b32.non_eligible',10),
('c5000000-0000-4000-8000-000000000004','b32.references',100)
) AS v(gid, tkey, ord)
JOIN public.card_templates t
  ON t.key = v.tkey AND t.template_type_id = '33333333-3333-3333-3333-333333333333'
ON CONFLICT (guideline_id, card_template_id) DO UPDATE SET order_index = EXCLUDED.order_index;

-- =========================================================
-- 4. GUIDELINE -> SECTION JOINS (section-wide guidance)
-- =========================================================
INSERT INTO public.card_guideline_sections (guideline_id, section_source_id)
VALUES
  ('c3100000-0000-4000-8000-000000000017','00000000-0003-0003-0001-000000000002'),
  ('c3200000-0000-4000-8000-000000000001','00000000-0003-0003-0002-000000000002')
ON CONFLICT (guideline_id, section_source_id) DO NOTHING;
