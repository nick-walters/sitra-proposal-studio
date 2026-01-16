export type ProposalType = 'RIA' | 'IA' | 'CSA' | 'OTHER';

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
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
}

export interface Proposal {
  id: string;
  acronym: string;
  title: string;
  type: ProposalType;
  createdAt: Date;
  updatedAt: Date;
  members: ProposalMember[];
  sections: Section[];
  status: 'draft' | 'in-review' | 'submitted';
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
          text: 'Describe the specific objectives for the project, which should be clear, measurable, realistic and achievable within the duration of the project. Objectives should be consistent with the expected exploitation and impact of the project.'
        }
      },
      {
        id: 'methodology',
        number: '1.2',
        title: 'Methodology',
        guidelines: {
          text: 'Describe and explain the overall methodology, including the concepts, models and assumptions that underpin your work. Explain how this will enable you to deliver your project objectives.'
        }
      }
    ]
  },
  {
    id: 'impact',
    number: '2',
    title: 'Impact',
    subsections: [
      {
        id: 'pathways',
        number: '2.1',
        title: 'Project\'s pathways towards impact',
        guidelines: {
          text: 'Describe how the project\'s results will contribute to each of the expected impacts mentioned in the work programme, under the relevant topic.'
        }
      },
      {
        id: 'dissemination',
        number: '2.2',
        title: 'Measures to maximise impact - Dissemination, exploitation and communication',
        guidelines: {
          text: 'Describe the planned measures to maximise the impact of your project by providing a first draft of your plan for the dissemination and exploitation including communication activities.'
        }
      }
    ]
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
          text: 'Describe the work plan, work packages, deliverables and milestones. Describe the requested resources: staff effort, equipment, consumables, travel, etc.'
        }
      },
      {
        id: 'consortium',
        number: '3.2',
        title: 'Capacity of participants and consortium as a whole',
        guidelines: {
          text: 'Describe and explain the capacity of the participating organisations to successfully carry out the tasks and the complementarity of the different participants.'
        }
      }
    ]
  }
];
