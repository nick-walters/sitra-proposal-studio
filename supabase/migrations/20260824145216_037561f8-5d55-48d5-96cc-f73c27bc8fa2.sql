
ALTER TABLE public.card_guidelines DROP CONSTRAINT IF EXISTS card_guidelines_guideline_type_check;
ALTER TABLE public.card_guidelines ADD CONSTRAINT card_guidelines_guideline_type_check
  CHECK (guideline_type IN ('evaluation','commission','sitra','criteria'));

-- 1. Criteria become their own category, attached at SECTION level
UPDATE public.card_guidelines SET guideline_type = 'criteria' WHERE guideline_type = 'evaluation';

DELETE FROM public.card_guideline_templates
WHERE guideline_id IN (
  'ea000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000002',
  'ea000000-0000-4000-8000-000000000003','ea000000-0000-4000-8000-000000000004',
  'ea000000-0000-4000-8000-000000000005','ea000000-0000-4000-8000-000000000006');

INSERT INTO public.card_guideline_sections (guideline_id, section_source_id) VALUES
  ('ea000000-0000-4000-8000-000000000001','00000000-0003-0001-0001-000000000002'),
  ('ea000000-0000-4000-8000-000000000002','00000000-0003-0001-0002-000000000002'),
  ('ea000000-0000-4000-8000-000000000003','00000000-0003-0002-0001-000000000002'),
  ('ea000000-0000-4000-8000-000000000004','00000000-0003-0002-0002-000000000002'),
  ('ea000000-0000-4000-8000-000000000005','00000000-0003-0003-0001-000000000002'),
  ('ea000000-0000-4000-8000-000000000006','00000000-0003-0003-0002-000000000002')
ON CONFLICT (guideline_id, section_source_id) DO NOTHING;

UPDATE public.card_guidelines
SET content = 'Soundness of the proposed methodology, including the underlying concepts, models, assumptions, interdisciplinary approaches, appropriate consideration of the gender dimension in research and innovation content, and the quality of open science practices, including sharing and management of research outputs and engagement of citizens, civil society and end users where appropriate.',
    title = NULL
WHERE id = 'ea000000-0000-4000-8000-000000000002';

-- 2. Replace B1.2 Commission guidance
DELETE FROM public.card_guideline_templates
WHERE card_template_id IN (
  SELECT id FROM public.card_templates WHERE key LIKE 'b12.%'
);

DELETE FROM public.card_guidelines
WHERE id::text LIKE 'c1200000-%';

INSERT INTO public.card_guidelines (id, guideline_type, title, content, order_index) VALUES
('c1200001-0000-4000-8000-000000000001','commission',NULL,
 'Describe and explain the overall methodology, including the concepts, models and assumptions that underpin your work. Explain how this will enable you to deliver your project''s objectives. Refer to any important challenges you may have identified in the chosen methodology and how you intend to overcome them. [e.g. 10 pages]<br><br>⚠ This section should be presented as a narrative. The detailed tasks and work packages are described below under ''Implementation''.',0),
('c1200001-0000-4000-8000-000000000002','commission',NULL,
 'Describe any national or international research and innovation activities whose results will feed into the project, and how that link will be established. [e.g. 1 page]',0),
('c1200001-0000-4000-8000-000000000003','commission',NULL,
 'Explain how expertise and methods from different disciplines will be brought together and integrated in pursuit of your objectives. If you consider that an inter-disciplinary approach is unnecessary in the context of the proposed work, please provide a justification. [e.g. 1/2 page]',0),
('c1200001-0000-4000-8000-000000000004','commission',NULL,
 'For topics where the work programme indicates the need for the integration of social sciences and humanities, show the role of these disciplines in the project or provide a justification if you consider that these disciplines are not relevant to your proposed project. [e.g. 1/2 page]',0),
('c1200001-0000-4000-8000-000000000005','commission',NULL,
 'Describe how the gender dimension (i.e. sex and/or gender analysis) is taken into account in the project''s research and innovation content [e.g. 1 page]. If you do not consider such a gender dimension to be relevant in your project, please provide a justification.<br><br>⚠ Note: This section is mandatory except for topics which have been identified in the work programme as not requiring the integration of the gender dimension into R&amp;I content.<br><br>⚠ Remember that that this question relates to the content of the planned research and innovation activities, and not to gender balance in the teams in charge of carrying out the project.<br><br>⚠ Sex and gender analysis refers to biological characteristics and social/cultural factors respectively. For guidance on methods of sex / gender analysis and the issues to be taken into account, please refer to <a href="https://op.europa.eu/en/publication-detail/-/publication/33b4c99f-2e66-11eb-b27b-01aa75ed71a1/language-en">this publication</a>.',0),
