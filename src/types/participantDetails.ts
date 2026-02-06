// Part A2 Participant Details - EC Form Types
// Based on official Horizon Europe RIA/IA Standard Application Form (Version 10.0)

// ============================================
// Enums and Constants
// ============================================

export const CAREER_STAGES = [
  { value: 'Category A', label: 'Category A - Leading researcher', description: 'The single highest grade/post at which research is normally conducted (e.g., Full professor, Director of research)' },
  { value: 'Category B', label: 'Category B - Senior researcher', description: 'Researchers working in positions not as senior as top position but more senior than newly qualified doctoral graduates (e.g., Associate professor, Senior researcher, Principal investigator)' },
  { value: 'Category C', label: 'Category C - Recognised researcher', description: 'The first grade/post into which a newly qualified doctoral graduate would normally be recruited (e.g., Assistant professor, Investigator, Post-doctoral fellow)' },
  { value: 'Category D', label: 'Category D - First stage researcher', description: 'Either doctoral students at ISCED level 8 who are engaged as researchers, or researchers working in posts that do not normally require a doctorate degree (e.g., PhD students, Junior researchers without PhD)' },
] as const;

export const ACHIEVEMENT_TYPES = [
  { value: 'Publication', label: 'Publication' },
  { value: 'Dataset', label: 'Dataset' },
  { value: 'Software', label: 'Software' },
  { value: 'Good', label: 'Good' },
  { value: 'Service', label: 'Service' },
  { value: 'Other', label: 'Other achievement' },
] as const;

export const IDENTIFIER_TYPES = [
  { value: 'ORCID', label: 'ORCID' },
  { value: 'ResearcherID', label: 'ResearcherID' },
  { value: 'Other', label: 'Other' },
] as const;

export const CONTACT_TITLES = [
  { value: 'Dr.', label: 'Dr.' },
  { value: 'Prof.', label: 'Prof.' },
  { value: 'Mr.', label: 'Mr.' },
  { value: 'Ms.', label: 'Ms.' },
  { value: 'Mx.', label: 'Mx.' },
] as const;

export const GENDER_OPTIONS = [
  { value: 'Woman', label: 'Woman' },
  { value: 'Man', label: 'Man' },
  { value: 'Non-binary', label: 'Non-binary' },
] as const;

export const LINK_TYPES = [
  { value: 'Same group', label: 'Same group' },
  { value: 'Controls', label: 'Controls' },
  { value: 'Is controlled by', label: 'Is controlled by' },
] as const;

// Organisation roles as per EC form (16+ types)
export const ORGANISATION_ROLES = [
  { value: 'project_management', label: 'Project management' },
  { value: 'communication', label: 'Communication, dissemination and engagement' },
  { value: 'infrastructure', label: 'Provision of research and technology infrastructure' },
  { value: 'market_needs', label: 'Co-definition of research and market needs' },
  { value: 'civil_society', label: 'Civil society representative' },
  { value: 'policy_maker', label: 'Policy maker or regulator, incl. standardisation body' },
  { value: 'research_performer', label: 'Research performer' },
  { value: 'technology_developer', label: 'Technology developer' },
  { value: 'testing_validation', label: 'Testing/validation of approaches and ideas' },
  { value: 'prototyping', label: 'Prototyping and demonstration' },
  { value: 'ipr_management', label: 'IPR management incl. technology transfer' },
  { value: 'public_procurer', label: 'Public procurer of results' },
  { value: 'private_buyer', label: 'Private buyer of results' },
  { value: 'finance_provider', label: 'Finance provider (public or private)' },
  { value: 'education_training', label: 'Education and training' },
  { value: 'social_sciences', label: 'Contributions from the social sciences or/and the humanities' },
  { value: 'other', label: 'Other (specify)' },
] as const;

// ============================================
// Interfaces
// ============================================

