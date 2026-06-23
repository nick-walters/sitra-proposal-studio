import { supabase } from '@/integrations/supabase/client';

export interface PopulateSelections {
  objectives: boolean;
  descriptionBeforeTasks: boolean;
  tasks: Record<string, boolean>; // taskId → selected
  deliverables: Record<string, boolean>; // deliverableId → selected
  milestones: Record<string, boolean>; // milestoneId → selected
  risks: Record<string, boolean>; // riskId → selected
}

export interface WPDraftForPopulate {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  color: string;
  objectives: string | null;
  description_before_tasks: string | null;
  tasks: {
    id: string;
    number: number;
    title: string | null;
    description: string | null;
    lead_participant_id: string | null;
    start_month: number | null;
    end_month: number | null;
    participants: { participant_id: string }[];
  }[];
  deliverables: {
    id: string;
    number: number;
    title: string | null;
    type: string | null;
    dissemination_level: string | null;
    responsible_participant_id: string | null;
    due_month: number | null;
    description: string | null;
    task_id: string | null;
  }[];
  milestones: {
    id: string;
    number: number;
    title: string | null;
    due_month: number | null;
    means_of_verification: string | null;
    related_wps: string | null;
  }[];
  risks: {
    id: string;
    number: number;
    title: string | null;
    likelihood: string | null;
    severity: string | null;
    mitigation: string | null;
    related_wps: string;
  }[];
}

/**
 * Fetch WP draft data for the populate dialog
 */
export async function fetchWPDraftsForPopulate(proposalId: string): Promise<WPDraftForPopulate[]> {
  const { data, error } = await supabase
    .from('wp_drafts')
    .select(`
      id, number, short_name, title, color, objectives, description_before_tasks,
      tasks:wp_draft_tasks(id, number, title, description, lead_participant_id, start_month, end_month,
        participants:wp_draft_task_participants(participant_id)
      ),
      deliverables:wp_draft_deliverables(id, number, title, type, dissemination_level, responsible_participant_id, due_month, description, task_id),
      milestones:wp_draft_milestones(id, number, title, due_month, means_of_verification, related_wps),
      risks:wp_draft_risks(id, number, title, likelihood, severity, mitigation, related_wps)
    `)
    .eq('proposal_id', proposalId)
    .order('number');

  if (error) throw error;

  return (data || []).map((wp: any) => ({
    ...wp,
    tasks: (wp.tasks || []).sort((a: any, b: any) => a.number - b.number),
    deliverables: (wp.deliverables || []).sort((a: any, b: any) => a.number - b.number),
    milestones: (wp.milestones || []).sort((a: any, b: any) => a.number - b.number),
    risks: (wp.risks || []).sort((a: any, b: any) => a.number - b.number),
  }));
}

/**
 * Populate Part B3.1 with selected WP draft content
 */
