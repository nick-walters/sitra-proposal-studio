export type ProposalType = 'RIA' | 'IA' | 'CSA';
export type BudgetType = 'traditional' | 'lump_sum';
export type UserRole = 'admin' | 'editor' | 'viewer';
export type ProposalStatus = 'draft' | 'submitted' | 'funded' | 'not_funded';
export type SubmissionStage = 'full' | 'stage_1';

export const SUBMISSION_STAGE_LABELS: Record<SubmissionStage, string> = {
  full: 'Full Proposal',
  stage_1: 'Stage 1 of 2',
};

export type ParticipantType = 
  | 'beneficiary'
  | 'affiliated_entity'
  | 'associated_partner'
  | 'third_party_against_payment'
  | 'third_party_free_of_charge'
  | 'subcontractor'
  | 'international_partner'
  | 'associated_country_partner';

export const PARTICIPANT_TYPE_LABELS: Record<ParticipantType, string> = {
  beneficiary: 'Beneficiary',
  affiliated_entity: 'Affiliated Entity',
  associated_partner: 'Associated Partner',
  third_party_against_payment: 'Third Party (Against Payment)',
  third_party_free_of_charge: 'Third Party (Free of Charge)',
  subcontractor: 'Subcontractor',
  international_partner: 'International Partner',
  associated_country_partner: 'Associated Country Partner',
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Draft',
  submitted: 'Under Evaluation',
  funded: 'Funded',
  not_funded: 'Not Funded',
};

export const PROPOSAL_TYPE_LABELS: Record<ProposalType, string> = {
  RIA: 'Research and Innovation Action',
  IA: 'Innovation Action',
  CSA: 'Coordination and Support Action',
};

// Work Programmes with abbreviations
export interface WorkProgramme {
  id: string;
  abbreviation: string;
  fullName: string;
}

export const WORK_PROGRAMMES: WorkProgramme[] = [
  { id: 'CL1', abbreviation: 'CL1', fullName: 'Cluster 1: Health' },
  { id: 'CL2', abbreviation: 'CL2', fullName: 'Cluster 2: Culture, Creativity & Inclusive Society' },
  { id: 'CL3', abbreviation: 'CL3', fullName: 'Cluster 3: Civil Security for Society' },
  { id: 'CL4', abbreviation: 'CL4', fullName: 'Cluster 4: Digital, Industry & Space' },
  { id: 'CL5', abbreviation: 'CL5', fullName: 'Cluster 5: Climate, Energy & Mobility' },
  { id: 'CL6', abbreviation: 'CL6', fullName: 'Cluster 6: Food, Bioeconomy, Natural Resources, Agriculture & Environment' },
  { id: 'MISSIONS', abbreviation: 'Missions', fullName: 'EU Missions' },
  { id: 'WIDERA', abbreviation: 'WIDERA', fullName: 'Widening Participation and Strengthening the ERA' },
  { id: 'NEB', abbreviation: 'NEB', fullName: 'New European Bauhaus Facility' },
  { id: 'HORIZONTAL', abbreviation: 'Horizontal', fullName: 'Horizontal Activities' },
  { id: 'PARTNERSHIP', abbreviation: 'Partnership', fullName: 'European Partnerships' },
];

// Destinations per Work Programme
export interface Destination {
  id: string;
  abbreviation: string;
  fullName: string;
  workProgrammeId: string;
}