export interface ParticipantResearcher {
  id: string;
  participantId: string;
  title?: string;
  firstName: string;
  lastName: string;
  gender?: string;
  nationality?: string;
  email?: string;
  careerStage?: string;
  roleInProject?: string;
  referenceIdentifier?: string;
  identifierType?: string;
  orderIndex: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ParticipantOrganisationRole {
  id: string;
  participantId: string;
  roleType: string;
  otherDescription?: string;
  createdAt?: string;
}

export interface ParticipantAchievement {
  id: string;
  participantId: string;
  achievementType: string;
  description: string;
  orderIndex: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ParticipantPreviousProject {
  id: string;
  participantId: string;
  projectName: string;
  description?: string;
  orderIndex: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ParticipantInfrastructure {
  id: string;
  participantId: string;
  name: string;
  description?: string;
  orderIndex: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ParticipantDependency {
  id: string;
  participantId: string;
  linkedParticipantId?: string;
  linkType: string;
  notes?: string;
  createdAt?: string;
}

// Extended Participant interface with new fields
export interface ParticipantExtended {
  // Main contact extended fields
  mainContactFirstName?: string;
  mainContactLastName?: string;
  mainContactGender?: string;
  mainContactStreet?: string;
  mainContactTown?: string;
  mainContactPostcode?: string;
  mainContactCountry?: string;
  useOrganisationAddress?: boolean;
  
  // GEP building blocks
  gepPublication?: boolean;
  gepDedicatedResources?: boolean;
  gepDataCollection?: boolean;
  gepTraining?: boolean;
  
  // GEP content areas
  gepWorkLifeBalance?: boolean;
  gepGenderLeadership?: boolean;
  gepRecruitmentProgression?: boolean;
  gepResearchTeaching?: boolean;
  gepGenderViolence?: boolean;
}

// Type for full participant details (all related data)
export interface ParticipantDetails {
  researchers: ParticipantResearcher[];
  organisationRoles: ParticipantOrganisationRole[];
  achievements: ParticipantAchievement[];
  previousProjects: ParticipantPreviousProject[];
  infrastructure: ParticipantInfrastructure[];
  dependencies: ParticipantDependency[];
}

// Database row types (snake_case for Supabase)
export interface ParticipantResearcherRow {
  id: string;
  participant_id: string;
  title: string | null;
  first_name: string;
  last_name: string;
  gender: string | null;
  nationality: string | null;
  email: string | null;
  career_stage: string | null;
  role_in_project: string | null;
  reference_identifier: string | null;
  identifier_type: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface ParticipantOrganisationRoleRow {
  id: string;
  participant_id: string;
  role_type: string;
  other_description: string | null;
  created_at: string;
}

export interface ParticipantAchievementRow {
  id: string;
  participant_id: string;
  achievement_type: string;
  description: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface ParticipantPreviousProjectRow {
  id: string;
  participant_id: string;
  project_name: string;
  description: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface ParticipantInfrastructureRow {
  id: string;
  participant_id: string;
  name: string;
  description: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface ParticipantDependencyRow {
  id: string;
  participant_id: string;
  linked_participant_id: string | null;
  link_type: string;
  notes: string | null;
  created_at: string;
}

// ============================================
// Helper functions for data transformation
// ============================================

export function transformResearcherFromRow(row: ParticipantResearcherRow): ParticipantResearcher {
  return {
    id: row.id,
    participantId: row.participant_id,
    title: row.title || undefined,
    firstName: row.first_name,
    lastName: row.last_name,
    gender: row.gender || undefined,
    nationality: row.nationality || undefined,
    email: row.email || undefined,
    careerStage: row.career_stage || undefined,
    roleInProject: row.role_in_project || undefined,
    referenceIdentifier: row.reference_identifier || undefined,
    identifierType: row.identifier_type || undefined,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function transformResearcherToRow(researcher: Partial<ParticipantResearcher>): Partial<ParticipantResearcherRow> {
  const row: Partial<ParticipantResearcherRow> = {};
  if (researcher.participantId !== undefined) row.participant_id = researcher.participantId;
  if (researcher.title !== undefined) row.title = researcher.title || null;
  if (researcher.firstName !== undefined) row.first_name = researcher.firstName;
  if (researcher.lastName !== undefined) row.last_name = researcher.lastName;
  if (researcher.gender !== undefined) row.gender = researcher.gender || null;
  if (researcher.nationality !== undefined) row.nationality = researcher.nationality || null;
  if (researcher.email !== undefined) row.email = researcher.email || null;
  if (researcher.careerStage !== undefined) row.career_stage = researcher.careerStage || null;
  if (researcher.roleInProject !== undefined) row.role_in_project = researcher.roleInProject || null;
  if (researcher.referenceIdentifier !== undefined) row.reference_identifier = researcher.referenceIdentifier || null;
  if (researcher.identifierType !== undefined) row.identifier_type = researcher.identifierType || null;
  if (researcher.orderIndex !== undefined) row.order_index = researcher.orderIndex;
  return row;
}

export function transformAchievementFromRow(row: ParticipantAchievementRow): ParticipantAchievement {
  return {
    id: row.id,
    participantId: row.participant_id,
    achievementType: row.achievement_type,
    description: row.description,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function transformPreviousProjectFromRow(row: ParticipantPreviousProjectRow): ParticipantPreviousProject {
  return {
    id: row.id,
    participantId: row.participant_id,
    projectName: row.project_name,
    description: row.description || undefined,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function transformInfrastructureFromRow(row: ParticipantInfrastructureRow): ParticipantInfrastructure {
  return {
    id: row.id,
    participantId: row.participant_id,
    name: row.name,
    description: row.description || undefined,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function transformDependencyFromRow(row: ParticipantDependencyRow): ParticipantDependency {
  return {
    id: row.id,
    participantId: row.participant_id,
    linkedParticipantId: row.linked_participant_id || undefined,
    linkType: row.link_type,
    notes: row.notes || undefined,
    createdAt: row.created_at,
  };
}

export function transformOrganisationRoleFromRow(row: ParticipantOrganisationRoleRow): ParticipantOrganisationRole {
  return {
    id: row.id,
    participantId: row.participant_id,
    roleType: row.role_type,
    otherDescription: row.other_description || undefined,
    createdAt: row.created_at,
  };
}