export async function populateB31(
  proposalId: string,
  wpDrafts: WPDraftForPopulate[],
  selections: PopulateSelections
): Promise<{ success: boolean; error?: string; counts: { objectives: number; tasks: number; deliverables: number; milestones: number; risks: number } }> {
  const counts = { objectives: 0, tasks: 0, deliverables: 0, milestones: 0, risks: 0 };

  // Track which WPs had each section populated so we can flag b31_populated_* on wp_drafts
  const populatedFlagsPerWp = new Map<string, {
    objectives?: boolean;
    description?: boolean;
    tasks?: boolean;
    deliverables?: boolean;
    milestones?: boolean;
    risks?: boolean;
  }>();
  const flag = (wpId: string, key: 'objectives' | 'description' | 'tasks' | 'deliverables' | 'milestones' | 'risks') => {
    const cur = populatedFlagsPerWp.get(wpId) || {};
    cur[key] = true;
    populatedFlagsPerWp.set(wpId, cur);
  };

  try {
    // 1. Copy objectives
    if (selections.objectives) {
      for (const wp of wpDrafts) {
        await supabase
          .from('wp_drafts')
          .update({ b31_objectives: wp.objectives || null })
          .eq('id', wp.id);
        flag(wp.id, 'objectives');
        counts.objectives++;
      }
    }

    // 1b. Copy description before tasks
    if (selections.descriptionBeforeTasks) {
      for (const wp of wpDrafts) {
        await supabase
          .from('wp_drafts')
          .update({ b31_description_before_tasks: wp.description_before_tasks || null } as any)
          .eq('id', wp.id);
        flag(wp.id, 'description');
      }
    }

    // 2. Copy tasks → b31_tasks (replace existing b31_tasks for selected WPs)
    for (const wp of wpDrafts) {
      const selectedTasks = wp.tasks.filter(t => selections.tasks[t.id]);
      if (selectedTasks.length === 0) continue;
      flag(wp.id, 'tasks');



      // Delete existing b31_tasks for this WP
      await supabase.from('b31_tasks').delete().eq('wp_draft_id', wp.id);

      // Insert new b31_tasks from draft tasks
      for (let i = 0; i < selectedTasks.length; i++) {
        const task = selectedTasks[i];
        const { data: inserted } = await supabase
          .from('b31_tasks')
          .insert({
            wp_draft_id: wp.id,
            wp_draft_task_id: task.id,
            number: i + 1,
            title: task.title,
            description: task.description,
            lead_participant_id: task.lead_participant_id,
            start_month: task.start_month,
            end_month: task.end_month,
            order_index: i,
          } as any)
          .select('id')
          .single();

        // Copy task participants
        if (inserted && task.participants && task.participants.length > 0) {
          await supabase
            .from('b31_task_participants')
            .insert(task.participants.map(p => ({
              task_id: inserted.id,
              participant_id: p.participant_id,
            })));
        }

        counts.tasks++;
      }
    }

    // 3. Copy deliverables → b31_deliverables
    const selectedDeliverableIds = Object.entries(selections.deliverables)
      .filter(([, v]) => v)
      .map(([id]) => id);

    if (selectedDeliverableIds.length > 0) {
      for (const wp of wpDrafts) {
        for (const del of wp.deliverables) {
          if (!selections.deliverables[del.id]) continue;

          // Check if already exists by matching wp_number + number pattern
          const delNumber = `D${wp.number}.${del.number}`;
          const { data: existing } = await supabase
            .from('b31_deliverables')
            .select('id')
            .eq('proposal_id', proposalId)
            .eq('number', delNumber)
            .maybeSingle();

          if (existing) {
            // Update existing
            await supabase
              .from('b31_deliverables')
              .update({
                name: del.title || '',
                description: del.description || '',
                type: del.type,
                dissemination_level: del.dissemination_level,
                lead_participant_id: del.responsible_participant_id,
                due_month: del.due_month,
                wp_number: wp.number,
                task_id: del.task_id,
              })
              .eq('id', existing.id);
          } else {
            // Get next order_index
            const { data: maxOrder } = await supabase
              .from('b31_deliverables')
              .select('order_index')
              .eq('proposal_id', proposalId)
              .order('order_index', { ascending: false })
              .limit(1)
              .maybeSingle();

            await supabase
              .from('b31_deliverables')
              .insert({
                proposal_id: proposalId,
                number: delNumber,
                name: del.title || '',
                description: del.description || '',
                type: del.type,
                dissemination_level: del.dissemination_level,
                lead_participant_id: del.responsible_participant_id,
                due_month: del.due_month,
                wp_number: wp.number,
                task_id: del.task_id,
                order_index: (maxOrder?.order_index ?? -1) + 1,
              });
          }
          counts.deliverables++;
        }
      }
    }

    // 4. Copy milestones → b31_milestones
    const selectedMilestoneIds = Object.entries(selections.milestones)
      .filter(([, v]) => v)
      .map(([id]) => id);

    if (selectedMilestoneIds.length > 0) {
      // Build a global milestone numbering
      let msIndex = 0;
      for (const wp of wpDrafts) {
        for (const ms of wp.milestones) {
          if (!selections.milestones[ms.id]) continue;
          msIndex++;

          const wpsValue = ms.related_wps || `WP${wp.number}`;

          // Check if exists by number
          const { data: existing } = await supabase
            .from('b31_milestones')
            .select('id')
            .eq('proposal_id', proposalId)
            .eq('number', msIndex)
            .maybeSingle();

          if (existing) {
            await supabase
              .from('b31_milestones')
              .update({
                name: ms.title || '',
                wps: wpsValue,
                due_month: ms.due_month,
                means_of_verification: ms.means_of_verification || '',
              })
              .eq('id', existing.id);
          } else {
            const { data: maxOrder } = await supabase
              .from('b31_milestones')
              .select('order_index')
              .eq('proposal_id', proposalId)
              .order('order_index', { ascending: false })
              .limit(1)
              .maybeSingle();

            await supabase
              .from('b31_milestones')
              .insert({
                proposal_id: proposalId,
                number: msIndex,
                name: ms.title || '',
                wps: wpsValue,
                due_month: ms.due_month,
                means_of_verification: ms.means_of_verification || '',
                order_index: (maxOrder?.order_index ?? -1) + 1,
              });
          }
          counts.milestones++;
        }
      }
    }

    // 5. Copy risks → b31_risks
    const selectedRiskIds = Object.entries(selections.risks)
      .filter(([, v]) => v)
      .map(([id]) => id);

    if (selectedRiskIds.length > 0) {
      let riskIndex = 0;
      for (const wp of wpDrafts) {
        for (const risk of wp.risks) {
          if (!selections.risks[risk.id]) continue;
          riskIndex++;

          const wpsValue = risk.related_wps || `WP${wp.number}`;

          const { data: existing } = await supabase
            .from('b31_risks')
            .select('id')
            .eq('proposal_id', proposalId)
            .eq('number', riskIndex)
            .maybeSingle();

          if (existing) {
            await supabase
              .from('b31_risks')
              .update({
                description: risk.title || '',
                wps: wpsValue,
                likelihood: risk.likelihood,
                severity: risk.severity,
                mitigation: risk.mitigation || '',
              })
              .eq('id', existing.id);
          } else {
            const { data: maxOrder } = await supabase
              .from('b31_risks')
              .select('order_index')
              .eq('proposal_id', proposalId)
              .order('order_index', { ascending: false })
              .limit(1)
              .maybeSingle();

            await supabase
              .from('b31_risks')
              .insert({
                proposal_id: proposalId,
                number: riskIndex,
                description: risk.title || '',
                wps: wpsValue,
                likelihood: risk.likelihood,
                severity: risk.severity,
                mitigation: risk.mitigation || '',
                order_index: (maxOrder?.order_index ?? -1) + 1,
              });
          }
          counts.risks++;
        }
      }
    }

    return { success: true, counts };
  } catch (error) {
    console.error('Error populating B3.1:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      counts,
    };
  }
}