export const DESTINATIONS: Destination[] = [
  // CL1 - Health (from WP 2026-27 Part 4)
  { id: 'CL1-ENVHLTH', abbreviation: 'ENVHLTH', fullName: 'Living and working in a health-promoting environment', workProgrammeId: 'CL1' },
  { id: 'CL1-DISEASE', abbreviation: 'DISEASE', fullName: 'Tackling diseases and reducing disease burden', workProgrammeId: 'CL1' },
  { id: 'CL1-CARE', abbreviation: 'CARE', fullName: 'Ensuring equal access to innovative, sustainable, and high-quality healthcare', workProgrammeId: 'CL1' },
  { id: 'CL1-TOOL', abbreviation: 'TOOL', fullName: 'Developing and using new tools, technologies and digital solutions for a healthy society', workProgrammeId: 'CL1' },
  { id: 'CL1-IND', abbreviation: 'IND', fullName: 'Maintaining an innovative, sustainable, and competitive EU health industry', workProgrammeId: 'CL1' },

  // CL2 - Culture, Creativity & Inclusive Society (from WP 2026-27 Part 5)
  { id: 'CL2-DEMOCRACY', abbreviation: 'DEMOCRACY', fullName: 'Innovative Research on Democracy and Governance', workProgrammeId: 'CL2' },
  { id: 'CL2-HERITAGE', abbreviation: 'HERITAGE', fullName: 'Innovative Research on European Cultural Heritage and Cultural and Creative Industries', workProgrammeId: 'CL2' },
  { id: 'CL2-TRANSFO', abbreviation: 'TRANSFO', fullName: 'Innovative Research on Social and Economic Transformations', workProgrammeId: 'CL2' },

  // CL3 - Civil Security for Society (from WP 2026-27 Part 6)
  { id: 'CL3-FCT', abbreviation: 'FCT', fullName: 'Better protect the EU and its citizens against Crime and Terrorism', workProgrammeId: 'CL3' },
  { id: 'CL3-BM', abbreviation: 'BM', fullName: 'Effective management of EU external borders', workProgrammeId: 'CL3' },
  { id: 'CL3-INFRA', abbreviation: 'INFRA', fullName: 'Resilient Infrastructure', workProgrammeId: 'CL3' },
  { id: 'CL3-CS', abbreviation: 'CS', fullName: 'Cybersecurity', workProgrammeId: 'CL3' },
  { id: 'CL3-DRS', abbreviation: 'DRS', fullName: 'Disaster-Resilient Society for Europe', workProgrammeId: 'CL3' },
  { id: 'CL3-SSRI', abbreviation: 'SSRI', fullName: 'Strengthened Security Research and Innovation', workProgrammeId: 'CL3' },

  // CL4 - Digital, Industry & Space (from WP 2026-27 Part 7)
  { id: 'CL4-MAT-PROD', abbreviation: 'MAT-PROD', fullName: 'Leadership in materials and production for Europe', workProgrammeId: 'CL4' },
  { id: 'CL4-DATA', abbreviation: 'DATA', fullName: 'Developing an agile and secure single market and infrastructure for data-services and trustworthy AI', workProgrammeId: 'CL4' },
  { id: 'CL4-DIGITAL-EMERGING', abbreviation: 'DIGITAL-EMERGING', fullName: 'Achieving open strategic autonomy in digital and emerging enabling technologies', workProgrammeId: 'CL4' },
  { id: 'CL4-SPACE', abbreviation: 'SPACE', fullName: 'Deploying and using global space-based infrastructures, services and data', workProgrammeId: 'CL4' },
  { id: 'CL4-HUMAN', abbreviation: 'HUMAN', fullName: 'A human-centred and ethical development of digital and industrial technologies', workProgrammeId: 'CL4' },

  // CL5 - Climate, Energy & Mobility (from WP 2026-27 Part 8)
  { id: 'CL5-D1', abbreviation: 'D1', fullName: 'Climate sciences and responses for the transformation towards climate neutrality', workProgrammeId: 'CL5' },
  { id: 'CL5-D2', abbreviation: 'D2', fullName: 'Cross-sectoral solutions for the climate transition', workProgrammeId: 'CL5' },
  { id: 'CL5-D3', abbreviation: 'D3', fullName: 'Sustainable, secure and competitive energy supply', workProgrammeId: 'CL5' },
  { id: 'CL5-D4', abbreviation: 'D4', fullName: 'Efficient, sustainable and inclusive energy use', workProgrammeId: 'CL5' },
  { id: 'CL5-D5', abbreviation: 'D5', fullName: 'Clean and competitive solutions for all transport modes', workProgrammeId: 'CL5' },
  { id: 'CL5-D6', abbreviation: 'D6', fullName: 'Safe, Resilient Transport and Smart Mobility services for passengers and goods', workProgrammeId: 'CL5' },

  // CL6 - Food, Bioeconomy, Natural Resources, Agriculture & Environment (from WP 2026-27 Part 9)
  { id: 'CL6-BIODIV', abbreviation: 'BIODIV', fullName: 'Biodiversity and ecosystem services', workProgrammeId: 'CL6' },
  { id: 'CL6-FARM2FORK', abbreviation: 'FARM2FORK', fullName: 'Fair, healthy and environment-friendly food systems from primary production to consumption', workProgrammeId: 'CL6' },
  { id: 'CL6-CIRCBIO', abbreviation: 'CIRCBIO', fullName: 'Circular economy and bioeconomy sectors', workProgrammeId: 'CL6' },
  { id: 'CL6-ZEROPOLLUTION', abbreviation: 'ZEROPOLLUTION', fullName: 'Clean environment and zero pollution', workProgrammeId: 'CL6' },
  { id: 'CL6-CLIMATE', abbreviation: 'CLIMATE', fullName: 'Land, oceans and water for climate action', workProgrammeId: 'CL6' },
  { id: 'CL6-COMMUNITIES', abbreviation: 'COMMUNITIES', fullName: 'Resilient, inclusive, healthy and green rural, coastal and urban communities', workProgrammeId: 'CL6' },
  { id: 'CL6-GOVERNANCE', abbreviation: 'GOVERNANCE', fullName: 'Innovative governance, environmental observations and digital solutions in support of the Green Deal', workProgrammeId: 'CL6' },

  // WIDERA - Widening Participation (from WP 2026-27 Part 11)
  { id: 'WIDERA-WIDENING', abbreviation: 'WIDENING', fullName: 'Widening participation and spreading excellence', workProgrammeId: 'WIDERA' },
  { id: 'WIDERA-ERA', abbreviation: 'ERA', fullName: 'Reforming and enhancing the European R&I system', workProgrammeId: 'WIDERA' },

  // NEB - New European Bauhaus Facility (from WP 2026-27 Part 13)
  { id: 'NEB-REGEN', abbreviation: 'REGEN', fullName: 'Regeneration of neighbourhoods', workProgrammeId: 'NEB' },
  { id: 'NEB-BUSINESS', abbreviation: 'BUSINESS', fullName: 'Innovative funding and new business models for the transformation of neighbourhoods', workProgrammeId: 'NEB' },

  // Partnership - European Partnerships
  { id: 'PARTNERSHIP-CBE', abbreviation: 'CBE JU', fullName: 'Circular Bio-based Europe Joint Undertaking', workProgrammeId: 'PARTNERSHIP' },
  { id: 'PARTNERSHIP-CHIPS', abbreviation: 'Chips JU', fullName: 'Chips Joint Undertaking', workProgrammeId: 'PARTNERSHIP' },
];

