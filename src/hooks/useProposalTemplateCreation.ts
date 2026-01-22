import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProposalType, BudgetType, SubmissionStage } from '@/types/proposal';

interface CreateProposalTemplateParams {
  proposalId: string;
  sourceTemplateTypeId: string;
  budgetType: BudgetType;
  actionType: ProposalType;
  submissionStage: SubmissionStage;
  workProgramme?: string;
}

/**
 * Hook for creating proposal templates when a new proposal is created.
 * This copies the base template and its sections to the proposal,
 * applying any relevant modifiers and extensions.
 */
export function useProposalTemplateCreation() {
  
  const createProposalTemplate = useCallback(async (params: CreateProposalTemplateParams) => {
    const { 
      proposalId, 
      sourceTemplateTypeId, 
      budgetType, 
      actionType, 
      submissionStage, 
      workProgramme 
    } = params;

    try {
      // 1. Fetch the source template type
      const { data: sourceTemplate, error: templateError } = await supabase
        .from('template_types')
        .select('*')
        .eq('id', sourceTemplateTypeId)
        .single();

      if (templateError || !sourceTemplate) {
        console.error('Error fetching source template:', templateError);
        return { success: false, error: templateError };
      }

      // 2. Fetch applicable modifiers
      const { data: modifiers } = await supabase
        .from('template_modifiers')
        .select('*')
        .eq('is_active', true);

      // Filter modifiers that apply to this context
      const applicableModifierIds: string[] = [];
      let pageLimitDelta = 0;

      for (const mod of modifiers || []) {
        const cond = mod.conditions as Record<string, string>;
        let matches = true;

        if (cond.budget_type && cond.budget_type !== budgetType) matches = false;
        if (cond.action_type && cond.action_type !== actionType) matches = false;
        if (cond.work_programme && cond.work_programme !== workProgramme) matches = false;
        if (cond.submission_stage && cond.submission_stage !== submissionStage) matches = false;

        if (matches) {
          applicableModifierIds.push(mod.id);
          const effects = mod.effects as Record<string, number>;
          if (effects.page_limit_delta) {
            pageLimitDelta += effects.page_limit_delta;
          }
        }
      }

      // 3. Fetch applicable extension
      const { data: extension } = await supabase
        .from('work_programme_extensions')
        .select('*')
        .eq('work_programme_code', workProgramme || '')
        .eq('is_active', true)
        .maybeSingle();

      const appliedExtensionIds = extension ? [extension.id] : [];
      if (extension?.page_limit_delta) {
        pageLimitDelta += extension.page_limit_delta;
      }

      // 4. Create the proposal template
      const effectivePageLimit = (sourceTemplate.base_page_limit || 45) + pageLimitDelta;

      const { data: proposalTemplate, error: createError } = await supabase
        .from('proposal_templates')
        .insert({
          proposal_id: proposalId,
          source_template_type_id: sourceTemplateTypeId,
          applied_modifier_ids: applicableModifierIds,
          applied_extension_ids: appliedExtensionIds,
          includes_branding: sourceTemplate.includes_branding ?? true,
          includes_participant_table: sourceTemplate.includes_participant_table ?? true,
          base_page_limit: effectivePageLimit,
          is_customized: false,
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating proposal template:', createError);
        return { success: false, error: createError };
      }

      // 5. Copy template sections to proposal
      const { data: sourceSections, error: sectionsError } = await supabase
        .from('template_sections')
        .select(`
          *,
          guidelines:section_guidelines(*)
        `)
        .eq('template_type_id', sourceTemplateTypeId)
        .eq('is_active', true)
        .order('order_index');

      if (sectionsError) {
        console.error('Error fetching source sections:', sectionsError);
        return { success: false, error: sectionsError };
      }

      // Create a map to track old ID -> new ID for parent relationships
      const sectionIdMap = new Map<string, string>();

      // First pass: create sections without parent references
      for (const section of sourceSections || []) {
        const { data: newSection, error: sectionError } = await supabase
          .from('proposal_template_sections')
          .insert({
            proposal_template_id: proposalTemplate.id,
            source_section_id: section.id,
            section_number: section.section_number,
            title: section.title,
            description: section.description,
            part: section.part,
            editor_type: section.editor_type,
            page_limit: section.page_limit,
            word_limit: section.word_limit,
            section_tag: section.section_tag,
            order_index: section.order_index,
            parent_section_id: null, // Set in second pass
            is_required: section.is_required,
            is_active: true,
            is_custom: false,
          })
          .select()
          .single();

        if (sectionError) {
          console.error('Error creating proposal section:', sectionError);
          continue;
        }

        sectionIdMap.set(section.id, newSection.id);

        // Copy guidelines for this section
        const guidelines = section.guidelines || [];
        for (const guideline of guidelines) {
          await supabase
            .from('proposal_section_guidelines')
            .insert({
              proposal_section_id: newSection.id,
              source_guideline_id: guideline.id,
              guideline_type: guideline.guideline_type,
              title: guideline.title,
              content: guideline.content,
              order_index: guideline.order_index,
              is_active: true,
            });
        }
      }

      // Second pass: update parent references
      for (const section of sourceSections || []) {
        if (section.parent_section_id) {
          const newSectionId = sectionIdMap.get(section.id);
          const newParentId = sectionIdMap.get(section.parent_section_id);
          
          if (newSectionId && newParentId) {
            await supabase
              .from('proposal_template_sections')
              .update({ parent_section_id: newParentId })
              .eq('id', newSectionId);
          }
        }
      }

      return { success: true, proposalTemplate };

    } catch (error) {
      console.error('Error in createProposalTemplate:', error);
      return { success: false, error };
    }
  }, []);

  /**
   * Save current proposal template as a new base template
   */
  const saveAsNewTemplate = useCallback(async (
    proposalId: string,
    newTemplateCode: string,
    newTemplateName: string
  ) => {
    try {
      // 1. Fetch the proposal template and its sections
      const { data: proposalTemplate, error: templateError } = await supabase
        .from('proposal_templates')
        .select('*')
        .eq('proposal_id', proposalId)
        .single();

      if (templateError || !proposalTemplate) {
        return { success: false, error: templateError || new Error('No proposal template found') };
      }

      // 2. Fetch proposal details for context
      const { data: proposal } = await supabase
        .from('proposals')
        .select('type, submission_stage')
        .eq('id', proposalId)
        .single();

      // 3. Create new base template
      const { data: newTemplate, error: createError } = await supabase
        .from('template_types')
        .insert({
          code: newTemplateCode,
          name: newTemplateName,
          action_types: proposal?.type ? [proposal.type] : ['RIA'],
          submission_stage: proposal?.submission_stage || 'full',
          base_page_limit: proposalTemplate.base_page_limit,
          includes_branding: proposalTemplate.includes_branding,
          includes_participant_table: proposalTemplate.includes_participant_table,
          is_active: true,
        })
        .select()
        .single();

      if (createError) {
        return { success: false, error: createError };
      }

      // 4. Fetch proposal template sections
      const { data: proposalSections } = await supabase
        .from('proposal_template_sections')
        .select(`
          *,
          guidelines:proposal_section_guidelines(*)
        `)
        .eq('proposal_template_id', proposalTemplate.id)
        .eq('is_active', true)
        .order('order_index');

      // 5. Copy sections to new base template
      const sectionIdMap = new Map<string, string>();

      for (const section of proposalSections || []) {
        const { data: newSection } = await supabase
          .from('template_sections')
          .insert({
            template_type_id: newTemplate.id,
            section_number: section.section_number,
            title: section.title,
            description: section.description,
            part: section.part,
            editor_type: section.editor_type,
            page_limit: section.page_limit,
            word_limit: section.word_limit,
            section_tag: section.section_tag,
            order_index: section.order_index,
            parent_section_id: null,
            is_required: section.is_required,
            is_active: true,
          })
          .select()
          .single();

        if (newSection) {
          sectionIdMap.set(section.id, newSection.id);

          // Copy guidelines
          const guidelines = section.guidelines || [];
          for (const guideline of guidelines) {
            await supabase
              .from('section_guidelines')
              .insert({
                section_id: newSection.id,
                guideline_type: guideline.guideline_type,
                title: guideline.title,
                content: guideline.content,
                order_index: guideline.order_index,
                is_active: true,
              });
          }
        }
      }

      // 6. Update parent references
      for (const section of proposalSections || []) {
        if (section.parent_section_id) {
          const newSectionId = sectionIdMap.get(section.id);
          const oldParentNewId = sectionIdMap.get(section.parent_section_id);
          
          if (newSectionId && oldParentNewId) {
            await supabase
              .from('template_sections')
              .update({ parent_section_id: oldParentNewId })
              .eq('id', newSectionId);
          }
        }
      }

      return { success: true, newTemplate };

    } catch (error) {
      console.error('Error saving as new template:', error);
      return { success: false, error };
    }
  }, []);

  return {
    createProposalTemplate,
    saveAsNewTemplate,
  };
}
