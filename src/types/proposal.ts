export type ProposalType = 'RIA' | 'IA' | 'CSA';
export type BudgetType = 'traditional' | 'lump_sum';
export type UserRole = 'admin' | 'editor' | 'viewer';
export type ProposalStatus = 'draft' | 'submitted' | 'funded' | 'not_funded';

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
  submitted: 'Submitted',
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
  { id: 'MISS', abbreviation: 'MISS', fullName: 'EU Missions' },
  { id: 'NEB', abbreviation: 'NEB', fullName: 'New European Bauhaus' },
];

// Destinations per Work Programme
export interface Destination {
  id: string;
  abbreviation: string;
  fullName: string;
  workProgrammeId: string;
}

export const DESTINATIONS: Destination[] = [
  // CL1 - Health
  { id: 'CL1-D1', abbreviation: 'HLTH-D1', fullName: 'Staying healthy in a rapidly changing society', workProgrammeId: 'CL1' },
  { id: 'CL1-D2', abbreviation: 'HLTH-D2', fullName: 'Living and working in a health-promoting environment', workProgrammeId: 'CL1' },
  { id: 'CL1-D3', abbreviation: 'HLTH-D3', fullName: 'Tackling diseases and reducing disease burden', workProgrammeId: 'CL1' },
  { id: 'CL1-D4', abbreviation: 'HLTH-D4', fullName: 'Ensuring access to innovative, sustainable and high-quality health care', workProgrammeId: 'CL1' },
  { id: 'CL1-D5', abbreviation: 'HLTH-D5', fullName: 'Unlocking the full potential of new tools, technologies and digital solutions', workProgrammeId: 'CL1' },
  { id: 'CL1-D6', abbreviation: 'HLTH-D6', fullName: 'Maintaining an innovative, sustainable and globally competitive health-related industry', workProgrammeId: 'CL1' },

  // CL2 - Culture, Creativity & Inclusive Society
  { id: 'CL2-D1', abbreviation: 'DEMOCRACY', fullName: 'Innovative Research on Democracy and Governance', workProgrammeId: 'CL2' },
  { id: 'CL2-D2', abbreviation: 'HERITAGE', fullName: 'Innovative Research on European Cultural Heritage and the Cultural and Creative Industries', workProgrammeId: 'CL2' },
  { id: 'CL2-D3', abbreviation: 'TRANSFORMATIONS', fullName: 'Innovative Research on Social and Economic Transformations', workProgrammeId: 'CL2' },

  // CL3 - Civil Security for Society
  { id: 'CL3-D1', abbreviation: 'FCT', fullName: 'Better protect the EU and its citizens against Crime and Terrorism', workProgrammeId: 'CL3' },
  { id: 'CL3-D2', abbreviation: 'BM', fullName: 'Effective management of EU external borders', workProgrammeId: 'CL3' },
  { id: 'CL3-D3', abbreviation: 'INFRA', fullName: 'Resilient Infrastructure', workProgrammeId: 'CL3' },
  { id: 'CL3-D4', abbreviation: 'CS', fullName: 'Increased Cybersecurity', workProgrammeId: 'CL3' },
  { id: 'CL3-D5', abbreviation: 'DRS', fullName: 'A Disaster-Resilient Society for Europe', workProgrammeId: 'CL3' },
  { id: 'CL3-D6', abbreviation: 'SSRI', fullName: 'Strengthened Security Research and Innovation', workProgrammeId: 'CL3' },

  // CL4 - Digital, Industry & Space
  { id: 'CL4-D1', abbreviation: 'TWIN-TRANSITION', fullName: 'Climate neutral, Circular and Digitised Production', workProgrammeId: 'CL4' },
  { id: 'CL4-D2', abbreviation: 'RESILIENCE', fullName: 'Increased Autonomy in Key Strategic Value Chains for Resilient Industry', workProgrammeId: 'CL4' },
  { id: 'CL4-D3', abbreviation: 'DATA', fullName: 'World-leading Data and Computing Technologies', workProgrammeId: 'CL4' },
  { id: 'CL4-D4', abbreviation: 'DIGITAL-EMERGING', fullName: 'Digital and Emerging Technologies for Competitiveness and Fit for the Green Deal', workProgrammeId: 'CL4' },
  { id: 'CL4-D5', abbreviation: 'SPACE', fullName: 'Open strategic autonomy in developing, deploying and using global space-based infrastructures', workProgrammeId: 'CL4' },
  { id: 'CL4-D6', abbreviation: 'HUMAN', fullName: 'A human-centred and ethical development of digital and industrial technologies', workProgrammeId: 'CL4' },

  // CL5 - Climate, Energy & Mobility
  { id: 'CL5-D1', abbreviation: 'CL5-D1', fullName: 'Climate sciences and responses for the transformation towards climate neutrality', workProgrammeId: 'CL5' },
  { id: 'CL5-D2', abbreviation: 'CL5-D2', fullName: 'Cross-sectoral solutions for the climate transition', workProgrammeId: 'CL5' },
  { id: 'CL5-D3', abbreviation: 'CL5-D3', fullName: 'Sustainable, secure and competitive energy supply', workProgrammeId: 'CL5' },
  { id: 'CL5-D4', abbreviation: 'CL5-D4', fullName: 'Efficient, sustainable and inclusive energy use', workProgrammeId: 'CL5' },
  { id: 'CL5-D5', abbreviation: 'CL5-D5', fullName: 'Clean and competitive solutions for all transport modes', workProgrammeId: 'CL5' },
  { id: 'CL5-D6', abbreviation: 'CL5-D6', fullName: 'Safe, Resilient Transport and Smart Mobility services for passengers and goods', workProgrammeId: 'CL5' },

  // CL6 - Food, Bioeconomy, Natural Resources, Agriculture & Environment
  { id: 'CL6-D1', abbreviation: 'BIODIV', fullName: 'Biodiversity and ecosystem services', workProgrammeId: 'CL6' },
  { id: 'CL6-D2', abbreviation: 'FARM2FORK', fullName: 'Fair, healthy and environmentally-friendly food systems from primary production to consumption', workProgrammeId: 'CL6' },
  { id: 'CL6-D3', abbreviation: 'CIRCBIO', fullName: 'Circular economy and bioeconomy sectors', workProgrammeId: 'CL6' },
  { id: 'CL6-D4', abbreviation: 'ZEROPOLLUTION', fullName: 'Clean environment and zero pollution', workProgrammeId: 'CL6' },
  { id: 'CL6-D5', abbreviation: 'CLIMATE', fullName: 'Land, oceans and water for climate action', workProgrammeId: 'CL6' },
  { id: 'CL6-D6', abbreviation: 'COMMUNITIES', fullName: 'Resilient, inclusive, healthy and green rural, coastal and urban communities', workProgrammeId: 'CL6' },
  { id: 'CL6-D7', abbreviation: 'GOVERNANCE', fullName: 'Innovative governance, environmental observations and digital solutions in support of the Green Deal', workProgrammeId: 'CL6' },

  // EU Missions
  { id: 'MISS-CANCER', abbreviation: 'CANCER', fullName: 'Mission Cancer', workProgrammeId: 'MISS' },
  { id: 'MISS-CLIMATE', abbreviation: 'ADAPTATION', fullName: 'Mission Adaptation to Climate Change', workProgrammeId: 'MISS' },
  { id: 'MISS-OCEAN', abbreviation: 'OCEAN', fullName: 'Mission Restore our Ocean and Waters', workProgrammeId: 'MISS' },
  { id: 'MISS-CITIES', abbreviation: 'CITIES', fullName: 'Mission Climate-Neutral and Smart Cities', workProgrammeId: 'MISS' },
  { id: 'MISS-SOIL', abbreviation: 'SOIL', fullName: 'Mission A Soil Deal for Europe', workProgrammeId: 'MISS' },

  // New European Bauhaus
  { id: 'NEB-D1', abbreviation: 'NEB-D1', fullName: 'New European Bauhaus', workProgrammeId: 'NEB' },
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
    id: 'proposal-info',
    number: 'A.0',
    title: 'Proposal Information',
    isPartA: true,
    guidelines: {
      text: 'Overview of the proposal including topic information, budget, deadline, and consortium summary.',
    },
  },
  {
    id: 'admin-forms',
    number: 'A.1',
    title: 'Administrative Forms',
    isPartA: true,
    guidelines: {
      text: 'Complete the administrative information for each participant organisation.',
    },
    subsections: [
      {
        id: 'participant-info',
        number: 'A.1.1',
        title: 'Participant Information',
        isPartA: true,
        guidelines: {
          text: 'Enter details for each participating organisation including PIC number, legal entity type, and contact information.',
        },
      },
      {
        id: 'team-members',
        number: 'A.1.2',
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
    number: 'A.2',
    title: 'Budget',
    isPartA: true,
    guidelines: {
      text: 'Complete the budget breakdown for each participant. Select traditional or lump sum budget model.',
    },
    subsections: [
      {
        id: 'budget-overview',
        number: 'A.2.1',
        title: 'Budget Overview',
        isPartA: true,
        guidelines: {
          text: 'Summary of the total project budget and distribution across participants.',
        },
      },
      {
        id: 'budget-details',
        number: 'A.2.2',
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
    number: 'A.3',
    title: 'Ethics Self-Assessment',
    isPartA: true,
    guidelines: {
      text: 'Complete the ethics self-assessment. All partners can edit this section.',
    },
  },
  {
    id: 'declarations',
    number: 'A.4',
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
    number: '1',
    title: 'Excellence',
    subsections: [
      {
        id: 'objectives',
        number: '1.1',
        title: 'Objectives and ambition',
        guidelines: {
          text: 'Describe the specific objectives for the project, which should be clear, measurable, realistic and achievable within the duration of the project. Objectives should be consistent with the expected exploitation and impact of the project.',
        },
      },
      {
        id: 'methodology',
        number: '1.2',
        title: 'Methodology',
        guidelines: {
          text: 'Describe and explain the overall methodology, including the concepts, models and assumptions that underpin your work. Explain how this will enable you to deliver your project objectives.',
        },
      },
    ],
  },
  {
    id: 'impact',
    number: '2',
    title: 'Impact',
    subsections: [
      {
        id: 'pathways',
        number: '2.1',
        title: "Project's pathways towards impact",
        guidelines: {
          text: "Describe how the project's results will contribute to each of the expected impacts mentioned in the work programme, under the relevant topic.",
        },
      },
      {
        id: 'dissemination',
        number: '2.2',
        title: 'Measures to maximise impact - Dissemination, exploitation and communication',
        guidelines: {
          text: 'Describe the planned measures to maximise the impact of your project by providing a first draft of your plan for the dissemination and exploitation including communication activities.',
        },
      },
    ],
  },
  {
    id: 'implementation',
    number: '3',
    title: 'Quality and efficiency of the implementation',
    subsections: [
      {
        id: 'workplan',
        number: '3.1',
        title: 'Work plan and resources',
        guidelines: {
          text: 'Describe the work plan, work packages, deliverables and milestones. Describe the requested resources: staff effort, equipment, consumables, travel, etc.',
        },
      },
      {
        id: 'consortium',
        number: '3.2',
        title: 'Capacity of participants and consortium as a whole',
        guidelines: {
          text: 'Describe and explain the capacity of the participating organisations to successfully carry out the tasks and the complementarity of the different participants.',
        },
      },
    ],
  },
];

// Budget categories for traditional proposals
export const BUDGET_CATEGORIES_TRADITIONAL = [
  { id: 'personnel', label: 'A. Personnel costs', subcategories: ['Researchers', 'Technicians', 'Administrative'] },
  { id: 'subcontracting', label: 'B. Subcontracting', subcategories: [] },
  { id: 'purchase', label: 'C. Purchase costs', subcategories: ['Travel', 'Equipment', 'Other goods and services'] },
  { id: 'other', label: 'D. Other cost categories', subcategories: ['Internally invoiced goods', 'Linked third parties'] },
  { id: 'indirect', label: 'E. Indirect costs (25% flat rate)', subcategories: [] },
];

// Budget categories for lump sum proposals
export const BUDGET_CATEGORIES_LUMP_SUM = [
  { id: 'wp1', label: 'Work Package 1', subcategories: [] },
  { id: 'wp2', label: 'Work Package 2', subcategories: [] },
  { id: 'wp3', label: 'Work Package 3', subcategories: [] },
  { id: 'wp4', label: 'Work Package 4', subcategories: [] },
  { id: 'wp5', label: 'Work Package 5', subcategories: [] },
];
