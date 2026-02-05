import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  BaseTemplate,
  TemplateModifier,
  WorkProgrammeExtension,
  FundingRule,
  ProposalTemplate,
  ProposalTemplateSection,
  AssembledTemplate,
  FundingRateResult,
  ModifierConditions,
} from '@/types/templates';
import { ProposalType, BudgetType, SubmissionStage } from '@/types/proposal';

// =====================================================
// Hook: useBaseTemplates - Fetch and manage base templates
// =====================================================
export function useBaseTemplates() {
  const [templates, setTemplates] = useState<BaseTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('template_types')
      .select(`
        *,
        funding_programme:funding_programmes(id, name, short_name)
      `)
      .eq('is_active', true)
      .order('code');

    if (error) {
      console.error('Error fetching base templates:', error);
    } else {
      setTemplates(data as BaseTemplate[] || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Filter templates by action type and submission stage
  const getMatchingTemplates = useCallback((
    actionType: ProposalType,
    submissionStage: SubmissionStage
  ): BaseTemplate[] => {
    return templates.filter(t => 
      t.action_types?.includes(actionType) && 
      t.submission_stage === submissionStage
    );
  }, [templates]);

  return {
    templates,
    loading,
    refetch: fetchTemplates,
    getMatchingTemplates,
  };
}

// =====================================================
// Hook: useTemplateModifiers - Fetch and manage modifiers
// =====================================================
export function useTemplateModifiers() {
  const [modifiers, setModifiers] = useState<TemplateModifier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModifiers = async () => {
      const { data, error } = await supabase
        .from('template_modifiers')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (error) {
        console.error('Error fetching template modifiers:', error);
      } else {
        // Parse JSONB fields
        const parsed = (data || []).map(m => ({
          ...m,
          conditions: m.conditions as ModifierConditions,
          effects: m.effects as Record<string, unknown>,
        }));
        setModifiers(parsed as TemplateModifier[]);
      }
      setLoading(false);
    };

    fetchModifiers();
  }, []);

  // Get applicable modifiers based on proposal context
  const getApplicableModifiers = useCallback((context: {
    budgetType?: BudgetType;
    actionType?: ProposalType;
    workProgramme?: string;
    submissionStage?: SubmissionStage;
  }): TemplateModifier[] => {
    return modifiers.filter(mod => {
      const cond = mod.conditions;
      
      // Check each condition - if specified, it must match
      if (cond.budget_type && cond.budget_type !== context.budgetType) return false;
      if (cond.action_type && cond.action_type !== context.actionType) return false;
      if (cond.work_programme && cond.work_programme !== context.workProgramme) return false;
      if (cond.submission_stage && cond.submission_stage !== context.submissionStage) return false;
      
      return true;
    });
  }, [modifiers]);

  return {
    modifiers,
    loading,
    getApplicableModifiers,
  };
}

// =====================================================
// Hook: useWorkProgrammeExtensions
// =====================================================
export function useWorkProgrammeExtensions() {
  const [extensions, setExtensions] = useState<WorkProgrammeExtension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExtensions = async () => {
      const { data, error } = await supabase
        .from('work_programme_extensions')
        .select('*')
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching work programme extensions:', error);
      } else {
        // Parse JSONB fields properly
        const parsed = (data || []).map(ext => ({
          ...ext,
          extra_part_a_fields: (ext.extra_part_a_fields || []) as unknown as WorkProgrammeExtension['extra_part_a_fields'],
          funding_overrides: (ext.funding_overrides || {}) as Record<string, number>,
        }));
        setExtensions(parsed as WorkProgrammeExtension[]);
      }
      setLoading(false);
    };

    fetchExtensions();
  }, []);

  const getExtensionForProgramme = useCallback((workProgrammeCode: string): WorkProgrammeExtension | undefined => {
    return extensions.find(ext => ext.work_programme_code === workProgrammeCode);
  }, [extensions]);

  return {
    extensions,
    loading,
    getExtensionForProgramme,
  };
}

// =====================================================
// Hook: useFundingRules - Calculate funding rates
// =====================================================
export function useFundingRules() {
  const [rules, setRules] = useState<FundingRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRules = async () => {
      const { data, error } = await supabase
        .from('funding_rules')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (error) {
        console.error('Error fetching funding rules:', error);
      } else {
        setRules(data as FundingRule[] || []);
      }
      setLoading(false);
    };

    fetchRules();
  }, []);

  // Calculate funding rate for a given context
  const calculateFundingRate = useCallback((context: {
    actionType: ProposalType;
    participantType: 'academic' | 'company' | 'research_org' | 'public_body';
    workProgramme?: string;
  }): FundingRateResult | null => {
    // Rules are ordered by priority (highest first)
    for (const rule of rules) {
      const cond = rule.conditions;
      
      // Check each condition
      if (cond.action_type && cond.action_type !== context.actionType) continue;
      if (cond.participant_type && cond.participant_type !== context.participantType) continue;
      if (cond.work_programme && cond.work_programme !== context.workProgramme) continue;
      
      // All conditions match!
      return {
        rate: Number(rule.funding_rate),
        appliedRule: rule,
        description: rule.description || rule.name,
      };
    }

    // Default fallback
    return {
      rate: 1.0,
      appliedRule: {} as FundingRule,
      description: 'Default 100% funding',
    };
  }, [rules]);

  return {
    rules,
    loading,
    calculateFundingRate,
  };
}