('c1200001-0000-4000-8000-000000000006','commission',NULL,
 'Describe how appropriate open science practices are implemented as an integral part of the proposed methodology. Show how the choice of practices and their implementation are adapted to the nature of your work, in a way that will increase the chances of the project delivering on its objectives [e.g. 1 page]. If you believe that none of these practices are appropriate for your project, please provide a justification here.<br><br>⚠ Open science is an approach based on open cooperative work and systematic sharing of knowledge and tools as early and widely as possible in the process. Open science practices include early and open sharing of research (for example through preregistration, registered reports, pre-prints, or crowd-sourcing); research output management; measures to ensure reproducibility of research outputs; providing open access to research outputs (such as publications, data, software, models, algorithms, and workflows); participation in open peer-review; and involving all relevant knowledge actors including citizens, civil society and end users in the co-creation of R&amp;I agendas and contents (such as citizen science).<br><br>⚠ Please note that this question does not refer to outreach actions that may be planned as part of communication, dissemination and exploitation activities. These aspects should instead be described below under ''Impact''.<br><br>⚠ Proposals selected for funding under Horizon Europe will need to develop a detailed data management plan (DMP) for making their data/research outputs findable, accessible, interoperable and reusable (FAIR) as a deliverable by month 6 and revised towards the end of a project''s lifetime. The DMP should describe how research outputs (especially research data) generated and/or collected during the project will be managed so as to ensure that they are findable, accessible, interoperable and reusable.<br><br>⚠ For guidance on open science practices and research data management, please refer to the relevant section of the <a href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/horizon/guidance/programme-guide_horizon_en.pdf">HE Programme Guide</a> on the Funding &amp; Tenders Portal.',0)
ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, guideline_type = EXCLUDED.guideline_type, title = EXCLUDED.title;

INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index)
SELECT v.gid::uuid, t.id, v.ord
FROM (VALUES
  ('c1200001-0000-4000-8000-000000000001','b12.concepts',0),
  ('c1200001-0000-4000-8000-000000000001','b12.methodologies',0),
  ('c1200001-0000-4000-8000-000000000002','b12.linked_activities',0),
  ('c1200001-0000-4000-8000-000000000003','b12.interdisciplinarity',0),
  ('c1200001-0000-4000-8000-000000000004','b12.ssh',0),
  ('c1200001-0000-4000-8000-000000000005','b12.gender',0),
  ('c1200001-0000-4000-8000-000000000006','b12.open_science',0)
) AS v(gid, tkey, ord)
JOIN public.card_templates t
  ON t.key = v.tkey AND t.template_type_id = '33333333-3333-3333-3333-333333333333'
ON CONFLICT (guideline_id, card_template_id) DO UPDATE SET order_index = EXCLUDED.order_index;

-- 3. Admins may remove guideline entries and links
GRANT DELETE ON public.card_guidelines TO authenticated;
GRANT DELETE ON public.card_guideline_templates TO authenticated;
GRANT DELETE ON public.card_guideline_sections TO authenticated;
GRANT DELETE ON public.card_guideline_documents TO authenticated;

DROP POLICY IF EXISTS "card_guidelines_delete_admin" ON public.card_guidelines;
CREATE POLICY "card_guidelines_delete_admin" ON public.card_guidelines
  FOR DELETE TO authenticated USING (public.is_global_admin(auth.uid()));
DROP POLICY IF EXISTS "card_guideline_sections_delete_admin" ON public.card_guideline_sections;
CREATE POLICY "card_guideline_sections_delete_admin" ON public.card_guideline_sections
  FOR DELETE TO authenticated USING (public.is_global_admin(auth.uid()));
DROP POLICY IF EXISTS "card_guideline_templates_delete_admin" ON public.card_guideline_templates;
CREATE POLICY "card_guideline_templates_delete_admin" ON public.card_guideline_templates
  FOR DELETE TO authenticated USING (public.is_global_admin(auth.uid()));
DROP POLICY IF EXISTS "card_guideline_documents_delete_admin" ON public.card_guideline_documents;
CREATE POLICY "card_guideline_documents_delete_admin" ON public.card_guideline_documents
  FOR DELETE TO authenticated USING (public.is_global_admin(auth.uid()));