export const getDestinationsForWorkProgramme = (workProgrammeId: string): Destination[] => {
  return DESTINATIONS.filter(d => d.workProgrammeId === workProgrammeId);
};

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  organisation?: string;
}

export interface ProposalMember {
  user: User;
  role: UserRole;
}

export interface Section {
  id: string;
  number: string;
  title: string;
  subsections?: Section[];
  content?: string;
  guidelines?: {
    text?: string;
    imageUrl?: string;
    videoUrl?: string;
  };
  wordLimit?: number;
  pageLimit?: number;
  isPartA?: boolean;
}

export interface Proposal {
  id: string;
  acronym: string;
  title: string;
  type: ProposalType;
  budgetType: BudgetType;
  submissionStage?: SubmissionStage; // 'full' (default) or 'stage_1'
  createdAt: Date;
  updatedAt: Date;
  members: ProposalMember[];
  sections: Section[];
  status: ProposalStatus;
  topicUrl?: string;
  topicId?: string;
  totalBudget?: number;
  deadline?: Date;
  description?: string;
  workProgramme?: string;
  destination?: string;
  logoUrl?: string;
  submittedAt?: Date;
  decisionDate?: Date;
}

export interface Participant {
  id: string;
  proposalId: string;
  organisationName: string;
  organisationShortName?: string;
  organisationType: ParticipantType;
  country?: string;
  logoUrl?: string;
  picNumber?: string;
  legalEntityType?: string;
  isSme: boolean;
  participantNumber: number;
  contactEmail?: string;
  address?: string;
}

