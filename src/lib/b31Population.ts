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
          flag(wp.id, 'deliverables');

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
          flag(wp.id, 'milestones');
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
          flag(wp.id, 'risks');
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

    // Flush per-WP populated flags
    for (const [wpId, flags] of populatedFlagsPerWp.entries()) {
      const update: Record<string, boolean> = {};
      if (flags.objectives) update.b31_populated_objectives = true;
      if (flags.description) update.b31_populated_description = true;
      if (flags.tasks) update.b31_populated_tasks = true;
      if (flags.deliverables) update.b31_populated_deliverables = true;
      if (flags.milestones) update.b31_populated_milestones = true;
      if (flags.risks) update.b31_populated_risks = true;
      if (Object.keys(update).length > 0) {
        await supabase.from('wp_drafts').update(update as any).eq('id', wpId);
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

/**
 * Per-section edit detection for the B3.1 populate overwrite warning.
 *
 * Returns the human-readable labels of sections that, if populated now, would
 * overwrite edits the user has made in Table 3.1.b since the last populate.
 *
 * Semantics per section:
 *  - Objectives / Optional description: compare wp_drafts.b31_* vs current draft
 *    value (only if previously populated).
 *  - Tasks: full delete+replace per WP — compare each selected draft task to its
 *    matching b31_tasks row (by wp_draft_task_id) including participants.
 *  - Deliverables: upsert-by-number "D{wp}.{n}" — compare matching row fields.
 *  - Milestones / Risks: upsert by globally renumbered index following the same
 *    order populate uses — compare matching row fields.
 *
 * A section is reported only if at least one selected WP has the matching
 * b31_populated_* flag set (i.e. it has been populated before). First-time
 * populate is silent.
 */
export async function detectB31EditedSections(
  proposalId: string,
  wpDrafts: WPDraftForPopulate[],
  selections: PopulateSelections,
): Promise<string[]> {
  const wpIds = wpDrafts.map((w) => w.id);
  if (wpIds.length === 0) return [];
  const dirty = new Set<string>();

  const { data: wpRows } = await supabase
    .from('wp_drafts')
    .select(
      'id, b31_objectives, b31_description_before_tasks, b31_populated_objectives, b31_populated_description, b31_populated_tasks, b31_populated_deliverables, b31_populated_milestones, b31_populated_risks',
    )
    .in('id', wpIds);
  const wpById = new Map<string, any>(((wpRows as any[]) || []).map((r: any) => [r.id, r]));

  // Objectives
  if (selections.objectives) {
    for (const wp of wpDrafts) {
      const row = wpById.get(wp.id);
      if (!row?.b31_populated_objectives) continue;
      if ((row.b31_objectives || '') !== (wp.objectives || '')) {
        dirty.add('Objectives');
        break;
      }
    }
  }

  // Optional description before tasks
  if (selections.descriptionBeforeTasks) {
    for (const wp of wpDrafts) {
      const row = wpById.get(wp.id);
      if (!row?.b31_populated_description) continue;
      if ((row.b31_description_before_tasks || '') !== (wp.description_before_tasks || '')) {
        dirty.add('Optional description before tasks');
        break;
      }
    }
  }

  // Tasks — delete+insert per WP
  const tWps = wpDrafts.filter((wp) => wp.tasks.some((t) => selections.tasks[t.id]));
  if (tWps.length > 0) {
    const ids = tWps.map((w) => w.id);
    const { data: existingTasks } = await supabase
      .from('b31_tasks')
      .select(
        'id, wp_draft_id, wp_draft_task_id, title, description, lead_participant_id, start_month, end_month, participants:b31_task_participants(participant_id)',
      )
      .in('wp_draft_id', ids);
    const byWp = new Map<string, any[]>();
    for (const t of ((existingTasks as any[]) || [])) {
      const arr = byWp.get(t.wp_draft_id) || [];
      arr.push(t);
      byWp.set(t.wp_draft_id, arr);
    }
    let flagged = false;
    for (const wp of tWps) {
      if (flagged) break;
      const row = wpById.get(wp.id);
      if (!row?.b31_populated_tasks) continue;
      const exById = new Map<string, any>((byWp.get(wp.id) || []).map((e) => [e.wp_draft_task_id, e]));
      if (exById.size === 0) continue;
      for (const t of wp.tasks) {
        if (!selections.tasks[t.id]) continue;
        const ex = exById.get(t.id);
        if (!ex) continue; // not previously populated → no edit to lose for this row
        if (
          (ex.title || '') !== (t.title || '') ||
          (ex.description || '') !== (t.description || '') ||
          (ex.lead_participant_id || null) !== (t.lead_participant_id || null) ||
          (ex.start_month ?? null) !== (t.start_month ?? null) ||
          (ex.end_month ?? null) !== (t.end_month ?? null)
        ) {
          dirty.add('Tasks');
          flagged = true;
          break;
        }
        const exP = new Set<string>(((ex.participants || []) as any[]).map((p) => p.participant_id));
        const drP = new Set<string>((t.participants || []).map((p) => p.participant_id));
        if (exP.size !== drP.size || [...exP].some((p) => !drP.has(p))) {
          dirty.add('Tasks');
          flagged = true;
          break;
        }
      }
    }
  }

  // Deliverables — upsert by number
  const dWps = wpDrafts.filter((wp) => wp.deliverables.some((d) => selections.deliverables[d.id]));
  if (dWps.length > 0) {
    const numbers = dWps.flatMap((wp) =>
      wp.deliverables.filter((d) => selections.deliverables[d.id]).map((d) => `D${wp.number}.${d.number}`),
    );
    const { data: existingDels } = await supabase
      .from('b31_deliverables')
      .select('number, name, description, type, dissemination_level, lead_participant_id, due_month, wp_number, task_id')
      .eq('proposal_id', proposalId)
      .in('number', numbers);
    const byNumber = new Map<string, any>(((existingDels as any[]) || []).map((d: any) => [d.number, d]));
    let flagged = false;
    for (const wp of dWps) {
      if (flagged) break;
      const row = wpById.get(wp.id);
      if (!row?.b31_populated_deliverables) continue;
      for (const d of wp.deliverables) {
        if (!selections.deliverables[d.id]) continue;
        const ex = byNumber.get(`D${wp.number}.${d.number}`);
        if (!ex) continue;
        if (
          (ex.name || '') !== (d.title || '') ||
          (ex.description || '') !== (d.description || '') ||
          (ex.type || null) !== (d.type || null) ||
          (ex.dissemination_level || null) !== (d.dissemination_level || null) ||
          (ex.lead_participant_id || null) !== (d.responsible_participant_id || null) ||
          (ex.due_month ?? null) !== (d.due_month ?? null) ||
          (ex.wp_number ?? null) !== (wp.number ?? null) ||
          (ex.task_id || null) !== (d.task_id || null)
        ) {
          dirty.add('Deliverables');
          flagged = true;
          break;
        }
      }
    }
  }

  // Milestones — upsert by global renumbered index
  if (Object.values(selections.milestones).some(Boolean)) {
    const anyPop = wpDrafts.some((wp) => wpById.get(wp.id)?.b31_populated_milestones);
    if (anyPop) {
      const { data: existing } = await supabase
        .from('b31_milestones')
        .select('number, name, wps, due_month, means_of_verification')
        .eq('proposal_id', proposalId);
      const byNum = new Map<number, any>(((existing as any[]) || []).map((m: any) => [m.number, m]));
      let idx = 0;
      let flagged = false;
      for (const wp of wpDrafts) {
        if (flagged) break;
        for (const ms of wp.milestones) {
          if (!selections.milestones[ms.id]) continue;
          idx++;
          const ex = byNum.get(idx);
          if (!ex) continue;
          const wpsValue = ms.related_wps || `WP${wp.number}`;
          if (
            (ex.name || '') !== (ms.title || '') ||
            (ex.wps || '') !== wpsValue ||
            (ex.due_month ?? null) !== (ms.due_month ?? null) ||
            (ex.means_of_verification || '') !== (ms.means_of_verification || '')
          ) {
            dirty.add('Milestones');
            flagged = true;
            break;
          }
        }
      }
    }
  }

  // Risks — upsert by global renumbered index
  if (Object.values(selections.risks).some(Boolean)) {
    const anyPop = wpDrafts.some((wp) => wpById.get(wp.id)?.b31_populated_risks);
    if (anyPop) {
      const { data: existing } = await supabase
        .from('b31_risks')
        .select('number, description, wps, likelihood, severity, mitigation')
        .eq('proposal_id', proposalId);
      const byNum = new Map<number, any>(((existing as any[]) || []).map((r: any) => [r.number, r]));
      let idx = 0;
      let flagged = false;
      for (const wp of wpDrafts) {
        if (flagged) break;
        for (const r of wp.risks) {
          if (!selections.risks[r.id]) continue;
          idx++;
          const ex = byNum.get(idx);
          if (!ex) continue;
          const wpsValue = r.related_wps || `WP${wp.number}`;
          if (
            (ex.description || '') !== (r.title || '') ||
            (ex.wps || '') !== wpsValue ||
            (ex.likelihood || null) !== (r.likelihood || null) ||
            (ex.severity || null) !== (r.severity || null) ||
            (ex.mitigation || '') !== (r.mitigation || '')
          ) {
            dirty.add('Risks');
            flagged = true;
            break;
          }
        }
      }
    }
  }

  return Array.from(dirty);
}
