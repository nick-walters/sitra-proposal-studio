import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DuplicateRequest {
  proposalId: string;
  newAcronym: string;
  newTitle: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authenticated user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { proposalId, newAcronym, newTitle } = await req.json() as DuplicateRequest;

    if (!proposalId || !newAcronym || !newTitle) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch the original proposal
    const { data: originalProposal, error: proposalError } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (proposalError || !originalProposal) {
      return new Response(JSON.stringify({ error: 'Proposal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Create new proposal (as draft)
    const { data: newProposal, error: newProposalError } = await supabase
      .from('proposals')
      .insert({
        acronym: newAcronym,
        title: newTitle,
        description: originalProposal.description,
        type: originalProposal.type,
        status: 'draft',
        budget_type: originalProposal.budget_type,
        duration: originalProposal.duration,
        total_budget: originalProposal.total_budget,
        template_type_id: originalProposal.template_type_id,
        work_programme: originalProposal.work_programme,
        destination: originalProposal.destination,
        topic_id: originalProposal.topic_id,
        topic_title: originalProposal.topic_title,
        topic_url: originalProposal.topic_url,
        submission_stage: originalProposal.submission_stage,
        created_by: user.id,
        // Don't copy: deadline, decision_date, submitted_at, logo_url
      })
      .select()
      .single();

    if (newProposalError || !newProposal) {
      console.error('Error creating new proposal:', newProposalError);
      return new Response(JSON.stringify({ error: 'Failed to create new proposal' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newProposalId = newProposal.id;
    const participantIdMap = new Map<string, string>();
    const workPackageIdMap = new Map<string, string>();
    const memberIdMap = new Map<string, string>();

    // 3. Copy proposal_templates
    const { data: originalTemplate } = await supabase
      .from('proposal_templates')
      .select('*')
      .eq('proposal_id', proposalId)
      .single();

    if (originalTemplate) {
      const { data: newTemplate } = await supabase
        .from('proposal_templates')
        .insert({
          proposal_id: newProposalId,
          source_template_type_id: originalTemplate.source_template_type_id,
          base_page_limit: originalTemplate.base_page_limit,
          includes_branding: originalTemplate.includes_branding,
          includes_participant_table: originalTemplate.includes_participant_table,
          is_customized: originalTemplate.is_customized,
          applied_extension_ids: originalTemplate.applied_extension_ids,
          applied_modifier_ids: originalTemplate.applied_modifier_ids,
        })
        .select()
        .single();

      // 4. Copy proposal_template_sections
      if (newTemplate) {
        const { data: originalSections } = await supabase
          .from('proposal_template_sections')
          .select('*')
          .eq('proposal_template_id', originalTemplate.id);

        if (originalSections && originalSections.length > 0) {
          const sectionIdMap = new Map<string, string>();
          
          // First pass: insert sections without parent references
          for (const section of originalSections) {
            const { data: newSection } = await supabase
              .from('proposal_template_sections')
              .insert({
                proposal_template_id: newTemplate.id,
                source_section_id: section.source_section_id,
                section_number: section.section_number,
                section_tag: section.section_tag,
                title: section.title,
                description: section.description,
                placeholder_content: section.placeholder_content,
                part: section.part,
                order_index: section.order_index,
                is_required: section.is_required,
                is_active: section.is_active,
                is_custom: section.is_custom,
                editor_type: section.editor_type,
                word_limit: section.word_limit,
                page_limit: section.page_limit,
                // Clear assignments for new proposal
                assigned_to: null,
                assigned_by: null,
                assigned_at: null,
                due_date: null,
                is_locked: false,
                locked_by: null,
                locked_at: null,
                lock_reason: null,
              })
              .select()
              .single();

            if (newSection) {
              sectionIdMap.set(section.id, newSection.id);
            }
          }

          // Second pass: update parent references
          for (const section of originalSections) {
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
        }
      }
    }

    // 5. Copy participants
    const { data: originalParticipants } = await supabase
      .from('participants')
      .select('*')
      .eq('proposal_id', proposalId);

    if (originalParticipants && originalParticipants.length > 0) {
      for (const participant of originalParticipants) {
        const { data: newParticipant } = await supabase
          .from('participants')
          .insert({
            proposal_id: newProposalId,
            participant_number: participant.participant_number,
            organisation_type: participant.organisation_type,
            organisation_name: participant.organisation_name,
            organisation_short_name: participant.organisation_short_name,
            english_name: participant.english_name,
            pic_number: participant.pic_number,
            country: participant.country,
            address: participant.address,
            contact_email: participant.contact_email,
            legal_entity_type: participant.legal_entity_type,
            organisation_category: participant.organisation_category,
            is_sme: participant.is_sme,
            logo_url: participant.logo_url,
          })
          .select()
          .single();

        if (newParticipant) {
          participantIdMap.set(participant.id, newParticipant.id);
        }
      }
    }

    // 6. Copy participant_members
    const { data: originalMembers } = await supabase
      .from('participant_members')
      .select('*')
      .in('participant_id', Array.from(participantIdMap.keys()));

    if (originalMembers && originalMembers.length > 0) {
      for (const member of originalMembers) {
        const newParticipantId = participantIdMap.get(member.participant_id);
        if (newParticipantId) {
          const { data: newMember } = await supabase
            .from('participant_members')
            .insert({
              participant_id: newParticipantId,
              full_name: member.full_name,
              email: member.email,
              role_in_project: member.role_in_project,
              person_months: member.person_months,
              is_primary_contact: member.is_primary_contact,
              user_id: null, // Don't link to users in duplicated proposal
            })
            .select()
            .single();

          if (newMember) {
            memberIdMap.set(member.id, newMember.id);
          }
        }
      }
    }

    // 7. Copy work_packages
    const { data: originalWorkPackages } = await supabase
      .from('work_packages')
      .select('*')
      .eq('proposal_id', proposalId);

    if (originalWorkPackages && originalWorkPackages.length > 0) {
      for (const wp of originalWorkPackages) {
        const newLeadParticipantId = wp.lead_participant_id 
          ? participantIdMap.get(wp.lead_participant_id) 
          : null;
        
        const { data: newWp } = await supabase
          .from('work_packages')
          .insert({
            proposal_id: newProposalId,
            number: wp.number,
            title: wp.title,
            description: wp.description,
            start_month: wp.start_month,
            end_month: wp.end_month,
            lead_participant_id: newLeadParticipantId,
          })
          .select()
          .single();

        if (newWp) {
          workPackageIdMap.set(wp.id, newWp.id);
        }
      }
    }

    // 8. Copy member_wp_allocations
    const { data: originalAllocations } = await supabase
      .from('member_wp_allocations')
      .select('*')
      .in('work_package_id', Array.from(workPackageIdMap.keys()));

    if (originalAllocations && originalAllocations.length > 0) {
      const allocationsToInsert = originalAllocations
        .filter(alloc => memberIdMap.has(alloc.member_id) && workPackageIdMap.has(alloc.work_package_id))
        .map(alloc => ({
          member_id: memberIdMap.get(alloc.member_id)!,
          work_package_id: workPackageIdMap.get(alloc.work_package_id)!,
          person_months: alloc.person_months,
          role: alloc.role,
        }));

      if (allocationsToInsert.length > 0) {
        await supabase.from('member_wp_allocations').insert(allocationsToInsert);
      }
    }

    // 9. Copy budget_items
    const { data: originalBudgetItems } = await supabase
      .from('budget_items')
      .select('*')
      .eq('proposal_id', proposalId);

    if (originalBudgetItems && originalBudgetItems.length > 0) {
      const budgetItemsToInsert = originalBudgetItems
        .filter(item => participantIdMap.has(item.participant_id))
        .map(item => ({
          proposal_id: newProposalId,
          participant_id: participantIdMap.get(item.participant_id)!,
          category: item.category,
          subcategory: item.subcategory,
          description: item.description,
          amount: item.amount,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          person_months: item.person_months,
          cost_type: item.cost_type,
          work_package: item.work_package,
          justification: item.justification,
        }));

      if (budgetItemsToInsert.length > 0) {
        await supabase.from('budget_items').insert(budgetItemsToInsert);
      }
    }

    // 10. Copy section_content
    const { data: originalContent } = await supabase
      .from('section_content')
      .select('*')
      .eq('proposal_id', proposalId);

    if (originalContent && originalContent.length > 0) {
      const contentToInsert = originalContent.map(content => ({
        proposal_id: newProposalId,
        section_id: content.section_id,
        content: content.content,
        last_edited_by: user.id,
      }));

      await supabase.from('section_content').insert(contentToInsert);
    }

    // 11. Copy ethics_assessment
    const { data: originalEthics } = await supabase
      .from('ethics_assessment')
      .select('*')
      .eq('proposal_id', proposalId)
      .single();

    if (originalEthics) {
      await supabase.from('ethics_assessment').insert({
        proposal_id: newProposalId,
        human_subjects: originalEthics.human_subjects,
        human_subjects_details: originalEthics.human_subjects_details,
        human_cells: originalEthics.human_cells,
        human_cells_details: originalEthics.human_cells_details,
        personal_data: originalEthics.personal_data,
        personal_data_details: originalEthics.personal_data_details,
        animals: originalEthics.animals,
        animals_details: originalEthics.animals_details,
        environment: originalEthics.environment,
        environment_details: originalEthics.environment_details,
        dual_use: originalEthics.dual_use,
        dual_use_details: originalEthics.dual_use_details,
        misuse: originalEthics.misuse,
        misuse_details: originalEthics.misuse_details,
        third_countries: originalEthics.third_countries,
        third_countries_details: originalEthics.third_countries_details,
        other_ethics: originalEthics.other_ethics,
        other_ethics_details: originalEthics.other_ethics_details,
      });
    }

    // 12. Copy figures
    const { data: originalFigures } = await supabase
      .from('figures')
      .select('*')
      .eq('proposal_id', proposalId);

    if (originalFigures && originalFigures.length > 0) {
      const figuresToInsert = originalFigures.map(figure => ({
        proposal_id: newProposalId,
        section_id: figure.section_id,
        figure_number: figure.figure_number,
        figure_type: figure.figure_type,
        title: figure.title,
        caption: figure.caption,
        content: figure.content,
        order_index: figure.order_index,
      }));

      await supabase.from('figures').insert(figuresToInsert);
    }

    // 13. Copy references
    const { data: originalReferences } = await supabase
      .from('references')
      .select('*')
      .eq('proposal_id', proposalId);

    if (originalReferences && originalReferences.length > 0) {
      const referencesToInsert = originalReferences.map(ref => ({
        proposal_id: newProposalId,
        citation_number: ref.citation_number,
        title: ref.title,
        authors: ref.authors,
        year: ref.year,
        journal: ref.journal,
        volume: ref.volume,
        pages: ref.pages,
        doi: ref.doi,
        formatted_citation: ref.formatted_citation,
        verified: ref.verified,
      }));

      await supabase.from('references').insert(referencesToInsert);
    }

    // 14. Copy coordinator roles from original (not editor/viewer)
    const { data: originalRoles } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .eq('proposal_id', proposalId)
      .in('role', ['coordinator', 'owner']);

    const rolesToInsert = (originalRoles || []).map(r => ({
      user_id: r.user_id,
      role: 'coordinator' as const,
      proposal_id: newProposalId,
    }));

    // Ensure the duplicating user is a coordinator
    const hasCurrentUser = rolesToInsert.some(r => r.user_id === user.id);
    if (!hasCurrentUser) {
      rolesToInsert.push({
        user_id: user.id,
        role: 'coordinator' as const,
        proposal_id: newProposalId,
      });
    }

    if (rolesToInsert.length > 0) {
      await supabase.from('user_roles').insert(rolesToInsert);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        newProposalId,
        message: `Proposal "${newAcronym}" created successfully` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error duplicating proposal:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
