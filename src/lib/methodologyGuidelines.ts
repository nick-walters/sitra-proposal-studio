import type { GuidelineType } from '@/components/GuidelinesDialog';

export interface MethodologyGuideline {
  id: string;
  type: GuidelineType;
  title: string;
  content: string;
}

export const METHODOLOGY_GUIDELINES: Record<string, MethodologyGuideline[]> = {
  concepts: [
    {
      id: 'concepts-official',
      type: 'official',
      title: 'Official guidance',
      content:
        "Describe and explain the overall methodology, including the concepts, models and assumptions that underpin your work. Explain how this will enable you to deliver your project's objectives. [e.g. 2 pages]",
    },
  ],
  methodologies: [
    {
      id: 'methodologies-official',
      type: 'official',
      title: 'Official guidance',
      content:
        "Describe the methodologies that will be conducted during the project. Refer to any important challenges you may have identified in the chosen methodology and how you intend to overcome them. [e.g. 8 pages]\nThis section should be presented as a narrative. The detailed tasks and work packages are described below under 'Implementation'.",
    },
  ],
  linked_activities: [
    {
      id: 'linked-activities-official',
      type: 'official',
      title: 'Official guidance',
      content:
        'Describe any national or international research and innovation activities whose results will feed into the project, and how that link will be established. [e.g. 1 page]',
    },
    {
      id: 'linked-activities-tip',
      type: 'sitra_tip',
      title: 'Writing the "How the project will be linked" column',
      content:
        'Do not simply describe what the listed project does or achieved.\nDescribe how this project will use data, knowledge, expertise or tools from the listed project.\nIf the listed project is still running at the same time as this project, also describe what this project will share back with it.',
    },
  ],
  interdisciplinarity: [
    {
      id: 'interdisciplinarity-official',
      type: 'official',
      title: 'Official guidance',
      content:
        'Explain how expertise and methods from different disciplines will be brought together and integrated in pursuit of your objectives. If you consider that an inter-disciplinary approach is unnecessary in the context of the proposed work, please provide a justification. [e.g. 1/2 page]',
    },
  ],
  ssh: [
    {
      id: 'ssh-official',
      type: 'official',
      title: 'Official guidance',
      content:
        'For topics where the work programme indicates the need for the integration of social sciences and humanities, show the role of these disciplines in the project or provide a justification if you consider that these disciplines are not relevant to your proposed project. [e.g. 1/2 page]',
    },
  ],
  gender: [
    {
      id: 'gender-official',
      type: 'official',
      title: 'Official guidance',
      content:
        "Describe how the gender dimension (i.e. sex and/or gender analysis) is taken into account in the project's research and innovation content [e.g. 1 page]. If you do not consider such a gender dimension to be relevant in your project, please provide a justification.\n! Note: This section is mandatory except for topics which have been identified in the work programme as not requiring the integration of the gender dimension into R&I content.\n! Remember that this question relates to the content of the planned research and innovation activities, and not to gender balance in the teams in charge of carrying out the project.\nSex and gender analysis refers to biological characteristics and social/cultural factors respectively. For guidance on methods of sex / gender analysis and the issues to be taken into account, please refer to https://op.europa.eu/en/publication-detail/-/publication/33b4c99f-2e66-11eb-b27b-01aa75ed71a1/language-en",
    },
  ],
  open_science: [
    {
      id: 'open-science-official',
      type: 'official',
      title: 'Official guidance',
      content:
        "Describe how appropriate open science practices are implemented as an integral part of the proposed methodology. Show how the choice of practices and their implementation are adapted to the nature of your work, in a way that will increase the chances of the project delivering on its objectives [e.g. 1 page]. If you believe that none of these practices are appropriate for your project, please provide a justification here.\nOpen science is an approach based on open cooperative work and systematic sharing of knowledge and tools as early and widely as possible in the process. Open science practices include early and open sharing of research (for example through preregistration, registered reports, preprints, or crowd-sourcing); research output management; measures to ensure reproducibility of research outputs; providing open access to research outputs (such as publications, data, software, models, algorithms, and workflows); participation in open peer-review; and involving all relevant knowledge actors including citizens, civil society and end users in the co-creation of R&I agendas and contents (such as citizen science).\n! Please note that this question does not refer to outreach actions that may be planned as part of communication, dissemination and exploitation activities. These aspects should instead be described below under 'Impact'.\nProposals selected for funding under Horizon Europe will need to develop a detailed data management plan (DMP) for making their data/research outputs findable, accessible, interoperable and reusable (FAIR) as a deliverable by month 6 and revised towards the end of a project's lifetime. The DMP should describe how research outputs (especially research data) generated and/or collected during the project will be managed so as to ensure that they are findable, accessible, interoperable and reusable. For guidance on open science practices and research data management, please refer to the relevant section of the HE Programme Guide on the Funding & Tenders Portal.",
    },
  ],
};

export function getMethodologyGuidelines(key: string): MethodologyGuideline[] {
  return METHODOLOGY_GUIDELINES[key] ?? [];
}