export interface ParticipantMember {
  id: string;
  participantId: string;
  userId?: string;
  fullName: string;
  email?: string;
  roleInProject?: string;
  personMonths?: number;
  isPrimaryContact: boolean;
}

export interface Reference {
  id: string;
  proposalId: string;
  citationNumber: number;
  doi?: string;
  authors: string[];
  year?: number;
  title: string;
  journal?: string;
  volume?: string;
  pages?: string;
  formattedCitation?: string;
  verified: boolean;
}

export interface Comment {
  id: string;
  userId: string;
  content: string;
  sectionId: string;
  createdAt: Date;
  resolved: boolean;
}

export interface Version {
  id: string;
  proposalId: string;
  createdAt: Date;
  createdBy: User;
  description?: string;
}

export interface BudgetItem {
  id: string;
  proposalId: string;
  participantId: string;
  category: string;
  subcategory?: string;
  description?: string;
  amount: number;
  justification?: string;
  workPackage?: string;
}

export interface EthicsAssessment {
  id: string;
  proposalId: string;
  humanSubjects: boolean;
  humanSubjectsDetails?: string;
  personalData: boolean;
  personalDataDetails?: string;
  animals: boolean;
  animalsDetails?: string;
  humanCells: boolean;
  humanCellsDetails?: string;
  thirdCountries: boolean;
  thirdCountriesDetails?: string;
  environment: boolean;
  environmentDetails?: string;
  dualUse: boolean;
  dualUseDetails?: string;
  misuse: boolean;
  misuseDetails?: string;
  otherEthics: boolean;
  otherEthicsDetails?: string;
}

// Part A sections structure
export const PART_A_SECTIONS: Section[] = [
  {
    id: 'summary',
    number: '',
    title: 'Proposal Information',
    isPartA: true,
    guidelines: {
      text: 'Overview of the proposal including general information, abstract, keywords, participants, and project duration as per Horizon Europe Standard Application Form.',
    },
  },
  {
    id: 'admin-forms',
    number: 'A1',
    title: 'Administrative Forms',
    isPartA: true,
    guidelines: {
      text: 'Complete the administrative information for each participant organisation.',
    },
    subsections: [
      {
        id: 'participant-info',
        number: 'A1.1',
        title: 'Participant Information',
        isPartA: true,
        guidelines: {
          text: 'Enter details for each participating organisation including PIC number, legal entity type, and contact information.',
        },
      },
      {
        id: 'team-members',
        number: 'A1.2',
        title: 'Team Members',
        isPartA: true,
        guidelines: {
          text: 'List all team members from each participant organisation and their roles in the project.',
        },
      },
    ],
  },
  {
    id: 'budget',
    number: 'A2',
    title: 'Budget',
    isPartA: true,
    guidelines: {
      text: 'Complete the budget breakdown for each participant. Select standard or lump sum budget model.',
    },
    subsections: [
      {
        id: 'budget-overview',
        number: 'A2.1',
        title: 'Budget Overview',
        isPartA: true,
        guidelines: {
          text: 'Summary of the total project budget and distribution across participants.',
        },
      },
      {
        id: 'budget-details',
        number: 'A2.2',
        title: 'Detailed Budget',
        isPartA: true,
        guidelines: {
          text: 'Detailed breakdown by cost category: personnel, equipment, subcontracting, travel, etc.',
        },
      },
    ],
  },
  {
    id: 'ethics',
    number: 'A3',
    title: 'Ethics Self-Assessment',
    isPartA: true,
    guidelines: {
      text: 'Complete the ethics self-assessment. All partners can edit this section.',
    },
  },
  {
    id: 'declarations',
    number: 'A4',
    title: 'Declarations',
    isPartA: true,
    guidelines: {
      text: 'Declarations required by each participant organisation.',
    },
  },
];

