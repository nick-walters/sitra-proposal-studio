// Template system types for Horizon Europe and other funding programmes

export interface FundingProgramme {
  id: string;
  name: string;
  short_name?: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateType {
  id: string;
  funding_programme_id: string;
  code: string; // e.g., 'RIA', 'IA', 'CSA'
  name: string;
  description?: string;
  parent_type_id?: string; // For variants like CBE JU RIA
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  funding_programme?: FundingProgramme;
  parent_type?: TemplateType;
}

export type EditorType = 'form' | 'rich_text' | 'summary';

export interface TemplateSection {
  id: string;
  template_type_id: string;
  part: 'A' | 'B';
  section_number: string;
  title: string;
  description?: string;
  editor_type: EditorType;
  word_limit?: number;
  page_limit?: number;
  order_index: number;
  parent_section_id?: string;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Nested data
  children?: TemplateSection[];
  guidelines?: SectionGuideline[];
  form_fields?: TemplateFormField[];
}

export type GuidelineType = 'official' | 'sitra_tip' | 'evaluation';

export interface SectionGuideline {
  id: string;
  section_id: string;
  guideline_type: GuidelineType;
  title: string;
  content: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type FieldType = 
  | 'text' 
  | 'textarea' 
  | 'select' 
  | 'checkbox' 
  | 'date' 
  | 'number' 
  | 'email' 
  | 'url' 
  | 'country' 
  | 'organisation';

export interface TemplateFormField {
  id: string;
  section_id: string;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  placeholder?: string;
  options?: { label: string; value: string }[];
  validation_rules?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  help_text?: string;
  is_required: boolean;
  is_participant_specific: boolean; // If true, each participant fills this separately
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetTemplate {
  id: string;
  template_type_id?: string;
  name: string;
  budget_type: 'traditional' | 'lump_sum';
  categories: BudgetCategory[];
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  description?: string;
  subcategories?: {
    id: string;
    name: string;
    description?: string;
  }[];
}

// User role types
export type AppRole = 'owner' | 'admin' | 'editor' | 'viewer';

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  owner: 'Full access including template management',
  admin: 'Can manage proposals, users, and settings',
  editor: 'Can edit proposal content',
  viewer: 'Can only view proposals',
};

// Permission helpers
export const canManageTemplates = (role: AppRole) => role === 'owner';
export const canManageProposal = (role: AppRole) => role === 'owner' || role === 'admin';
export const canEditProposal = (role: AppRole) => role === 'owner' || role === 'admin' || role === 'editor';
export const canViewProposal = (role: AppRole) => true; // All roles can view
