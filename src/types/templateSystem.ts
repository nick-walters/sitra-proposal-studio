// Template System Types - Hybrid Inheritance Model

export interface BaseTemplate {
  id: string;
  code: string;
  name: string;
  description?: string;
  funding_programme_id?: string;
  parent_type_id?: string;
  action_types: string[]; // ['RIA', 'IA'] or ['CSA']
  submission_stage: 'stage_1' | 'full';
  base_page_limit: number;
  includes_branding: boolean;
  includes_participant_table: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  funding_programme?: {
    id: string;
    name: string;
    short_name?: string;
  };
}

export interface TemplateModifier {
  id: string;
  code: string;
  name: string;
  description?: string;
  conditions: ModifierConditions;
  effects: ModifierEffects;
  is_admin_editable: boolean;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface ModifierConditions {
  budget_type?: 'traditional' | 'lump_sum';
  action_type?: 'RIA' | 'IA' | 'CSA';
  work_programme?: string;
  submission_stage?: 'stage_1' | 'full';
}

export interface ModifierEffects {
  page_limit_delta?: number;
  add_section_ids?: string[];
  funding_rate_override?: number;
}

export interface WorkProgrammeExtension {
  id: string;
  work_programme_code: string;
  name: string;
  description?: string;
  extra_section_ids: string[];
  extra_part_a_fields: PartAFieldDefinition[];
  funding_overrides: Record<string, number>; // e.g., { "IA_company": 0.60 }
  page_limit_delta: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartAFieldDefinition {
  field_name: string;
  field_label: string;
  field_type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
  placeholder?: string;
  help_text?: string;
  options?: { value: string; label: string }[];
  is_required: boolean;
  order_index: number;
}

export interface FundingRule {
  id: string;
  name: string;
  description?: string;
  conditions: FundingRuleConditions;
  funding_rate: number; // 0.60 = 60%, 1.00 = 100%
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FundingRuleConditions {
  action_type?: 'RIA' | 'IA' | 'CSA';
  participant_type?: 'academic' | 'company' | 'research_org' | 'public_body';
  work_programme?: string;
}

export interface ProposalTemplate {
  id: string;
  proposal_id: string;
  source_template_type_id?: string;
  applied_modifier_ids: string[];
  applied_extension_ids: string[];
  includes_branding: boolean;
  includes_participant_table: boolean;
  base_page_limit: number;
  is_customized: boolean;
  created_at: string;
  updated_at: string;
  sections?: ProposalTemplateSection[];
}

export interface ProposalTemplateSection {
  id: string;
  proposal_template_id: string;
  source_section_id?: string;
  section_number: string;
  title: string;
  description?: string;
  part: 'A' | 'B';
  editor_type: 'rich_text' | 'form' | 'table' | 'none';
  page_limit?: number;
  word_limit?: number;
  section_tag?: string;
  placeholder_content?: string; // Pre-filled guidance text for writers
  order_index: number;
  parent_section_id?: string;
  is_required: boolean;
  is_active: boolean;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
  children?: ProposalTemplateSection[];
  guidelines?: ProposalSectionGuideline[];
}

export interface ProposalSectionGuideline {
  id: string;
  proposal_section_id: string;
  source_guideline_id?: string;
  guideline_type: 'official' | 'sitra_tip' | 'evaluation';
  title: string;
  content: string;
  order_index: number;
  is_active: boolean;
}

// Helper type for assembled template (base + modifiers + extensions)
export interface AssembledTemplate {
  baseTemplate: BaseTemplate;
  appliedModifiers: TemplateModifier[];
  appliedExtension?: WorkProgrammeExtension;
  effectivePageLimit: number;
  includesBranding: boolean;
  includesParticipantTable: boolean;
}

// Funding rate calculation result
export interface FundingRateResult {
  rate: number;
  appliedRule: FundingRule;
  description: string;
}