// =====================================================
// Hook: useProposalTemplate - Manage per-proposal template
// =====================================================
export function useProposalTemplate(proposalId: string | null) {
  const [proposalTemplate, setProposalTemplate] = useState<ProposalTemplate | null>(null);
  const [sections, setSections] = useState<ProposalTemplateSection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProposalTemplate = useCallback(async () => {
    if (!proposalId) {
      setProposalTemplate(null);
      setSections([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Fetch proposal template
    const { data: templateData, error: templateError } = await supabase
      .from('proposal_templates')
      .select('*')
      .eq('proposal_id', proposalId)
      .maybeSingle();

    if (templateError) {
      console.error('Error fetching proposal template:', templateError);
      setLoading(false);
      return;
    }

    if (templateData) {
      setProposalTemplate(templateData as ProposalTemplate);

      // Fetch sections for this proposal template
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('proposal_template_sections')
        .select(`
          *,
          guidelines:proposal_section_guidelines(*)
        `)
        .eq('proposal_template_id', templateData.id)
        .eq('is_active', true)
        .order('order_index');

      if (sectionsError) {
        console.error('Error fetching proposal template sections:', sectionsError);
      } else {
        // Build hierarchy
        const sectionsWithChildren = buildSectionHierarchy(sectionsData as ProposalTemplateSection[]);
        setSections(sectionsWithChildren);
      }
    } else {
      setProposalTemplate(null);
      setSections([]);
    }

    setLoading(false);
  }, [proposalId]);

  useEffect(() => {
    fetchProposalTemplate();
  }, [fetchProposalTemplate]);

  return {
    proposalTemplate,
    sections,
    loading,
    refetch: fetchProposalTemplate,
  };
}

// =====================================================
// Hook: useTemplateAssembly - Assemble template for new proposal
// =====================================================
export function useTemplateAssembly() {
  const { templates, getMatchingTemplates } = useBaseTemplates();
  const { getApplicableModifiers } = useTemplateModifiers();
  const { getExtensionForProgramme } = useWorkProgrammeExtensions();

  const assembleTemplate = useCallback((context: {
    actionType: ProposalType;
    submissionStage: SubmissionStage;
    budgetType: BudgetType;
    workProgramme?: string;
  }): AssembledTemplate | null => {
    // 1. Find matching base template
    const matchingTemplates = getMatchingTemplates(context.actionType, context.submissionStage);
    if (matchingTemplates.length === 0) return null;

    const baseTemplate = matchingTemplates[0]; // Take first match

    // 2. Get applicable modifiers
    const modifiers = getApplicableModifiers({
      budgetType: context.budgetType,
      actionType: context.actionType,
      workProgramme: context.workProgramme,
      submissionStage: context.submissionStage,
    });

    // 3. Get work programme extension (if applicable)
    const extension = context.workProgramme 
      ? getExtensionForProgramme(context.workProgramme) 
      : undefined;

    // 4. Calculate effective page limit
    let effectivePageLimit = baseTemplate.base_page_limit || 45;
    
    // Apply modifier effects
    for (const mod of modifiers) {
      if (mod.effects.page_limit_delta) {
        effectivePageLimit += mod.effects.page_limit_delta;
      }
    }

    // Apply extension page delta
    if (extension?.page_limit_delta) {
      effectivePageLimit += extension.page_limit_delta;
    }

    return {
      baseTemplate,
      appliedModifiers: modifiers,
      appliedExtension: extension,
      effectivePageLimit,
      includesBranding: baseTemplate.includes_branding ?? true,
      includesParticipantTable: baseTemplate.includes_participant_table ?? true,
    };
  }, [getMatchingTemplates, getApplicableModifiers, getExtensionForProgramme]);

  return {
    assembleTemplate,
  };
}

// =====================================================
// Helper: Build section hierarchy from flat list
// =====================================================
function buildSectionHierarchy(sections: ProposalTemplateSection[]): ProposalTemplateSection[] {
  const sectionMap = new Map<string, ProposalTemplateSection>();
  const rootSections: ProposalTemplateSection[] = [];

  // First pass: create map
  sections.forEach(section => {
    sectionMap.set(section.id, { ...section, children: [] });
  });

  // Second pass: build hierarchy
  sections.forEach(section => {
    const current = sectionMap.get(section.id)!;
    if (section.parent_section_id) {
      const parent = sectionMap.get(section.parent_section_id);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(current);
      } else {
        rootSections.push(current);
      }
    } else {
      rootSections.push(current);
    }
  });

  // Sort children by order_index
  const sortChildren = (section: ProposalTemplateSection) => {
    if (section.children) {
      section.children.sort((a, b) => a.order_index - b.order_index);
      section.children.forEach(sortChildren);
    }
  };

  rootSections.sort((a, b) => a.order_index - b.order_index);
  rootSections.forEach(sortChildren);

  return rootSections;
}