// Horizon Europe Part B structure
export const HORIZON_EUROPE_SECTIONS: Section[] = [
  {
    id: 'excellence',
    number: 'B1',
    title: 'Excellence',
    subsections: [
      {
        id: 'objectives',
        number: 'B1.1',
        title: 'Objectives and ambition',
        guidelines: {
          text: 'Describe the specific objectives for the project, which should be clear, measurable, realistic and achievable within the duration of the project. Objectives should be consistent with the expected exploitation and impact of the project.',
        },
      },
      {
        id: 'methodology',
        number: 'B1.2',
        title: 'Methodology',
        guidelines: {
          text: 'Describe and explain the overall methodology, including the concepts, models and assumptions that underpin your work. Explain how this will enable you to deliver your project objectives.',
        },
      },
    ],
  },
  {
    id: 'impact',
    number: 'B2',
    title: 'Impact',
    subsections: [
      {
        id: 'pathways',
        number: 'B2.1',
        title: "Project's pathways towards impact",
        guidelines: {
          text: "Describe the project's results will contribute to each of the expected impacts mentioned in the work programme, under the relevant topic.",
        },
      },
      {
        id: 'dissemination',
        number: 'B2.2',
        title: 'Measures to maximise impact - Dissemination, exploitation and communication',
        guidelines: {
          text: 'Describe the planned measures to maximise the impact of your project by providing a first draft of your plan for the dissemination and exploitation including communication activities.',
        },
      },
    ],
  },
  {
    id: 'implementation',
    number: 'B3',
    title: 'Quality and efficiency of the implementation',
    subsections: [
      {
        id: 'workplan',
        number: 'B3.1',
        title: 'Work plan and resources',
        guidelines: {
          text: 'Describe the work plan, work packages, deliverables and milestones. Describe the requested resources: staff effort, equipment, consumables, travel, etc.',
        },
      },
      {
        id: 'consortium',
        number: 'B3.2',
        title: 'Capacity of participants and consortium as a whole',
        guidelines: {
          text: 'Describe and explain the capacity of the participating organisations to successfully carry out the tasks and the complementarity of the different participants.',
        },
      },
    ],
  },
];

// Figures section (placed below Part B)
export const FIGURES_SECTION: Section = {
  id: 'figures',
  number: 'Figures',
  title: 'Figures & Diagrams',
  guidelines: {
    text: 'Manage and edit figures referenced in Part B sections. Figures are automatically numbered based on their parent section (e.g. Figure B3.1.a).',
  },
};

// Budget categories for standard proposals
export const BUDGET_CATEGORIES_STANDARD = [
  { id: 'personnel', label: 'A. Personnel costs', subcategories: ['Researchers', 'Technicians', 'Administrative'] },
  { id: 'subcontracting', label: 'B. Subcontracting', subcategories: [] },
  { id: 'purchase', label: 'C. Purchase costs', subcategories: ['Travel', 'Equipment', 'Other goods and services'] },
  { id: 'other', label: 'D. Other cost categories', subcategories: ['Internally invoiced goods', 'Linked third parties'] },
  { id: 'indirect', label: 'E. Indirect costs (25% flat rate)', subcategories: [] },
];

// Backwards compatibility alias
export const BUDGET_CATEGORIES_TRADITIONAL = BUDGET_CATEGORIES_STANDARD;

// Budget categories for lump sum proposals
export const BUDGET_CATEGORIES_LUMP_SUM = [
  { id: 'wp1', label: 'Work Package 1', subcategories: [] },
  { id: 'wp2', label: 'Work Package 2', subcategories: [] },
  { id: 'wp3', label: 'Work Package 3', subcategories: [] },
  { id: 'wp4', label: 'Work Package 4', subcategories: [] },
  { id: 'wp5', label: 'Work Package 5', subcategories: [] },
];
